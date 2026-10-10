# Data contract

The California board reads beach data through `lib/neptuneAdapter.ts`. Parsers for columns and file shapes live in `lib/neptuneContract.ts`. A renamed column or path is a change in those two files.

`/california` uses this roster instead of the hardcoded `stations[]` list in `lib/data.ts` when the roster file is present. Other boards keep their own published CSVs. If the roster file is missing, `/california` falls back to `stations[]` and `public/data/southbay`.

## Where files are read

1. `NEPTUNE_V2_DIR`, when set, should be the root of a `project-neptune-v2` checkout.
2. Otherwise `data/neptune-v2/` in this repo.
3. Any wide CSV that is not in that tree is read from `public/data/<dataSlug>/`.

This environment’s GitHub credential can read `eymoney13/grok-v2-UI` only. It cannot open `eymoney13/project-neptune-v2`, so the daily column list below is the set named for that publish, matched by header name. It is not a pasted copy of the header line from commit `b60b5cd`. Extra columns in the file are ignored. The files under `data/neptune-v2/` are a local sample in the live shape, reshaped from `public/data/southbay`. They are not a copy of the statewide inventory and they do not include `outputs/daily/current.csv`. Do not treat the sample’s station count as the live roster. Orange County’s roster is expected to change, so the UI counts whatever the file contains.

Regenerate the sample with `node scripts/build-v2-sample.mjs`.

## Live in the v2 contract

These paths and columns were confirmed from `project-neptune-v2` main (PR #1). The sample includes them. The adapter accepts the aliases listed in `lib/neptuneContract.ts` as well as the names below.

### `data/roster.json` and `data/roster.csv`

`config/regions/california.json` points at the roster (`roster`).

| Field | Use |
| --- | --- |
| `station_code` | Station id. The code `0` is Huntington State Beach and is kept as text. |
| `name` | Beach name shown on the board. |
| `lat`, `lon` | Map position. |
| `county` | County filter and grouping. A trailing “County” is ignored when matching. |
| `last_sample_date` | Date of the last lab sample, `YYYY-MM-DD`. |
| `sampling_frequency` | Shown only when the file has a value. |
| `tier` | `model_pool` or `limited_data`. |

JSON may be a bare array or an object with `stations`, `beaches`, `roster`, or `records`.

In the sample, `tier` is `model_pool` for every station that has a published nowcast. That is a stand-in, not the live inventory’s tier. `sampling_frequency` is blank. `last_sample_date` is `prediction_date` minus `days_since_sample` from the published nowcast.

### `outputs/forecast_archive/forecasts.csv`

| Field | Use |
| --- | --- |
| `station_code` | Join key. |
| `forecast_date` | Day the forecast was issued. The latest date wins. |
| `target_date` | Day the estimate is for. |
| `lead_days` | `0` is the same-day nowcast. `1`–`3` are the experimental look-ahead. |
| `probability` | Exceedance probability. Values from 0 to 1 are fractions. Values above 1 and at most 100 are percents. |
| `call` | `Safe` or `Unsafe`. |
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

Confirmed on `project-neptune-v2` main, PR #6, commit `b60b5cd`. That publish covered 678 stations. The board does not hardcode that count.

| Path | Use |
| --- | --- |
| `outputs/daily/current.csv` | Primary daily file. `outputs/daily/current.json` is accepted with the same fields. One row per station. The last row for a station wins. |
| A dated file in the same directory, `outputs/daily/YYYY-MM-DD.csv` or `.json` | History. Used only when no current file exists. The newest date wins. |
| Older names, only if none of the above exist: `daily_status.csv`, `daily_status.json` (same folders as the wide CSVs), then the newest dated file in `outputs/daily/history`, `outputs/daily_status`, or `outputs/status_history` | Fallback for an earlier layout. |

An empty current file does not fall through to history. A missing file stays null. The same daily columns are also read from archive lead 0 and from the wide nowcast. Merge order is the daily file, then archive lead 0, then the wide nowcast. The first non-null value wins, and an explicit false is kept.

Columns named for this file:

| Field | Use |
| --- | --- |
| `generated_at` | “Last updated,” after `outputs/run_manifest.json` and before a `generated_at` column on the wide nowcast. |
| `posting_status` | `closure`, `warning`, `advisory`, `open`, or `unknown`. Also accepts `closed` for a closure. Any other word is ignored. |
| `posting_source` | Credited on a closure, warning, advisory, or open check. Blank stays blank. |
| `posting_fetched_at` | Preferred county check time. The calendar day is shown next to an `open` posting. `posting_date`, `checked_date`, and `as_of` are still accepted when this cell is blank. If every date cell is blank and the row or the file has `generated_at`, that calendar day is used. The model prediction date is not the county date. |
| `final_status` | The label on a closure, warning, or advisory. On its own, or next to `open` or `unknown`, it does not override the prediction. |
| `method` | `model`, `pooled model`, or `rules`. Also `estimate_method`. Plain words: “Based on this beach’s model.”, “Based on a pooled model, shared across beaches.”, or “Based on last lab test + rain rule.” An unknown value is ignored. |
| `confidence` | `high`, `medium`, or `low`. Also `confidence_level`. Shown in words. Low confidence says it is less certain than a high-confidence reading, and it is drawn in italics with a dashed border. It is not colored like a status. A number is not a confidence level. |
| `neptune_index`, `neptune_band` | Same display rules as on the nowcast. On this publish both columns are empty. An empty cell stays null, and the board does not calculate an index. When a later publish fills them, the daily value is preferred over the archive and the wide nowcast. |

A closure, warning, or advisory is shown first, in a dark panel, and overrides our status. The model estimate stays visible under “Our estimate.” A warning still leads when that estimate is on the safe side of the limit (Under the limit). `open` is “No active county postings today,” with the source and the check date. It does not override our status and it is not shown as safe. `unknown` is “No official posting data for this beach” on the beach page, with no badge on the list or map, and it is not shown as safe. A blank posting cell stays quiet, which is not the same as `unknown`.

## Pending, read when present

Not in the sample, because they are not published yet. The adapter already accepts them and the page stays quiet when they are absent.

| Input | What the board does |
| --- | --- |
| `outputs/run_manifest.json` with `generated_at`, `model_version`, `stale_counties`, `checks_passed` | `generated_at` becomes “Last updated.” `stale_counties` is a banner. `checks_passed: false` is a caution banner. A missing file adds no banner. |
| `generated_at` as a column on the nowcast or archive | Same “Last updated” clock, in the board’s timezone, used when the manifest and the daily file are both blank. |
| `rain_advisory` or `recent_rain`, and `method` is `rules` | “Rain advisory. The rules path flagged recent rain.” A published rain total, including zero, does not create this note. |
| A calibrated probability column on the nowcast, forecast, or archive. Names tried, in order: `calibrated_probability`, `calibrated_exc_probability`, `p_calibrated` | A second line, “Calibrated estimate,” labeled as a model figure, not a lab result. |
| A per-beach pipeline note. Names tried, in order: `confidence_flag`, `confidenceFlag`, `model_confidence`, `beach_confidence`. If none of those is set, a non-numeric `confidence` that is not `high`, `medium`, or `low` is used. | Shown as “Pipeline note,” with the words “Not a guarantee about today.” A numeric value is ignored so it cannot be read as a confidence percent. `confidence: high` is the confidence level, not this note. The past-lab panel stays “Past lab agreement.” |
| `neptune_index` on the daily file, the nowcast, or archive lead 0. Also accepted as `neptuneIndex`. | A number from 0 through 500. The band name, color, and swim guidance come from `config/neptune-index.ts`. The board does not calculate this number. A value outside 0–500 is ignored. The daily file is checked first. |
| `neptune_band` on the daily file, the nowcast, or archive lead 0. Also accepted as `neptuneBand`. | A band id or label from that same config (`good`, `moderate`, `caution`, `unhealthy_for_swimming`, `unhealthy`, `hazardous`). Used when no in-range index was published, and then the badge has no number. When an in-range index is present, the cutoff table picks the band so the words match the number. |

## What the board will not invent

- No probability, Safe/Unsafe call, or MPN for a roster station that has neither a nowcast row nor an archive lead of 0. The beach is listed as “No estimate today.”
- No sampling frequency, model version, publish time, or fallback when the cell is blank.
- No county staleness limit beyond `default_days` or the 7-day fallback.
- No region until `regions` names one.
- No confidence score, and no high / medium / low label unless the file says so.
- No official override unless `posting_status` is `closure`, `warning`, or `advisory`. `open` and `unknown` are not rendered as safe. `final_status` alone does not override our estimate, and no agency name is invented when `posting_source` is blank. A missing posting cell is not turned into `unknown`.
- No rain advisory from a rain total. The note appears only when the method is `rules` and the file sets the rain flag to true.
- No Neptune Index number unless `neptune_index` is present and between 0 and 500. No band unless that number falls on the scale or `neptune_band` names one. The percentage is never converted into an index.
