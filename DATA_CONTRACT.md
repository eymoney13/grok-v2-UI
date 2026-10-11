# Data contract

The California board reads beach data through `lib/neptuneAdapter.ts`. Parsers for columns and file shapes live in `lib/neptuneContract.ts`. A renamed column or path is a change in those two files.

`/california` uses this roster instead of the hardcoded `stations[]` list in `lib/data.ts` when the roster file is present. Other boards keep their own published CSVs. If the roster file is missing, `/california` falls back to `stations[]` and `public/data/southbay`.

## Where files are read

1. `NEPTUNE_V2_DIR`, when set, is a local checkout. That path skips the network. `NEPTUNE_V2_REMOTE=off` also skips it.
2. Otherwise the app asks `eymoney13/project-neptune-v2` `main` for the latest files at runtime (`lib/neptuneRemote.ts`). `raw.githubusercontent.com` is tried first. A failed probe is retried against the GitHub contents API with `Accept: application/vnd.github.raw`. A token in `NEPTUNE_V2_GITHUB_TOKEN`, `GITHUB_TOKEN`, or `GH_TOKEN` is sent as a bearer token on both. Required files are `outputs/daily/current.csv` and `data/roster.json`. Also requested, and optional: `outputs/run_manifest.json`, `config/neptune_index_bands.json`, and `config/staleness_thresholds.json`. A 404 on an optional file does not reject a snapshot that has the two required files. The bytes are written under the OS temp directory for that process and are not committed.
3. When that fetch fails, the committed `data/neptune-v2/` snapshot in this repo is the fallback.
4. Any wide CSV that is not in that tree is read from `public/data/<dataSlug>/`.

This environment’s GitHub credential can read `eymoney13/grok-v2-UI` only. Reading `eymoney13/project-neptune-v2` failed on every method tried: `gh api repos/eymoney13/project-neptune-v2` returned HTTP 404 `{"message":"Not Found","status":"404"}`; the contents API for `outputs/run_manifest.json` returned the same 404; `git ls-remote` returned `remote: Repository not found.`; unauthenticated `raw.githubusercontent.com` returned HTTP 404 `404: Not Found`; the contents API and the zipball, both with the available token, returned HTTP 404; the installation can see only `eymoney13/grok-v2-UI`. No method returned the files, so the committed snapshot was not replaced and it still has no `outputs/daily/current.csv`. The daily column list below is the set named for that publish, matched by header name. It is not a pasted copy of a header line. Extra columns in the file are ignored. The files under `data/neptune-v2/` are a local sample in the live shape, reshaped from `public/data/southbay`. They are not a copy of the statewide inventory. Do not treat the sample’s station count as the live roster. Orange County’s roster is expected to change, so the UI counts whatever the file contains.

Regenerate the sample with `node scripts/build-v2-sample.mjs`.

## Live in the v2 contract

These paths and columns were confirmed from `project-neptune-v2` main (PR #1). The sample includes them. The adapter accepts the aliases listed in `lib/neptuneContract.ts` as well as the names below.

### `data/roster.json` and `data/roster.csv`

`config/regions/california.json` points at the roster (`roster`).

| Field | Use |
| --- | --- |
| `station_code` | Station code, kept as text (`0` stays `"0"`). It is not unique across agencies. | 
| `station_key` | Optional unique id, format `agency\|station_code` (v2 main `8b92e31`, PR #7). When the cell is filled, the path is the beach-name slug, `--`, then the key with the pipe replaced: `huntington-state-beach--orange-county~0` for `Orange County\|0`. The `~` is the pipe. The link has no raw `\|`. That encoded key still opens the beach if the name prefix is old or missing, and the page redirects to the current slug. A blank cell falls back to `station_code` plus `agency` when that column exists, and otherwise to the beach name, county, and code. |
| `name` | Beach name shown on the board. |
| `lat`, `lon` | Map position. A finite point outside a loose West Coast box (31.5–42.5°N, 125–114°W) stays on the beach and in search. That box includes monitored beaches just south of the border in Baja California. It is not drawn, not used for near-me distance, and is logged when the board data loads and when this sample is rebuilt. A blank coordinate is not that case. The word `Unknown` in a lat or lon cell is not a number. |
| `county` | County filter and grouping. A trailing “County” is ignored when matching. |
| `last_sample_date` | Date of the last lab sample, `YYYY-MM-DD`. |
| `sampling_frequency` | Shown only when the file has a value. |
| `tier` | `model_pool` or `limited_data`. An Elevated risk call on `limited_data` is drawn in the grey, italic, dashed style used for low confidence, with the note “Limited testing history, so this is a cautious estimate.” A `model_pool` call keeps the full-strength Elevated risk color. The confidence column does not change that choice. The mapping is `TIER_ELEVATED_STYLE` in `lib/tierCallStyle.ts`. |
| `agency` | Optional. Present only when the file has that column. A blank cell stays blank. When `station_key` is blank and this column is present, a repeated `station_code` is a different beach when the agency differs. |
| `location_status` | Optional. The word `Unknown` means the coordinates are not a map position. The beach stays in the list and in search, and is left off the map and out of near-me sorting. `ok` or a blank cell does not do that. The same word on `call`, `prediction`, or `final_status` is the rules-path no-call, not this flag. `posting_status: unknown` is not this flag. Also read as `locationStatus`, `coord_status`, `coordinate_status`, `coordinates_status`, `lat_lon_status`, and `location_quality`. |
| `bad_location` | Optional flag. `true` or `Unknown` means the same as `location_status: Unknown`. Also read as `location_unknown`, `invalid_location`, `location_flag`, and `coordinates_flag`. The sample files do not include either column. |

JSON may be a bare array or an object with `stations`, `beaches`, `roster`, or `records`.

In the sample, `tier` is `model_pool` for every station that has a published nowcast. That is a stand-in, not the live inventory’s tier. `sampling_frequency` is blank. `last_sample_date` is `prediction_date` minus `days_since_sample` from the published nowcast.

### `outputs/forecast_archive/forecasts.csv`

| Field | Use |
| --- | --- |
| `station_code` | Join key, together with `agency` when that column is present. A repeated code with no agency is not applied to every roster beach that shares it. |
| `forecast_date` | Day the forecast was issued. The latest date wins. |
| `target_date` | Day the estimate is for. |
| `lead_days` | `0` is the same-day nowcast. `1`–`3` are the experimental look-ahead. |
| `probability` | Exceedance probability. Values from 0 to 1 are fractions. Values above 1 and at most 100 are percents. |
| `call` | `Safe` or `Unsafe`. An `Unsafe` call is a precautionary model flag. The site shows Elevated risk, not “Over the limit.” Those words, and Closed / Warning for official postings, live in `lib/readerLabels.ts`. |
| `threshold` | Model cutoff, same fraction/percent rule as `probability`. |
| `publish_timestamp_utc` | Shown when present. |
| `model_version` | Shown as small print when present. |
| `last_sample_date` | Overrides the roster date when present. |
| `last_sample_age_days` | “Last tested N days ago.” |
| `fallback_used` | A true value adds “This estimate used a fallback method.” Blank means unknown, not false. |

The sample copies probability, call, and sample age from the published nowcast and `forecast_3day.csv`. Publish time, model version, and fallback are blank.

### `config/staleness_thresholds.json`

Per-county limit in days, used for the limited-lab notice. Accepted shapes:

- `{ "default_days": 7, "counties": { "Orange": 14 } }`
- `{ "Orange County": 14 }` (a flat map)
- `{ "thresholds": [{ "county": "Orange", "days": 14 }] }`

A county limit beats `default_days`. With no file, the board uses 7 days, the same rule as the UX audit. The sample sets `default_days` to 7 and leaves `counties` empty so a later Orange County refresh does not require a code change.

### `config/regions/california.json`

`roster` is the roster path. `regions` is a list of `{ "name", "counties" }`. The region filter is hidden when that list is empty. The sample’s list is empty.

### Wide nowcast and forecast CSVs

Looked up, in order, as `outputs/<file>`, `outputs/california/<file>`, `data/<file>`, and `<file>`:

- `nowcast_latest.csv`
- `forecast_3day.csv`
- `history_3day.csv`
- `accuracy.csv`
- `thresholds.csv`

These keep the published column layout (factors, conditions, insight, lab result, `days_since_sample`). The archive wins for probability, call, threshold, sample age, fallback, model version, and publish time when both describe the same station. Factors and the lab history chart still come from the wide files. The sample copies the published South Bay files into `outputs/`.

## Live daily file

Confirmed on `project-neptune-v2` main, PR #6, commit `b60b5cd`. That publish covered 678 stations. The board does not hardcode that count. This environment still cannot open that repository, so this note does not state how many `station_code` values repeat in `current.csv`. The parser keeps a repeated code as more than one beach when the row distinguishes it.

| Path | Use |
| --- | --- |
| `outputs/daily/current.csv` | Primary daily file. `outputs/daily/current.json` is accepted with the same fields. `station_code` can repeat. A filled `station_key` is the beach: the same key’s last row wins, and two keys that share a code stay separate. Without `station_key`, an `agency` column keeps those rows apart, and otherwise a name or county does. A repeated code with none of those fields is not copied onto every roster beach that shares the code. |
| A dated file in the same directory, `outputs/daily/YYYY-MM-DD.csv` or `.json` | History. Used only when no current file exists. The newest date wins. |
| Older names, only if none of the above exist: `daily_status.csv`, `daily_status.json` (same folders as the wide CSVs), then the newest dated file in `outputs/daily/history`, `outputs/daily_status`, or `outputs/status_history` | Fallback for an earlier layout. A `daily_status` file with no lead column is this older shape. |

An empty current file does not fall through to history. A missing file stays null. The same daily columns are also read from archive lead 0 and from the wide nowcast. Merge order is the daily file, then archive lead 0, then the wide nowcast. The first non-null value wins, and an explicit false is kept.

Columns named for this file:

| Field | Use |
| --- | --- |
| `station_key` | Same `agency\|station_code` value as the roster. The daily row joins on this raw value. The public path uses the URL-safe form described on the roster. | 
| `station_code` | Same text code as the roster. Not a global id. | 
| `agency` | Optional. Read only when the header includes `agency`. Blank stays blank. Used when `station_key` is blank. | 
| `name`, `county` | Optional on this file. When `agency` is absent, they keep two rows with the same `station_code` apart. | 
| `generated_at` | “Last updated,” after `outputs/run_manifest.json` and before a `generated_at` column on the wide nowcast. |
| `posting_status` | `closure`, `warning`, `advisory`, `open`, or `unknown`. Also accepts `closed` for a closure. Any other word is ignored. A closure is shown as Closed and a warning as Warning. Those words are not used for a model call. |
| `posting_source` | Credited on a closure, warning, advisory, or open check. Blank stays blank. |
| `posting_fetched_at` | Preferred county check time. The calendar day is shown next to an `open` posting. `posting_date`, `checked_date`, and `as_of` are still accepted when this cell is blank. If every date cell is blank and the row or the file has `generated_at`, that calendar day is used. The model prediction date is not the county date. |
| `call`, `prediction` | The call on this daily row. A filled cell wins over the archive and the wide nowcast. The word `Unknown` is “Not enough recent data to call,” including when `probability` is blank. A blank cell does not override an older call. |
| `probability`, `exc_probability` | Exceedance probability on this row. A blank cell stays null. It is not stored as 0. A filled cell is used when the wide nowcast has no row, and it wins over the archive and the nowcast. The date is `prediction_date`, then `forecast_date`, then `date`, and otherwise the `YYYY-MM-DD` prefix of the daily file clock. Without both a probability and a date, the row is not turned into an estimate. |
| `final_status` | The label on a closure, warning, or advisory, such as “Beach closed.” The word `Unknown` is not that label. It means the rules path did not have enough recent data to call, and the page says “Not enough recent data to call.” That is not a Safe reading, and it is not the same as `posting_status: unknown`. A blank probability next to that word stays blank. On its own, or next to `open` or posting `unknown`, any other `final_status` does not override the prediction. |
| `method` | `model`, `pooled model` (also `pooled_model`), or `rules`. Also `estimate_method`. Plain words: “Based on this beach’s model.”, “Based on a pooled model, shared across beaches.”, or “Based on last lab test + rain rule.” An unknown value is ignored. |
| `confidence` | `high`, `medium`, or `low`. Also `confidence_level`. Shown in words. Low confidence says it is less certain than a high-confidence reading, and it is drawn in italics with a dashed border. It is not colored like a status. A number is not a confidence level. It does not choose the Elevated risk style: a high confidence on `limited_data` still uses the cautious style, and a low confidence on `model_pool` still uses the full-strength color. |
| `neptune_index`, `neptune_band` | Same display rules as on the nowcast. On this publish both columns are empty. An empty cell stays null, and the board does not calculate an index. When a later publish fills them, the daily value is preferred over the archive and the wide nowcast. |

A closure, warning, or advisory is shown first, in a dark panel, and overrides our status. The model estimate stays visible under “Our estimate.” A warning still leads when that estimate is on the safe side of the limit (Under the limit). `open` is “No active county postings today,” with the source and the check date. It does not override our status and it is not shown as safe. `unknown` is “No official posting data for this beach” on the beach page, with no badge on the list or map, and it is not shown as safe. A blank posting cell stays quiet, which is not the same as `unknown`.

## Optional retrain outputs

Named for project-neptune-v2 draft PR #4, which is not merged. This environment cannot open that repository, so the columns below are the ones named for that publish, matched by header. They are not a pasted copy of the file. The sample does not include them. When the files are absent, the board keeps reading `outputs/daily/current.csv` and labels every look-ahead day Experimental.

| Path | Use |
| --- | --- |
| `outputs/daily_status.csv` (or `.json`) with a lead column | Optional. One row per station per lead `0`–`3`. `method` is `model`, `pooled_model`, or `rules`. `confidence` is `high`, `medium`, or `low`. While `outputs/daily/current.csv` exists, that current file still supplies postings and any method or confidence the new file leaves blank. Lead 0 on the new file fills those two fields when its cells are filled. If the current file is missing, lead 0 of this file is the daily file, and dated history is not used. A `daily_status` file with no lead column stays the older one-row fallback. |
| `day0_release` … `day3_release` on `outputs/daily/current.csv` and on `outputs/daily_status.csv` | Optional. Values are `go_live` or `experimental`. `dayNRelease` and `dayN-release` are the same header. This is the only go-live column. `dayN_go_live`, `dayN_maturity`, `dayN_release_status`, a bare `go_live` or `release`, and any column whose name contains `confidence` are not this mark. `forecast_3day.csv` is not a source. |

A look-ahead day drops the Experimental label only when that lead’s `dayN_release` is `go_live`. A filled cell on `outputs/daily/current.csv` wins over `outputs/daily_status.csv`. A blank cell does not override a filled one. On a long daily-status file, `dayN_release` on the row for that lead is the mark; the same columns on another lead’s row fill a day the lead row left blank. `dayN_confidence`, `lead_confidence`, and `forecast_confidence` are not that mark. `high`, `medium`, and `low` are not that mark. A blank cell, an unrecognized word, and a missing column all stay Experimental. No station list is hardcoded. `day0_release` is read and does not label the same-day reading. `FORECAST_HORIZON_MODE` can still hide the whole look-ahead.

## Pending, read when present

Not in the sample, because they are not published yet. The adapter already accepts them and the page stays quiet when they are absent.

| Input | What the board does |
| --- | --- |
| `outputs/run_manifest.json` with `generated_at`, `model_version`, `stale_counties`, `checks_passed` | `generated_at` becomes “Last updated.” `stale_counties` is a banner on the public home, the beach page, and the California board: “The latest run marked these counties stale: ….” In Spanish: “La última ejecución marcó estos condados como desactualizados: ….” A comma-separated string is accepted. An object uses `county` or `name`, and `stale`, `flagged`, or `is_stale`; `false`, `0`, and `"false"` are skipped. The same fields under `stats`, `summary`, or `run` are used when the top level is empty, including nested `generated_at`, `model_version`, and `checks_passed`. `checks_passed: false` is a caution banner on the California board only. A missing file, or a file that names no county, adds no stale banner. |
| `generated_at` as a column on the nowcast or archive | Same “Last updated” clock, in the board’s timezone, used when the manifest and the daily file are both blank. |
| `rain_advisory` or `recent_rain`, and `method` is `rules` | “Rain advisory. The rules path flagged recent rain.” A published rain total, including zero, does not create this note. |
| A calibrated probability column on the nowcast, forecast, or archive. Names tried, in order: `calibrated_probability`, `calibrated_exc_probability`, `p_calibrated` | A second line, “Calibrated estimate,” labeled as a model figure, not a lab result. |
| A per-beach pipeline note. Names tried, in order: `confidence_flag`, `confidenceFlag`, `model_confidence`, `beach_confidence`. If none of those is set, a non-numeric `confidence` that is not `high`, `medium`, or `low` is used. | Shown as “Pipeline note,” with the words “Not a guarantee about today.” A numeric value is ignored so it cannot be read as a confidence percent. `confidence: high` is the confidence level, not this note. The past-lab panel stays “Past lab agreement.” |
| `neptune_index` on the daily file, the nowcast, or archive lead 0. Also accepted as `neptuneIndex`. | A number on a 0–100 scale where a higher number is cleaner. The board does not calculate this number from a probability. A value outside the scale in `config/neptune_index_bands.json` (0–100 when that file omits the ends, or when the file is absent) is ignored. The daily file is checked first. |
| `neptune_band` on the daily file, the nowcast, or archive lead 0. Also accepted as `neptuneBand`. | The published band word. It is shown as written, including a word the bands file does not list. It is not replaced by a cutoff. When the cell is empty and the bands file is present, the number is placed on the inclusive ranges for that beach’s roster tier. A `rules` row is not placed on those ranges. |
| `config/neptune_index_bands.json` on the active v2 root | Optional. Band labels and cutoffs. A tier table (`tiers` or `by_tier`) can list any number of bands. This copy’s `model_pool` table is Poor 0–84, Caution 85–97, Good 98–100. Its `limited_data` table is Poor 0–94 and Good 95–100, with no Caution band. A tier the file does not name does not borrow another tier’s cutoffs. A `NEPTUNE_V2_DIR` that has no file does not borrow another tree’s cutoffs. |

## What the board will not invent

- No probability, Safe/Unsafe call, or MPN for a roster station that has neither a nowcast row, an archive lead of 0, nor a filled `probability` with a date on `outputs/daily/current.csv`. That beach is listed as “No estimate today.” A current row whose `call`, `prediction`, or `final_status` is `Unknown` and whose probability is blank stays on the list as “Not enough recent data to call.” It is not dropped, and the blank cell is not turned into Safe.
- No sampling frequency, model version, publish time, or fallback when the cell is blank.
- No county staleness limit beyond `default_days` or the 7-day fallback.
- No region until `regions` names one.
- No confidence score, and no high / medium / low label unless the file says so.
- No official override unless `posting_status` is `closure`, `warning`, or `advisory`. `open` and `unknown` are not rendered as safe. `final_status` alone does not override our estimate, and no agency name is invented when `posting_source` is blank. A missing posting cell is not turned into `unknown`. The word `Unknown` on `call`, `prediction`, `dayN_call`, `dayN_prediction`, or `final_status` is “Not enough recent data to call.” It is not filled in from the probability as Safe, Good, or under the limit. A published Neptune Index can still be shown beside that sentence.
- No rain advisory from a rain total. The note appears only when the method is `rules` and the file sets the rain flag to true.
- No Neptune Index number unless `neptune_index` is present and inside the active scale. No band name is invented when both fields are empty. A published `neptune_band` is kept. The percentage is never converted into an index. The band is chosen from that beach’s tier table, so the same number can be a different band on another tier. A `rules` row is not given a band from a cutoff. Its number stays uncolored, with the lab-test and rain note. An official warning or closure can label a shown band Poor. It does not paint a band onto a score that has none. An advisory cannot, and a posting never creates an index by itself.
- No look-ahead day is taken off the Experimental label unless `dayN_release` on `outputs/daily/current.csv` or `outputs/daily_status.csv` is `go_live`. `forecast_3day.csv` does not do it. A confidence column, including one whose cell says `go_live`, does not do it. A high confidence, a `model` method, or a station code does not do it.
