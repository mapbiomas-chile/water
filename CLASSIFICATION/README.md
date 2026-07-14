# Water classification — Collection 01

MapBiomas Chile — Chile Water, **Collection 01**.

Preliminary monthly water classification from Landsat + SMA fractions.

## Setup (GEE)

1. Upload `../MODULES/*.js` to Scripts:  
   `users/mapbiomas-chile/mapbiomas:WATER/MODULES/`
2. If needed, edit `GEE_MODULES` at the top of each classify script.
3. Paste a classify script into the Code Editor and Run (`runExport: false` first).

## Methods

| Method | Script | Mosaic PRESET | Domain |
|--------|--------|---------------|--------|
| **Arid** | `classify_arid_preliminary.js` | `dry_FilterNo` | Arid / semi-arid |
| **Temperate** | `classify_temperate_preliminary.js` | `wet_FilterAllSnw` | Temperate / humid |

Both follow SMA → fuzzy membership → decision tree → C1–C9.  
Modules: `Module_mosaic_landsat` (+ `Module_water_probability` for temperate).

## Output classes (C1–C9)

| Code | Name | Color |
|------|------|-------|
| **1** | Detected water | `#0000ff` |
| **2** | Observed included water | `#009900` |
| **3** | Unobserved included water | `#5af100` |
| **4** | Non-water | `#ffffff` |
| **5** | Unobserved | `#000000` |
| **6** | Observed exclusion | `#ff0000` |
| **7** | Unobserved exclusion | `#ff60c7` |
| **8** | Shadow water | `#c6c6c6` |
| **9** | Slope water | `#ffff00` |

Bands: `w_1` … `w_12`.

## Arid vs temperate (defaults)

| Parameter | Arid | Temperate |
|-----------|------|-----------|
| PRESET | `dry_FilterNo` | `wet_FilterAllSnw` |
| Cloud cover | 50 | 90 |
| Shade min–max | 55–75 | 75–85 |
| Fill gap month / year | 0.64 / 0.64 | 0.40 / 0.45 |
| Monthly prob cutoff | 0.67 | 0.40 |
| Slope flag (≥ °) | 20 | 14 |
| Brightness (`pbri`) filter | — | 1000 inside optional `poli` |
| Export folder | `classification-02` | `classification-01` |

## Temperate extras

1. `Module_water_probability`: `setLimeares`, `setParametroSMA`, `setParametroReducto`, `p_*_func`.
2. Optional Geometry Import **`poli`**: remaps bright C1/C3 pixels to non-water.

## Configuration (`CONFIG`)

| Field | Description |
|-------|-------------|
| `years` / `grids` | Years and `biggrids-chile` names |
| `thresholds` | Fuzzy SMA breakpoints |
| `classification` | Fill / MNDWI / pbri / slope / probability cutoffs |
| `runExport` | `false` for preview |
| `previewMonths` | Months to show on the map |
| `comparePrevious` | Diff vs previous IC |

## Dependencies

```text
users/mapbiomas-chile/mapbiomas:WATER/MODULES/Module_mosaic_landsat
users/mapbiomas-chile/mapbiomas:WATER/MODULES/Module_water_probability   # temperate
```

Auxiliary assets: `biggrids-chile`, `slppost2_30_FABDEM`, `shademask2_FABDEM`, FABDEM, LULC Collection 02.

## Export defaults

```text
Arid:      .../01-CLASS/classification-02/pilot-{year}-{grid}-{version}
Temperate: .../01-CLASS/classification-01/pilot-{year}-{grid}-{version}
```

## How to run in GEE

1. Paste the full script into the Code Editor.
2. Check console: filtered grids > 0 and collection size > 0.
3. Map: mosaics / classifications appear for `previewMonths`.
4. Set `CONFIG.runExport = true` when ready.
