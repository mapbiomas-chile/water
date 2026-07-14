# Hydroclimate inputs — Collection 01

MapBiomas Chile — Chile Water.

Builds the table assets that drive **seasonal D/N/W** in
`POST-PROCESS/step02_seasonal_false_positive_mask.js`.

## Contents

| File | Role |
|------|------|
| `prepare_hydroclim_all_pc.ipynb` | PC: flow climatology + grid attributes CSVs |
| `complete_hydroclim_gee.js` | GEE: macrozone + CR2MET precip + merge exports |
| `input/` | Place `BIG_GRIDS_CHILE.shp` + `caudales_cartas.xlsx` (not in git) |
| `export_for_gee/` | Notebook outputs (not in git) |

## Forcing rule

| Forcing | Grids |
|---------|--------|
| **Flow (DGA)** | Present in `caudales_cartas.xlsx` (`Caudal_mensual`) |
| **Precip (CR2MET)** | All other cartas |

## Workflow

### 1) PC

```bash
pip install pandas openpyxl geopandas
```

1. Copy shapefile + Excel into `input/`.
2. Run `prepare_hydroclim_all_pc.ipynb`.
3. Upload from `export_for_gee/` as **Table** assets:

| CSV | Suggested asset id (TABLE/) |
|-----|-----------------------------|
| `grid_attributes_hydro.csv` | `grid_attributes_hydro` |
| `seasonal_climatology_flow.csv` | `seasonal_climatology_flow` |
| `annual_anomaly_flow.csv` | `annual_anomaly_flow` |
| `monthly_flow_merged.csv` | `monthly_flow_merged` (optional; charts in step04) |

Do **not** put `macrozone` in the CSVs.

### 2) GEE

1. Ensure vectors exist: `biggrids-chile`, `MZ_CHILE`.
2. Ensure CR2MET stack: `…/RASTER/CR2MET_pp` (one image/year, bands `b1`…`b12`).
3. Paste `complete_hydroclim_gee.js`, check `CONFIG` paths, Run.
4. Tasks → export:

| Export | Used by |
|--------|---------|
| `seasonal_climatology_merged` | step02 D/N/W (P33/P67) |
| `annual_anomaly_merged` | step02 charts / extremes |
| `grid_attributes_hydro_merged_v2` | step02 macrozone + forcing_type |

If only `MZ_CHILE` changed: re-run the GEE script and launch **only**
`grid_attributes_hydro_merged_v2`.

## Macrozone (`MZ_CHILE`)

Assigned in GEE (largest overlap carta ∩ polygon; fallback centroid).

| Code | Name |
|------|------|
| 1 | Norte |
| 2 | Centro |
| 3 | Sur |
| 4 | Austral |
