# Water post-processing — Collection 01

MapBiomas Chile — Chile Water, **Collection 01**.

Scripts after preliminary monthly classification (arid / temperate).

## Pipeline

| Step | Script | Description |
|------|--------|-------------|
| **01** | `step01_vectorize_water_objects.js` | Raster water (C1–C3) → vector objects |
| **02** | `step02_seasonal_false_positive_mask.js` | Seasonal false-positive masking (D/N/W) |
| QA | `revision_seasonal_false_positive_mask.js` | Visual QA for step 02 (validate / calibrate; no export) |
| **03** | `step03_gap_fill.js` | Gap-fill + frequency / polygon filters |
| **04** | `step04_freq_neighbor_fill.js` | Rescue fill (`freq` or `neighbors`) |
| 05+ | *(pending)* | Final product / further cleanup |

## Step 01 — Vectorize water objects

**File:** `step01_vectorize_water_objects.js`

### What it does

1. Loads preliminary classification assets (`classification-01` or `-02`).
2. Builds an annual water frequency from months classified as C1–C3.
3. Vectorizes the water mask with `reduceToVectors` in 0.25° subgrid chunks.
4. Attaches `mean_freq` and `mean_slope` (FABDEM) per object.
5. Optionally splits each carta into quadrants (`quadrantRows` × `quadrantCols`) for smaller export tasks.

### Important GEE note

Use **`reduceToVectors`**, not `reduceToVectorsStreaming` (not available in all Code Editor / API clients).

### Configuration

| Field | Description |
|-------|-------------|
| `classificationAssetRoot` | Folder with `pilot-{year}-{grid}-{version}` images |
| `years` / `grids` | Years and carta names |
| `quadrantRows` / `quadrantCols` | Split grid for export (default 1×1) |
| `runExport` | `false` for preview; `true` to queue table exports |
| `previewMonthBand` | Month shown on the map (e.g. `w_7`) |

### Export path

```text
.../01-CLASS/POSTPROCESSING/01-VECT-01/   # from classification-01 (temperate)
.../01-CLASS/POSTPROCESSING/01-VECT-02/   # from classification-02 (arid)
water_objs_{year}_{grid}_c{cell}_{classVersion}
```

### How to run in GEE

1. Paste the full script and Run.
2. Console should print IC size and (if export off) object counts.
3. Map: selected grids + classification preview on by default.
4. Set `CONFIG.runExport = true` when ready (Tasks panel → Run).

## Step 02 — Seasonal false-positive mask

**File:** `step02_seasonal_false_positive_mask.js`

### Modules required (upload first)

```text
../MODULES/Module_mosaic_landsat.js
../MODULES/Module_grid_config.js
```

Path: `users/mapbiomas-chile/mapbiomas:WATER/MODULES/` (or edit `GEE_MODULES` in the script).

Grid config returns **`mosaicPreset`** names (e.g. `wet_FilterAllSnw`), not legacy script paths.

### What it does

1. Loads preliminary monthly water + step-01 vector objects for a grid/year.
2. Assigns Dry / Neutral / Wet (D/N/W) per month from climatology P33/P67 (`forcing_type`).
3. Applies hard filters (shade, LULC exclude, high HAND, snow, optional brightness/FABDEM slope) and soft filters (CSF, optional soil/MNDWI).
4. Rescues soft Failures via HAND plain + LULC rules (water / glacier CSF / MNDWI lists / class 33 freq).
5. Remaps false positives to class **4**; embeds `mask_config_json` on export metadata.

### Configuration

| Field | Description |
|-------|-------------|
| `CONFIG.gridName` / `grid_name` | Carta (default `SI-19-V`) |
| `CONFIG.years` / `years` | Years to process (default `[1999]`) |
| `CONFIG.runMode` / `RUN_MODE` | `preview` (DIAG + charts) or `export` (Tasks) |
| `CONFIG.macrozone` / `MACROZONA` | `auto` or Norte/Centro/Sur/Austral |
| `UMBRALES_MACROZONA` | Per-macrozone D/N/W thresholds (`freq_mean`, `freq_recap`, `csf`) |
| `MAP_PREVIEW_MONTHS` | Months shown on the map in preview |

### Export path

```text
.../01-CLASS/POSTPROCESSING/02-MASK-01/   # from classification-01
.../01-CLASS/POSTPROCESSING/02-MASK-02/   # from classification-02
water-mask-{grid}-{year}-{outputVersion}
```

### How to run in GEE

1. Paste the full script and Run (`CONFIG.runMode = 'preview'` by default).
2. Console: paths, D/N/W states, n_obs_year / k_disp; optional coverage + climate charts.
3. Map: centered on the grid; preliminary vs masked layers + DIAG panel button.
4. Set `CONFIG.runMode = 'export'` when ready (Tasks panel → Run).

## Revision QA — Seasonal false-positive mask

**File:** `revision_seasonal_false_positive_mask.js`  
Companion to step 02. Does **not** export.

### Modules required

Same as step 02 (`Module_mosaic_landsat`, `Module_grid_config` via `GEE_MODULES`).

### What it does

1. Loads preliminary classification, exported `water-mask-…`, and optionally recomputes the mask live.
2. UI panel: year / month / mode (`validate` | `calibrate`).
3. Map layers: preliminar, exported, recomputed, FP / DIFF, full DIAG stack.
4. Console charts: water area (prelim vs exported), seasonality D/N/W, annual forcing.

### Modes

| Mode | Thresholds | Layers |
|------|------------|--------|
| `validate` | `mask_config_json` from exported asset (fallback: section-1 defaults) | Preliminar + exported + DIAG |
| `calibrate` | Editable section-1 / macrozone defaults | + recomputed + DIFF |

### Configuration

| Field | Description |
|-------|-------------|
| `CONFIG.gridName` | Carta to review |
| `CONFIG.years` | Years with exported masks |
| `CONFIG.outputVersion` | Version suffix of exported `water-mask-…` |
| `CONFIG.revisionMode` | Default panel mode (`validate` / `calibrate`) |
| Section 1 thresholds / filters | Same knobs as step 02 (calibrate + metadata fallback) |

### How to run in GEE

1. Paste and Run after MODULES are uploaded.
2. Use the panel button to load a year/month comparison (auto-loads first year/month).
3. Inspect DIAG layers; switch to calibrate when tuning thresholds before re-exporting step 02.

## Step 03 — Gap-fill + filters

**File:** `step03_gap_fill.js`

### What it does

1. Loads step-02 `water-mask` images for a 5-year neighbor window around each year.
2. Fills class **5** and unmasked pixels from neighboring months (class 5 never used as source).
3. Optionally remaps low-frequency water (1–3 with ≤ `freqMaxMonths` over the series) to class **4**.
4. Optionally applies manual polygons: `no_agua` (force class 4) and `excluir_filtros` (rescue from filters).
5. Optionally exports those polygons to `MASK-VECTORS/`.

### Configuration

| Field | Description |
|-------|-------------|
| `CONFIG.grids` / `cartas` | Cartas (same classification-01 or -02 family) |
| `CONFIG.runMode` | `preview` (one year) or `export` (all years) |
| `CONFIG.previewYear` / `PREVIEW_YEAR` | Year shown in preview |
| `CONFIG.importVersion` | Version of step-02 mask assets |
| `CONFIG.outputVersion` | Version suffix for gap exports |
| `useFreqFilter` / `freqMaxMonths` | Series frequency filter |
| `useNoAguaGeometries` / `useExcludeGeometries` | Manual polygon filters (GEE Imports) |
| `exportMaskVectors` | Export polygons to `MASK-VECTORS/` (export mode only) |

### Optional GEE Imports

- `no_agua`
- `excluir_filtros`

If flags are on but Imports are missing, the script prints a warning and disables that filter (paste-friendly).

### Export path

```text
.../01-CLASS/POSTPROCESSING/03-GAP-01/   # from classification-01
.../01-CLASS/POSTPROCESSING/03-GAP-02/   # from classification-02
water-gap-{grid}-{year}-{outputVersion}

.../POSTPROCESSING/MASK-VECTORS/
{grid}-no_agua-{outputVersion}
{grid}-excluir_filtros-{outputVersion}
```

### How to run in GEE

1. Paste the full script and Run (`CONFIG.runMode = 'preview'` by default).
2. Console: MASK in / GAP out paths; optional frequency + polygon layers on the map.
3. Add Imports if using manual polygons; set `exportMaskVectors = true` only when exporting them.
4. Set `CONFIG.runMode = 'export'` when ready (Tasks panel → Run).

## Step 04 — Rescue fill (frequency or neighbors)

**File:** `step04_freq_neighbor_fill.js`

### What it does

1. Loads step-03 `water-gap` rasters for the full series on one grid.
2. **`freq`**: remaps fillable classes (default 4) → water where historical water-month count > `freqMinMonths`.
3. **`neighbors`**: fills short gap runs (≤ `maxGapRun`) only when flanked by water 1–3 on both sides; inherits flanking class.
4. Optional fill polygon (`geo_f` Import or `CONFIG.polygonFc`).
5. Preview helpers: frequency layer, before/after month, Inspector stack, click inspector, forcing chart.

### Configuration

| Field | Description |
|-------|-------------|
| `CONFIG.gridName` | Carta |
| `CONFIG.method` | `freq` or `neighbors` |
| `CONFIG.importVersion` | Step-03 GAP input version |
| `CONFIG.outputVersion` | 04-FQGAP output version |
| `freqMinMonths` / `maxGapRun` / `fillClass` | Method parameters |
| `fillFromClasses` | Hole classes to fill (default `[4]`) |
| `usePolygon` | Restrict fill to Import `geo_f` |
| `runMode` | `preview` or `export` |

### Export path

```text
.../01-CLASS/POSTPROCESSING/04-FQGAP-01|02/
water-fqgap-{grid}-{year}-{v}   # METHOD=freq
water-nbgap-{grid}-{year}-{v}   # METHOD=neighbors
```

### How to run in GEE

1. Paste and Run (`preview` by default): frequency layer + before/after of `autoPreviewYear/Month`.
2. Optional console helpers are listed in the printout.
3. Set `CONFIG.runMode = 'export'` to queue the full series.
