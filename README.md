# Gaza Documentation Archive — story pages

Six linked story pages built on the public [Archive Genocide](https://archivegenocide.com/) API
(snapshot of 2 Nov 2026). Each page is plain HTML, CSS and JavaScript with its data as local CSV/JSON
files; the only outside scripts are d3 v7 from cdnjs and, on the timelapse page, deck.gl 8.9.36 from unpkg.

| Folder | Page |
|---|---|
| `/` (this folder) | Every post, kept — the archive and the way in |
| `where-the-footage-points/` | 3D space-time column of geolocated footage |
| `hospitals-in-the-frame/` | Nine named hospitals as 3D towers |
| `what-gets-documented/` | 3D ridgeline of twelve caption words |
| `who-keeps-the-record/` | 3D city of the source collections |
| `documentation-outlook/` | A plain six-month guess, with its limits |
| `the-map-as-it-filled/` | 3D timelapse of all geolocated records, with a hospital layer |
| `what-the-record-shows/` | Takeaway: the narrative, its impacts, and who can use it |

## Publish on GitHub Pages
1. Copy everything in this folder to the root of your repository (keep the folder structure).
2. On GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, pick your branch and `/ (root)`.
3. Your site appears at `https://<username>.github.io/<repo>/`.

Pages fetch their data files, so open them through a web server (GitHub Pages, or `python3 -m http.server`
locally), not by double-clicking the HTML file.

## Data and credit
Records: Archive Genocide (https://archivegenocide.com/). Captions come from the channels and journalists
who posted the footage; a record documents what was posted and when, not a verified finding.
Withdrawn records are excluded. Please credit Archive Genocide and link to the original records when reusing.
