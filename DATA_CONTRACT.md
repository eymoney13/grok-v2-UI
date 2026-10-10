# Data contract

The California board reads beach data through `lib/neptuneAdapter.ts`. Parsers for columns and file shapes live in `lib/neptuneContract.ts`. A renamed column or path is a change in those two files.

`/california` uses this roster instead of the hardcoded `stations[]` list in `lib/data.ts` when the roster file is present. Other boards keep their own published CSVs. If the roster file is missing, `/california` falls back to `stations[]` and `public/data/southbay`.

## Where files are read

1. `NEPTUNE_V2_DIR`, when set, should be the root of a `project-neptune-v2` checkout.
2. Otherwise `data/neptune-v2/` in this repo.
3. Any wide CSV that is not in that tree is read from `public/data/<dataSlug>/`.

This environment could not read `eymoney13/project-neptune-v2` (the GitHub API returned not found). The files under `data/neptune-v2/` are a local sample in the live shape, reshaped from `public/data/southbay`. They are not a copy of the statewide inventory. Do not treat the sample’s station count as the live roster. Orange County’s roster is expected to change, so the UI counts whatever the file contains.

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

## Pending, read when present

Not in the sample, because they are not published yet. The adapter already accepts them and the page stays quiet when they are absent.

| Input | What the board does |
| --- | --- |
| `outputs/run_manifest.json` with `generated_at`, `model_version`, `stale_counties`, `checks_passed` | `generated_at` becomes “Last updated.” `stale_counties` is a banner. `checks_passed: false` is a caution banner. A missing file adds no banner. |
| `generated_at` as a column on the nowcast or archive | Same “Last updated” clock time, in the board’s timezone. |
| `generated_at` on the daily status file | Same clock, used only when the manifest and the nowcast column are both blank. |
| `method` (`model`, `pooled model`, `rules`). Also `estimate_method`. | Plain words: “Based on this beach’s model.”, “Based on a pooled model, shared across beaches.”, or “Based on last lab test + rain rule.” An unknown value is ignored. |
| `confidence` (`high`, `medium`, `low`). Also `confidence_level`. | Shown in words. Low confidence says it is less certain than a high-confidence reading, and it is drawn in italics with a dashed border. It is not colored like a status. A number is not a confidence level. |
| `posting_status` and `posting_source` | An official county closure or advisory. Shown first, in a dark panel, and it overrides our status. The source is credited only when `posting_source` is present. Our prediction stays visible as “Our estimate.” A beach with a posting and no model row still shows the posting. |
| `final_status` | The label on that official panel, when `posting_status` is also present. On its own it does not override the prediction, because it may only repeat the model call. |
| `rain_advisory` or `recent_rain`, and `method` is `rules` | “Rain advisory. The rules path flagged recent rain.” A published rain total, including zero, does not create this note. |
| A calibrated probability column on the nowcast, forecast, or archive. Names tried, in order: `calibrated_probability`, `calibrated_exc_probability`, `p_calibrated` | A second line, “Calibrated estimate,” labeled as a model figure, not a lab result. |
| A per-beach pipeline note. Names tried, in order: `confidence_flag`, `confidenceFlag`, `model_confidence`, `beach_confidence`. If none of those is set, a non-numeric `confidence` that is not `high`, `medium`, or `low` is used. | Shown as “Pipeline note,” with the words “Not a guarantee about today.” A numeric value is ignored so it cannot be read as a confidence percent. `confidence: high` is the confidence level, not this note. The past-lab panel stays “Past lab agreement.” |
| Daily status file, path not final. Current file, first match: `daily_status.csv`, `daily_status.json` (same folders as the wide CSVs), then `outputs/daily/current.csv`, then `outputs/daily/current.json`. If none of those exist, the newest `YYYY-MM-DD.csv` or `.json` in `outputs/daily/history`, then `outputs/daily_status`, then `outputs/status_history`. The same columns are also read from the nowcast row and from archive lead 0. | One row per station. The last row for a station in that file wins. Merge order across files is daily file, then archive lead 0, then the wide nowcast. The first non-null value wins, and an explicit false is kept. A missing file, and a missing column, stay null. An empty current file does not fall through to history. |
| `neptune_index` on the nowcast or archive lead 0. Also accepted as `neptuneIndex`. | A number from 0 through 500. The band name, color, and swim guidance come from `config/neptune-index.ts`. The board does not calculate this number. A value outside 0–500 is ignored. |
| `neptune_band` on the nowcast or archive lead 0. Also accepted as `neptuneBand`. | A band id or label from that same config (`good`, `moderate`, `caution`, `unhealthy_for_swimming`, `unhealthy`, `hazardous`). Used when no in-range index was published, and then the badge has no number. When an in-range index is present, the cutoff table picks the band so the words match the number. |

## What the board will not invent

- No probability, Safe/Unsafe call, or MPN for a roster station that has neither a nowcast row nor an archive lead of 0. The beach is listed as “No estimate today.”
- No sampling frequency, model version, publish time, or fallback when the cell is blank.
- No county staleness limit beyond `default_days` or the 7-day fallback.
- No region until `regions` names one.
- No confidence score, and no high / medium / low label unless the file says so.
- No official posting unless `posting_status` is non-blank. `final_status` alone does not override our estimate, and no agency name is invented when `posting_source` is blank.
- No rain advisory from a rain total. The note appears only when the method is `rules` and the file sets the rain flag to true.
- No Neptune Index number unless `neptune_index` is present and between 0 and 500. No band unless that number falls on the scale or `neptune_band` names one. The percentage is never converted into an index.
