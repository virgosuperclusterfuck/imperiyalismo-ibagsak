# Contributing

Thanks for helping. This is a small static site, so most changes are quick.

## Where to report what

- **A problem with a record** (wrong date, location, caption, or a clip that should be withdrawn): contact [Archive Genocide](https://archivegenocide.com/) directly. This project mirrors their data and doesn't edit it.
- **A problem with the dashboard** (a chart wrong, a number that doesn't match the data files, broken layout): open an issue using the *Bug report* template.
- **A question about how a number is computed**: open an issue using the *Data question* template, or check [DATA.md](DATA.md) first.

## Making a change

1. Fork the repository and create a branch.
2. Run the site locally: `python3 -m http.server 8000`, then open http://localhost:8000.
3. Check your change in both light and dark themes (toggle top-right) and at phone width.
4. If you changed `scripts/refresh.py`, run `python3 scripts/refresh.py --dry-run` once against the live API.
5. Open a pull request using the template.

## Ground rules for the page

- **Every figure comes from a file in `data/`.** Don't type numbers into the HTML or scripts.
- **Show data values as text** (`textContent`, d3 `.text()`), never with `innerHTML` — captions come from outside sources.
- **Keep the caveats.** Posting time isn't event time; precision 1–3 isn't an exact site; review status isn't a finding. Any new chart should say what it does and doesn't show.
- **No tracking, analytics, cookies or third-party scripts.** d3 is bundled locally; the only external request is Google Fonts.
- **Respect the people in the records.** Nothing that identifies or exposes private individuals.

## Changing the caption themes

Edit the `keyword` column of `data/keywords.csv` (one term per row) and run the refresh, or let the daily workflow pick it up.
