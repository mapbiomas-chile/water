# MapBiomas Chile — Water, Collection 01

Google Earth Engine scripts for monthly water surface mapping (30 m).

Target repository: [mapbiomas-chile/water](https://github.com/mapbiomas-chile/water)

## Structure

| Folder | Description |
|--------|-------------|
| `MODULES/` | Landsat+SMA mosaic, probability helpers, grid PRESET config |
| `AUXILIARY/` | Build scripts + catalog (biggrids, shademask, slppost; hydroclimate → `HYDROCLIMATE/`) |
| `HYDROCLIMATE/` | PC notebook + GEE script for forcing / D/N/W tables |
| `CLASSIFICATION/` | Preliminary monthly maps (arid / temperate) |
| `POST-PROCESS/` | Vectorize → seasonal mask → gap-fill → rescue fill (+ revision QA) |

## Run order (self-contained GitHub flow)

0. **Hydroclimate** (once / when forcing tables change) — `HYDROCLIMATE/`  
   Notebook PC → upload CSVs → `complete_hydroclim_gee.js` → merged tables.
1. **Upload** every file in `MODULES/` to GEE Scripts  
   `users/mapbiomas-chile/mapbiomas:WATER/MODULES/`  
   (or edit `GEE_MODULES` in the caller scripts).
2. **Classify** — `CLASSIFICATION/classify_arid_preliminary.js` **or**  
   `classify_temperate_preliminary.js` → `classification-01|02/pilot-…`
3. **Vectorize** — `POST-PROCESS/step01_vectorize_water_objects.js` → `01-VECT-…`
4. **Seasonal mask** — `step02_seasonal_false_positive_mask.js` → `02-MASK-…`  
   (needs hydroclimate merged tables + `Module_grid_config` PRESETs)  
   Optional QA: `revision_seasonal_false_positive_mask.js` (no export).
5. **Gap-fill** — `step03_gap_fill.js` → `03-GAP-…`
6. **Rescue fill** — `step04_freq_neighbor_fill.js` → `04-FQGAP-…`  

Auxiliary GEE inputs are listed in `AUXILIARY/README.md` (not stored in git).

No legacy mosaic scripts (`Module_mosaic_dry_*` / `Module_mosaic_wet_*`) are required.

## Pipeline overview

```
Landsat monthly images
        │
        ▼
   SMA fractions ──► fuzzy membership (arid | temperate)
        │              MODULES/Module_mosaic_landsat
        │              MODULES/Module_water_probability (temperate)
        ▼
   Decision tree (C1–C9 monthly maps)
        │
        ▼
   Vectorize water objects          ← POST-PROCESS/step01
        │
        ▼
   Seasonal false-positive mask     ← POST-PROCESS/step02
        │                              (+ Module_grid_config PRESETs)
        ▼
   Gap-fill + frequency filters     ← POST-PROCESS/step03
        │
        ▼
   Rescue fill (freq | neighbors)   ← POST-PROCESS/step04
        │
        ▼
   Further cleanup / final product
```

## Status

| Stage | Status |
|-------|--------|
| Modules (mosaic + probs + grid config) | Ready (`MODULES/`) |
| Hydroclimate (PC + GEE) | Ready (`HYDROCLIMATE/`) |
| Arid preliminary classification | Ready |
| Temperate preliminary classification | Ready |
| Vectorize water objects | Ready (`step01`) |
| Seasonal false-positive mask | Ready (`step02`) |
| Revision QA (seasonal mask) | Ready (`revision_seasonal_false_positive_mask`) |
| Gap-fill + filters | Ready (`step03`) |
| Rescue fill (freq / neighbors) | Ready (`step04`) |
| Auxiliary asset catalog | Ready (`AUXILIARY/`) |
| Auxiliary build scripts (grids / shade / slppost) | Ready (`AUXILIARY/export_*.js`) |
| National / platform export | Pending |

## Contact

MapBiomas Chile — chilemapbiomas@gmail.com
