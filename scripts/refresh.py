#!/usr/bin/env python3
"""
Rebuild the dashboard's data/ files from the Archive Genocide API.

    python scripts/refresh.py            # writes data/*.csv and data/overview.json
    python scripts/refresh.py --dry-run  # fetches everything, writes nothing

API reference: https://archivegenocide.com/api-docs/
- No key needed. 120 requests/minute; 429 responses carry Retry-After.
- A search counts at most 10,000 results (`total_is_lower_bound` is then true),
  so large counts are split into date ranges and summed.
- Withdrawn clips must be removed from any copy; this script drops every id
  listed by /v1/withdrawn from the records it writes.

Standard library only, so it runs on a bare GitHub Actions runner.
Nothing is written unless every request succeeds, so the site never publishes
a half-finished snapshot.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("ARCHIVE_API_BASE", "https://api.archivegenocide.com").rstrip("/")
USER_AGENT = "imperiyalismo-ibagsak/1.0 (+https://github.com/virgosuperclusterfuck/imperiyalismo-ibagsak)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

FIRST_MONTH = dt.date(2023, 10, 1)  # the archive starts in October 2023
SLICE_TERM = "hospital"             # the focus slice: geolocated records mentioning this word
DEFAULT_KEYWORDS = [
    "hospital", "school", "children", "airstrike", "ambulance", "journalist",
    "aid", "famine", "shelter", "camp", "mosque", "drone",
]
MIN_INTERVAL = 0.55  # seconds between requests -> ~109/minute, under the 120 limit
CAP = 10_000


class ApiError(RuntimeError):
    pass


# ---------------------------------------------------------------- HTTP

_last_call = 0.0
calls = 0


def get(path: str, params: dict | None = None, attempts: int = 6) -> dict:
    """GET a JSON endpoint, pacing requests and retrying 429/503/network errors."""
    global _last_call, calls
    query = urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v is not None})
    url = f"{BASE}{path}" + (f"?{query}" if query else "")
    delay = 2.0
    for attempt in range(1, attempts + 1):
        wait = MIN_INTERVAL - (time.monotonic() - _last_call)
        if wait > 0:
            time.sleep(wait)
        _last_call = time.monotonic()
        calls += 1
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.load(res)
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", "replace")[:300]
            if err.code == 429:
                retry = float(err.headers.get("Retry-After") or delay)
                log(f"  429 rate-limited, waiting {retry:.0f}s")
                time.sleep(retry)
                continue
            if err.code in (500, 502, 503, 504) and attempt < attempts:
                log(f"  {err.code} from API, retrying in {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
                continue
            raise ApiError(f"{err.code} for {url}: {body}") from err
        except (urllib.error.URLError, TimeoutError) as err:
            if attempt < attempts:
                log(f"  network error ({err}), retrying in {delay:.0f}s")
                time.sleep(delay)
                delay *= 2
                continue
            raise ApiError(f"network error for {url}: {err}") from err
    raise ApiError(f"gave up after {attempts} attempts: {url}")


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- dates

def month_starts(first: dt.date, last: dt.date) -> list[dt.date]:
    out, d = [], first.replace(day=1)
    while d <= last:
        out.append(d)
        d = (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    return out


def month_end(d: dt.date) -> dt.date:
    return (d.replace(day=28) + dt.timedelta(days=4)).replace(day=1) - dt.timedelta(days=1)


def iso(d: dt.date) -> str:
    return d.isoformat()


# ---------------------------------------------------------------- counting

def count_range(params: dict, start: dt.date, end: dt.date) -> int:
    """Clips matching params posted between start and end (inclusive).
    Splits the range in half whenever the API's 10,000 cap is hit."""
    page = get("/v1/clips", {**params, "from": iso(start), "to": iso(end), "per_page": 1})
    if not page.get("total_is_lower_bound"):
        return int(page["total"])
    if start >= end:
        log(f"  warning: over {CAP:,} matches on a single day ({start}); count is a lower bound")
        return int(page["total"])
    mid = start + (end - start) // 2
    return count_range(params, start, mid) + count_range(params, mid + dt.timedelta(days=1), end)


def count_all(params: dict, start: dt.date, end: dt.date) -> int:
    """Count with no date filter when under the cap (keeps undated records);
    otherwise sum date ranges."""
    page = get("/v1/clips", {**params, "per_page": 1})
    if not page.get("total_is_lower_bound"):
        return int(page["total"])
    return count_range(params, start, end)


# ---------------------------------------------------------------- records

def fetch_pages(params: dict) -> tuple[list[dict], bool]:
    """All results for params, 100 per page. Returns (records, capped)."""
    first = get("/v1/clips", {**params, "per_page": 100, "page": 1, "sort": "id"})
    records = list(first["results"])
    for page in range(2, int(first.get("pages") or 1) + 1):
        records.extend(get("/v1/clips", {**params, "per_page": 100, "page": page, "sort": "id"})["results"])
    return records, bool(first.get("total_is_lower_bound"))


def fetch_slice(params: dict, months: list[dt.date]) -> list[dict]:
    records, capped = fetch_pages(params)
    if not capped:
        return records
    # Over the cap: fetch month by month instead. (Undated records can't be
    # reached by a date filter, so they drop out in this case only.)
    log(f"  slice is over {CAP:,} records; fetching by month")
    records = []
    for m in months:
        part, capped = fetch_pages({**params, "from": iso(m), "to": iso(month_end(m))})
        if capped:
            log(f"  warning: {m:%Y-%m} alone is over {CAP:,} records; some are missing")
        records.extend(part)
    return records


def slim(rec: dict) -> dict:
    geo = rec.get("geo") or {}
    return {
        "id": rec.get("id"),
        "type": rec.get("type", ""),
        "date": rec.get("date") or "",
        "caption": rec.get("caption", ""),
        "source_archive": rec.get("source_archive", ""),
        "lat": geo.get("lat", ""),
        "lon": geo.get("lon", ""),
        "precision_level": geo.get("precision_level", ""),
        "exact": "true" if geo.get("exact") else "false",
        "confidence": rec.get("confidence", ""),
        "page_url": rec.get("page_url", ""),
    }


# ---------------------------------------------------------------- output

def to_csv(rows: list[dict], columns: list[str]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    return buf.getvalue()


def existing_keywords() -> list[str]:
    path = DATA_DIR / "keywords.csv"
    if path.exists():
        with path.open(newline="", encoding="utf-8") as f:
            terms = [r["keyword"].strip() for r in csv.DictReader(f) if r.get("keyword", "").strip()]
        if terms:
            return terms
    return DEFAULT_KEYWORDS


def previous_slice_size() -> int:
    path = DATA_DIR / "hospital.csv"
    if not path.exists():
        return 0
    with path.open(newline="", encoding="utf-8") as f:
        return sum(1 for _ in csv.DictReader(f))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="fetch everything but write nothing")
    ap.add_argument("--allow-shrink", action="store_true",
                    help="write even if the hospital slice shrank by more than half")
    args = ap.parse_args()

    today = dt.datetime.now(dt.timezone.utc).date()
    months = month_starts(FIRST_MONTH, today)
    started = time.monotonic()

    log("Meta, collections and withdrawn ids…")
    meta = get("/v1/meta")
    archives = get("/v1/archives")["archives"]
    withdrawn = set(get("/v1/withdrawn").get("ids", []))

    log(f"Monthly counts for {len(months)} months…")
    monthly = []
    for m in months:
        a, b = m, min(month_end(m), today)
        row = {
            "month": f"{m:%Y-%m}",
            "total": count_range({}, a, b),
            "geo": count_range({"has_geo": 1}, a, b),
            "video": count_range({"type": "video"}, a, b),
        }
        monthly.append(row)
        log(f"  {row['month']}: {row['total']:,} records")

    keywords = existing_keywords()
    log(f"Caption theme counts for {len(keywords)} terms…")
    kw_rows = []
    for term in keywords:
        n = count_all({"q": term}, FIRST_MONTH, today)
        kw_rows.append({"keyword": term, "count": n})
        log(f"  {term}: {n:,}")

    log(f"Geolocated records mentioning '{SLICE_TERM}'…")
    raw = fetch_slice({"q": SLICE_TERM, "has_geo": 1}, months)
    seen, hospital = set(), []
    for rec in raw:
        if rec.get("id") in seen or rec.get("id") in withdrawn or not rec.get("geo"):
            continue
        seen.add(rec["id"])
        hospital.append(slim(rec))
    log(f"  {len(hospital):,} records")

    videos = sum(r["video"] for r in monthly)
    dated = sum(r["total"] for r in monthly)
    overview = [{
        "clips": meta["clips"],
        "geolocated": meta["clips_with_location"],
        "withdrawn": meta["withdrawn"],
        "videos": videos,
        "photos": dated - videos,
        "collections": len(archives),
        "built": meta["built_utc"],
    }]

    # Guard: a sudden collapse in the slice is far more likely an API problem
    # than real data, so don't publish it without a human look.
    before = previous_slice_size()
    if before and len(hospital) < before / 2 and not args.allow_shrink:
        log(f"Refusing to write: hospital slice fell from {before:,} to {len(hospital):,} rows. "
            "Re-run with --allow-shrink if that is real.")
        return 2

    files = {
        "overview.json": json.dumps(overview, ensure_ascii=False) + "\n",
        "monthly.csv": to_csv(monthly, ["month", "total", "geo", "video"]),
        "archives.csv": to_csv(sorted(archives, key=lambda a: -a["clips"]), ["name", "clips"]),
        "keywords.csv": to_csv(kw_rows, ["keyword", "count"]),
        "hospital.csv": to_csv(hospital, list(slim({}).keys())),
    }

    log(f"Done: {calls} requests in {time.monotonic() - started:.0f}s. Archive built {meta['built_utc']}.")
    if args.dry_run:
        log("Dry run: nothing written.")
        return 0

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for name, text in files.items():
        tmp = DATA_DIR / f".{name}.tmp"
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(DATA_DIR / name)
        log(f"  wrote data/{name}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except ApiError as err:
        log(f"Error: {err}")
        log("Nothing was written.")
        sys.exit(1)
