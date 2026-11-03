# Data dictionary

Every file in `data/` is rebuilt by [`scripts/refresh.py`](scripts/refresh.py) from the [Archive Genocide API](https://archivegenocide.com/api-docs/) (`https://api.archivegenocide.com/v1/…`). The snapshot date is the `built` field in `overview.json`.

Source: **Archive Genocide (archivegenocide.com)**. Records are free to reuse with credit; footage belongs to its filmers and captions to their authors. See the [README](README.md#data-source-and-attribution) for the full terms.

---

## `overview.json`

One object with the archive's headline totals.

| Field | Type | Meaning | Source |
|---|---|---|---|
| `clips` | integer | All records currently in the archive | `/v1/meta` → `clips` |
| `geolocated` | integer | Records with a map location | `/v1/meta` → `clips_with_location` |
| `withdrawn` | integer | Records withdrawn on request | `/v1/meta` → `withdrawn` |
| `videos` | integer | Video records with a posting date | Sum of `video` in `monthly.csv` |
| `photos` | integer | Photo records with a posting date | Sum of `total − video` in `monthly.csv` |
| `collections` | integer | Number of source collections | Length of `/v1/archives` |
| `built` | ISO 8601 UTC | When the archive last rebuilt its data | `/v1/meta` → `built_utc` |

## `monthly.csv`

One row per posting month, October 2023 to the current month.

| Column | Meaning |
|---|---|
| `month` | `YYYY-MM` |
| `total` | Records posted that month |
| `geo` | Of those, records with a map location (`has_geo=1`) |
| `video` | Of those, video records (`type=video`) |

Counted with `/v1/clips?from=…&to=…&per_page=1`, reading `total`. When a month exceeds the API's 10,000-result count, the range is split in half until each part is under it, and the parts are summed. Records without a posting date can't be placed in a month, so the sum of `total` is slightly below `clips`.

## `archives.csv`

| Column | Meaning |
|---|---|
| `name` | Source collection (channel or account plus date range), exactly as the API names it |
| `clips` | Records in that collection |

From `/v1/archives`, sorted largest first.

## `keywords.csv`

| Column | Meaning |
|---|---|
| `keyword` | Search term |
| `count` | Records whose English caption contains the term |

From `/v1/clips?q=<term>`. Under 10,000 matches, the count is read directly (undated records included); above it, the count is summed over date ranges (undated records excluded). To change the terms, edit the `keyword` column and run the refresh — the script keeps whatever terms the file already lists.

## `hospital.csv`

Every geolocated record whose caption contains "hospital" (`/v1/clips?q=hospital&has_geo=1`), with withdrawn ids removed.

| Column | Type | Meaning |
|---|---|---|
| `id` | integer | Permanent record id on the archive |
| `type` | `video` / `photo` | |
| `date` | ISO 8601 with offset, or empty | Posting time in the source's time zone. Not necessarily the event time. |
| `caption` | text | English caption (translated where needed) |
| `source_archive` | text | Collection the record came from |
| `lat`, `lon` | number | Map position |
| `precision_level` | 1–4+ | 1 town/city centre · 2 neighbourhood/camp centre · 3 named building, not verified on the ground · 4+ exact site |
| `exact` | `true` / `false` | True only for a specific, verified site |
| `confidence` | `high` / `medium` / `low` | Archive's internal review status of how closely the clip matches its documentation. Not a finding on whether an event occurred. |
| `page_url` | URL | The record's page on the archive (added by the refresh script; empty in the first snapshot) |

Only `exact = true` points mark a specific site. Treat precision 1–3 as approximate.

---

## Derived values on the page

These are computed in the browser from the files above (`assets/js/dashboard.js`):

| Value | Formula |
|---|---|
| Geolocated share | `geolocated / clips` |
| Video share | `videos / (videos + photos)` |
| Hospital slice per month | Rows of `hospital.csv` counted by the first 7 characters of `date` |
| Location precision | Rows of `hospital.csv` counted by `precision_level` (4+ grouped) |
| Exact-site share | Rows with `exact = true` / all rows |
