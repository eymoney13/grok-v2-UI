# Project Neptune — California beach board

Water-quality estimates for California beaches: enterococcus against the 104 MPN/100 mL limit, a same-day nowcast, and an experimental look at the next three days.

## Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). That is the public “Beaches near me” screen: browser location, or a search by name, with no account. Each beach has a page at `/beach/<slug>`. The slug is the beach name, county, and station code, or the station code plus agency when that column is in the file. A station code alone is not the address, because the same code is used by more than one agency. The full coast board stays at `/california`.

`npm run build` compiles the production app. `node scripts/check-neptune-contract.ts` (Node 22, with type stripping) checks the parsers.

No deployment, and no production database. Auth, billing, and email alerts stay off unless you add your own local keys. The board still renders without them. PostHog is skipped when `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` are unset. Maps use OpenStreetMap tiles unless `NEXT_PUBLIC_CARTO_API_KEY` is set.

## Where the data comes from

All file reads go through `lib/neptuneAdapter.ts`. Column names are parsed in `lib/neptuneContract.ts`. The full shape is in [DATA_CONTRACT.md](DATA_CONTRACT.md).

1. If `NEPTUNE_V2_DIR` is set, that directory is treated as a `project-neptune-v2` checkout (`data/roster.json`, `outputs/forecast_archive/forecasts.csv`, `outputs/daily/current.csv`, `config/staleness_thresholds.json`, and the wide CSVs).
2. Otherwise the app uses `data/neptune-v2/`.
3. A wide CSV that is not in the v2 tree falls back to `public/data/southbay/`.

`data/neptune-v2/` is a local sample. It is the published South Bay files rewritten into the v2 layout, not a dump of the live statewide roster. Rebuild it with:

```bash
node scripts/build-v2-sample.mjs
```

`/california` uses the roster file instead of the hardcoded station list. Stations with no model row show as “No estimate today.” Blank fields stay blank.

## What the board shows

- Under / Near / Over the limit, from the same cutoffs as the legend. A published Neptune Index (0–500, six bands) replaces that reading on the map, the list, and the beach page. The scale is at `/california/neptune-index`. Bands live in `config/neptune-index.ts`. Absent index fields keep Under / Near / Over, and the board does not invent a score.
- Day 1–3 forecasts in an Experimental panel (`FORECAST_HORIZON_MODE` and `FORECAST_HIDDEN_STATIONS` in `lib/forecastDisplay.ts`).
- Search, plus county, region, status, and roster filters. Region appears when the regions file names any.
- A clustered map, and a beach page at `/california/beach/<slug>` with today’s status, the last test, lab results against the limit, and the experimental forecast. The slug is the same one used on the public beach page.
- A phone-first home at `/` that lists the nearest beaches after the browser shares a location, and a search when it does not. The map on that screen loads only after “Show these on a map.”
- A shareable `/beach/<slug>` page. Its summary states today’s status, the last lab test when a sample age was published, and the experimental outlook. Rain and the latest lab result appear only when those fields are in the file. A blank rain field is not described as a dry day. Locked or missing forecast days are not given a direction.
- Installable PWA basics: a web manifest and a service worker that always asks the network, so a saved page is not reused as today’s reading. English and Spanish on the public home and beach page. Beach names stay as published.
- “Last tested N days ago,” a calm limited-lab line, “Last updated,” and a banner when the forecast date is not today.
- “Past lab agreement,” not a confidence score.
- The statewide daily file `outputs/daily/current.csv` (a dated file next to it is history). It carries method, confidence, county posting, and Neptune Index columns. A closure, warning, or advisory is shown first, with its source when one was published, and our prediction stays visible under it. A warning still leads when the model estimate is under the limit. `open` means that source listed nothing active today. `unknown` is a plain note that no official posting data was published, with no badge, and it is not treated as safe. Low confidence is worded and styled as less certain than high confidence. A rain advisory appears only when the rules path flags recent rain. Empty index cells stay empty. Absent fields stay off the page.
