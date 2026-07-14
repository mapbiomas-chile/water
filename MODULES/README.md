# Chile Water — MODULES (Collection 01)

Upload **all** files in this folder to Earth Engine Scripts:

```text
users/mapbiomas-chile/mapbiomas:WATER/MODULES/
```

If your account differs, edit `GEE_MODULES` at the top of each caller script
(`CLASSIFICATION/*`, `POST-PROCESS/step02_*`) to match.

## Files

| File | Role |
|------|------|
| `Module_gee_paths.js` | Documents the default Scripts root |
| `Module_mosaic_landsat.js` | Landsat C2 + QA filter + SMA (unified) |
| `Module_water_probability.js` | Temperate fuzzy `setLimeares` / `p_*` |
| `Module_grid_config.js` | Per-carta PRESET + cloudCover + asset base |

## Mosaic PRESETS

```javascript
var GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';
var mosaic = require(GEE_MODULES + '/Module_mosaic_landsat');

var col = mosaic.get_Collection2(gridFc, 50, [2017], 'dry_FilterNo');
// or: mosaic.get_Collection2(..., mosaic.PRESETS.dry_FilterNo)
```

| PRESET | pixelFilter | smaMode | notes |
|--------|-------------|---------|-------|
| `dry_FilterNo` | none | dry | arid default |
| `dry_FilterAll` | all | dry | |
| `dry_FilterAllSnw` | all_snow | dry | |
| `dry_FilterSC` | sc | dry | |
| `wet_FilterAll` | all | wet | |
| `wet_FilterAllSnw` | all_snow | wet_nosnow | temperate default; cloudScore on |
| `wet_FilterSC` | sc | wet_nosnow | cloudScore on |
| `wet_ESN_FilterAll` | all | wet | |
| `wet_ESN_FilterAllSnw` | all_snow | wet | |

## Grid config

```javascript
var cfg = require(GEE_MODULES + '/Module_grid_config')
  .getGridConfig('SI-19-V', 2017);
// cfg.mosaicPreset, cfg.cloudCover, cfg.assetActualBase
```

## Temperate probability

```javascript
var probs = require(GEE_MODULES + '/Module_water_probability');
probs.setLimeares({...});
probs.setZeroSnowProb(false); // for wet_FilterAllSnw / FilterSC
```
