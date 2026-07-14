/**
 * Step 02 — Seasonal false-positive masking (after vectorization).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Input:  preliminary monthly water (C1–C9) + vector objects (step 01).
 * Output: monthly water with seasonal false positives remapped to class 4.
 *
 * Dry/Neutral/Wet (D/N/W) from monthly climatology P33/P67 (forcing_type).
 * Hard filters (absolute) vs soft filters (HAND/LULC-rescuable).
 * HAND dual role: high = hard exclude; plain = soft-fail rescue eligible.
 * LULC rescues (water / glacier CSF / MNDWI lists / class 33 freq).
 * RUN_MODE: preview (DIAG + charts) | export (Tasks).
 */

// -----------------------------------------------------------------------------
// Configuration — edit per run
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  step: '02_seasonal_false_positive_mask',

  country: 'Chile',
  classificationVersion: 1,
  outputVersion: 1,

  /** Grid (carta) name. */
  gridName: 'SI-19-V',

  /**
   * Macrozone thresholds key.
   * 'auto' reads macrozone_name from grid_attributes_hydro_merged_v2.
   * Or force: 'Norte' | 'Centro' | 'Sur' | 'Austral'.
   * Limitation: one macrozone per grid (centroid).
   */
  macrozone: 'auto',

  /** Calibration: one year; full export: longer list / sequence. */
  years: [1999],

  /** 'preview': DIAG panel + map, no export. 'export': queue Tasks. */
  runMode: 'preview',

  /** Heavy: historical curves (28 yr x 12 mo) in console. */
  showConsoleCharts: true,

  /** Light: Landsat scene coverage per year (metadata only). */
  showDataAvailChart: true,

  /** Months shown as map layers in preview. */
  mapPreviewMonths: [1]
};

// Aliases — algorithm below uses these names unchanged
var paisName            = CONFIG.country;
var versionClassif      = CONFIG.classificationVersion;
var version_salida      = CONFIG.outputVersion;
var grid_name           = CONFIG.gridName;
var MACROZONA           = CONFIG.macrozone;
var years               = CONFIG.years;
var RUN_MODE            = CONFIG.runMode;
var SHOW_CONSOLE_CHARTS = CONFIG.showConsoleCharts;
var SHOW_DATA_AVAIL_CHART = CONFIG.showDataAvailChart;
var MAP_PREVIEW_MONTHS  = CONFIG.mapPreviewMonths;

// -----------------------------------------------------------------------------
// Thresholds by macrozone and seasonal period (D / N / W)
// Starting point — calibrate with DIAG panel.
// -----------------------------------------------------------------------------
var UMBRALES_MACROZONA = {
  Norte:   { D: { freq_mean: 2.1, freq_recap:  9.0, csf: 0.34 },
             N: { freq_mean: 3.9, freq_recap:  5.0, csf: 0.36 },
             W: { freq_mean: 3.9, freq_recap:  6.0, csf: 0.30 } },
  Centro:  { D: { freq_mean: 2.1, freq_recap:  9.0, csf: 0.32 },
             N: { freq_mean: 1.8, freq_recap:  8.0, csf: 0.33 },
             W: { freq_mean: 1.7, freq_recap:  7.0, csf: 0.38 } },
  Sur:     { D: { freq_mean: 2.0, freq_recap:  6.0, csf: 0.30 },
             N: { freq_mean: 1.7, freq_recap:  8.0, csf: 0.32 },
             W: { freq_mean: 1.4, freq_recap:  10.1, csf: 0.40 } },
  Austral: { D: { freq_mean: 1.8, freq_recap:  8.0, csf: 0.28 },
             N: { freq_mean: 1.5, freq_recap:  7.0, csf: 0.30 },
             W: { freq_mean: 1.2, freq_recap:  6.0, csf: 0.42 } }
};
// UMBRAL / MACROZONA_EFECTIVA resolved below (auto from grid attrs if needed).

// Hard filters — same for all macrozones.
// SLOPE_MAX (deg): polygon mean_slope via ok_img. No polygon -> mean_slope=0 -> slopeOk=true.
var SLOPE_MAX  = 20;
// Optional per-pixel FABDEM hard filter (hardAbsAnnual), independent of SLOPE_MAX.
var USE_FABDEM_SLOPE_FILTER = false;
var SLOPE_FABDEM_MAX          = 20;   // grados, ee.Terrain.slope(FABDEM)
var SOIL_MAX   = 20;
var SNOW_HARD  = 75;

// Brightness = mean(blue,green,red,nir). Hard filter (not rescuable).
// Monthly with annual fallback (empty month -> annual; masked pixel -> annual).
var USE_BRIGHTNESS_FILTER = false;
var BRIGHTNESS_HARD       = 2000;

// Soft soil filter; off by default (little gain; can mask sediment shores).
var USE_SOIL_FILTER = false;

// MNDWI soft filter (HAND-rescuable). Monthly median unmask(annual) per pixel;
// empty month -> full annual median. USE_MNDWI_MONTHLY=false -> annual only.
var USE_MNDWI_FILTER  = true;
var USE_MNDWI_MONTHLY = true;
var MNDWI_MIN         = -0.15;     // subir = mas estricto

// MapBiomas LULC
var USE_LULC_MASK     = true;
var LULC_ASSET        = 'projects/mapbiomas-chile/assets/LULC/COLLECTION-02/CLASSIFICATIONS/classification-final/clasificacion-final-2';
var LULC_YEAR_MIN     = 1999;  // primera banda en asset (no existe 1998)
var LULC_YEAR_MAX     = 2024;
var LULC_MASK_CLASSES = [23, 24, 29, 34, 66];

// LULC water rescue: prelim water + LULC in list overrides softFail (not hardFail).
// Useful for wetlands (11) / mineral water (33) with negative MNDWI.
var USE_LULC_WATER_RESCUE = true;
var LULC_WATER_CLASSES    = [11, 33];

// LULC exclude-class CSF rescue: clears only lulcExcl hardFail if csf_m >= threshold.
// Does not override freq / shade / snow / HAND / brightness.
var USE_LULC_GLACIER_RESCUE = true;
var LULC_GLACIER_CLASS      = 34;
var LULC_GLACIER_CSF_MIN    = 0.65;

var USE_LULC_CLASS29_RESCUE = false;
var LULC_CLASS29            = 29;
var LULC_CLASS29_CSF_MIN    = 0.9;

// LULC exclude-class MNDWI rescue: paired class[i] / min[i] lists.
var USE_LULC_MNDWI_RESCUE       = true;
var LULC_MNDWI_RESCUE_CLASSES   = [23, 29, 66];
var LULC_MNDWI_RESCUE_MINS      = [0.45, 0, 0.45];

// LULC class 33 (water): prelim water + freq_year >= threshold.
var USE_LULC_CLASS33_FREQ_RESCUE = true;
var LULC_CLASS33            = 33;
var LULC_CLASS33_MIN_FREQ   = 10;

if (USE_LULC_MNDWI_RESCUE &&
    LULC_MNDWI_RESCUE_CLASSES.length !== LULC_MNDWI_RESCUE_MINS.length) {
  throw new Error('LULC_MNDWI_RESCUE_CLASSES y LULC_MNDWI_RESCUE_MINS deben tener el mismo largo');
}

// HAND NASA GLO-30 — dual role:
//   HAND >= HAND_HARD_MAX  -> hard filter (class 4, no rescue)
//   HAND in (PLAIN_MAX, HARD_MAX) -> neither
//   HAND <= HAND_PLAIN_MAX -> may rescue softFail if freq mins pass
var USE_HAND            = true;
var HAND_COLLECTION     = 'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/HAND_GLO30_CHL';
var HAND_BAND           = 'b1';
var HAND_HARD_MAX       = 50;            // m sobre drenaje: > esto -> filtro duro
var HAND_PLAIN_MAX      = 15;            // m sobre drenaje: <= esto -> elegible rescate
var HAND_VALID_MAX      = 500;           // m: valores > esto se consideran invalidos
var HAND_MIN_FREQ_NORM  = 0.25;          // freq anual norm. minima para rescatar
var HAND_RESCUE_MIN_FREQ_ABS  = 3;       // freq_year absoluta minima para rescatar
var HAND_RESCUE_MIN_MEAN_FREQ = 1.0;     // o mean_freq poligono >= esto

// Optional HAND calibration polygon: stricter HAND_ZONE_HARD_MAX inside.
var USE_HAND_ZONE = false;
// HAND_ZONE_FC: asset FC or Map.drawingTools() layer.
var HAND_ZONE_FC = ee.FeatureCollection([]);
var HAND_ZONE_HARD_MAX = 15;             // m; dentro de zona HAND >= esto -> hardFail
var HAND_ZONE_MNDWI_ANNUAL = true;       // dentro zona: softFail si mens Y anual bajo umbral (AND)
var HAND_ZONE_MNDWI_ANNUAL_MIN = -0.05;  // umbral MNDWI anual solo dentro del poligono

// Landsat availability
var N_MIN_YEAR_OBS  = 6;
var K_LOW_DATA_YEAR = 0.85;

// -----------------------------------------------------------------------------
// Asset paths
// -----------------------------------------------------------------------------
var GRIDS_ASSET =
  'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile';

// classification-01 vs -02 share VECT / MASK folder suffixes
var ASSET_BASE_01 =
  'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-01/';
var ASSET_BASE_02 =
  'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-02/';
var POSTPROCESSING_ROOT =
  'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/POSTPROCESSING/';

var TRANSITION_CLASS_02 = { 'SH-19-Y': true, 'SI-19-V': true, 'SI-19-Y': true };
var TRANSITION_CLASS_01 = { 'SI-18-Z': true };
var TEMPLATED_SPECIAL_CLASS_02 = { 'SN-19-V': true, 'SN-19-X': true };

function isArid(gridName) {
  var g = String(gridName || '');
  return g.indexOf('SH-') === 0 || g.indexOf('SE-') === 0 ||
         g.indexOf('SF-') === 0 || g.indexOf('SG-') === 0;
}

function getAssetBaseByGrid(gridNameRaw) {
  var gridName = String(gridNameRaw || '').trim().toUpperCase();
  if (isArid(gridName)) return ASSET_BASE_02;
  if (TRANSITION_CLASS_01[gridName]) return ASSET_BASE_01;
  if (TRANSITION_CLASS_02[gridName]) return ASSET_BASE_02;
  if (TEMPLATED_SPECIAL_CLASS_02[gridName]) return ASSET_BASE_02;
  return ASSET_BASE_01;
}

function getClassCollectionId(gridNameRaw) {
  return getAssetBaseByGrid(gridNameRaw) === ASSET_BASE_02 ? '02' : '01';
}

function getFolderVect(gridNameRaw) {
  var c = getClassCollectionId(gridNameRaw);
  return POSTPROCESSING_ROOT + '01-VECT-' + c + '/';
}

function getAssetOutRoot(gridNameRaw) {
  var c = getClassCollectionId(gridNameRaw);
  return POSTPROCESSING_ROOT + '02-MASK-' + c + '/';
}

var FOLDER_VECT    = getFolderVect(grid_name);
var ASSET_OUT_ROOT = getAssetOutRoot(grid_name);

var HYDRO_TABLE_ROOT =
  'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/';
var GRID_ATTRS_ASSET = HYDRO_TABLE_ROOT + 'grid_attributes_hydro_merged_v2';
var CLIM_ASSET       = HYDRO_TABLE_ROOT + 'seasonal_climatology_merged';
var ANOM_ASSET       = HYDRO_TABLE_ROOT + 'annual_anomaly_merged';

// Modules — upload github/water/MODULES/*.js to this GEE Scripts folder.
// Edit GEE_MODULES if your Code Editor path differs.
var GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';
var gridConfig = require(GEE_MODULES + '/Module_grid_config');
var mosaic = require(GEE_MODULES + '/Module_mosaic_landsat');

// -----------------------------------------------------------------------------
// Global assets and helpers
// -----------------------------------------------------------------------------
var grids        = ee.FeatureCollection(GRIDS_ASSET);
var gridFc       = grids.filter(ee.Filter.eq('grid_name', grid_name));
var gridGeometry = gridFc.geometry();
var maskara      = ee.Image(0).paint(gridFc, 1).selfMask();

if (RUN_MODE === 'preview') {
  Map.centerObject(gridGeometry, 9);
}


var fabdem = ee.ImageCollection('projects/sat-io/open-datasets/FABDEM')
               .mosaic().setDefaultProjection('EPSG:3857', null, 30);
var slopeFabdem = ee.Terrain.slope(fabdem).rename('slope_deg');
var VIS_SLOPE = {
  min: 0, max: 40,
  palette: ['#f7f7f7', '#fdae61', '#d7301f', '#7f0000']
};
var shademask = ee.Image(
  'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/shademask2_FABDEM'
);
var pixelArea    = ee.Image.pixelArea().divide(10000);
var mascarachile = ee.Image(
  'projects/mapbiomas-chile/assets/ANCILLARY_DATA/STATISTICS/COLLECTION1/VERSION-1/nivel-politico-1-raster'
).gt(0).selfMask();

var lulcStack = USE_LULC_MASK ? ee.Image(LULC_ASSET) : null;

// MapBiomas LULC palette (classification8 + Chile extensions)
var palettes = require('users/mapbiomas/modules:Palettes.js');
var mapbiomasPalette = palettes.get('classification8');
mapbiomasPalette[60] = '1f8d49';   // bosque secundario
mapbiomasPalette[61] = 'c5c5c5';   // salar
mapbiomasPalette[63] = 'ebf8b5';   // estepa
mapbiomasPalette[64] = '000000';
mapbiomasPalette[65] = '000000';
mapbiomasPalette[66] = 'a89358';   // matorral
mapbiomasPalette[67] = 'c8ffb4';   // bosque achaparrado
mapbiomasPalette[68] = '000000';
mapbiomasPalette[69] = '000000';
mapbiomasPalette[70] = '000000';
mapbiomasPalette[71] = '000000';
mapbiomasPalette[72] = '000000';
mapbiomasPalette[73] = '000000';
mapbiomasPalette[74] = '000000';
mapbiomasPalette[75] = '000000';
mapbiomasPalette[76] = '000000';
mapbiomasPalette[77] = '000000';
mapbiomasPalette[78] = '000000';
mapbiomasPalette[79] = '69601e';   // coniferas
mapbiomasPalette[80] = '7a6c00';   // latifoliadas
var VIS_LULC = { min: 0, max: 80, palette: mapbiomasPalette };

var gridAttrs = ee.FeatureCollection(GRID_ATTRS_ASSET);
var climFc    = ee.FeatureCollection(CLIM_ASSET);
var anomFc    = ee.FeatureCollection(ANOM_ASSET);

function lulcYearForProcessing(year) {
  var y = Number(year);
  if (y > LULC_YEAR_MAX) return LULC_YEAR_MAX;
  if (y < LULC_YEAR_MIN) return LULC_YEAR_MIN;
  return y;
}
function getLulcYear(year) {
  return lulcStack.select('classification_' + lulcYearForProcessing(year));
}
function lulcInClasses(lulcImg, classes, bandName) {
  // Devuelve binario 0/1 (con unmask(0)) de pixeles cuyo LULC esta en `classes`.
  // unmask(0) evita propagar la mascara nativa de LULC por los .or()/.and()
  // siguientes (mismo bug que shademask): masked.or/and(x) = masked.
  if (!classes || classes.length === 0) return ee.Image(0).rename(bandName || 'lulc_sel');
  var m = lulcImg.eq(classes[0]);
  for (var i = 1; i < classes.length; i++) {
    m = m.or(lulcImg.eq(classes[i]));
  }
  return m.unmask(0).rename(bandName || 'lulc_sel');
}
function maskLulcExcludeClasses(lulcImg) {
  return lulcInClasses(lulcImg, LULC_MASK_CLASSES, 'lulc_excl');
}

var hand = null;
if (USE_HAND) {
  hand = ee.ImageCollection(HAND_COLLECTION).map(function(img) {
    return img.select([0], [HAND_BAND]);
  }).mosaic().rename(HAND_BAND)
    .reproject({ crs: fabdem.projection(), scale: 30 });
}
function getHand() {
  return USE_HAND ? hand.updateMask(hand.lt(HAND_VALID_MAX)) : null;
}

function getHandZoneFc() {
  if (!USE_HAND_ZONE) return null;
  return ee.FeatureCollection(HAND_ZONE_FC);
}

function buildHandZoneMask(zoneFc, region) {
  return ee.Image(0).byte().paint(zoneFc, 1).unmask(0).clip(region);
}

// HAND limit image (m): HAND_HARD_MAX outside; HAND_ZONE_HARD_MAX inside polygon.
function buildHandLimitImg(handZoneMask) {
  if (!handZoneMask) {
    return ee.Image(HAND_HARD_MAX);
  }
  return ee.Image(HAND_HARD_MAX).float()
    .where(handZoneMask.eq(1), ee.Image(HAND_ZONE_HARD_MAX));
}

function buildHandTooHigh(handForRescue, handZoneMask) {
  if (!handForRescue) return null;
  var handLimit = buildHandLimitImg(handZoneMask);
  return handForRescue.gte(handLimit).unmask(0);
}

// MNDWI softFail: outside = monthly; inside zone = monthly AND annual below min.
function buildMndwiSoftFail(mndwi_use, mndwi_year, handZoneMask) {
  if (!USE_MNDWI_FILTER) return ee.Image(0);
  var failDefault = mndwi_use.lt(MNDWI_MIN).unmask(0);
  if (!USE_HAND_ZONE || !HAND_ZONE_MNDWI_ANNUAL || !handZoneMask) {
    return failDefault;
  }
  var failInZone = mndwi_use.lt(MNDWI_MIN)
    .and(mndwi_year.lt(HAND_ZONE_MNDWI_ANNUAL_MIN))
    .unmask(0);
  return failDefault.where(handZoneMask.eq(1), failInZone);
}

// Ensure snow/soil bands exist (some mosaic modules omit them).
// Missing band -> 0. Does NOT cover empty month collections (use scene counts).
function ensureCsfBands(img) {
  img = ee.Image(img);
  img = ee.Image(ee.Algorithms.If(
    img.bandNames().contains('snow'), img,
    img.addBands(ee.Image(0).rename('snow'))));
  img = ee.Image(ee.Algorithms.If(
    img.bandNames().contains('soil'), img,
    img.addBands(ee.Image(0).rename('soil'))));
  return img;
}

// Mean reflectance blue+green+red+nir (mosaic Landsat scale).
function brightnessFromScene(img) {
  return ee.Image(img).select(['blue', 'green', 'red', 'nir'])
    .reduce(ee.Reducer.mean()).rename('brightness');
}

function brightnessAnnual(col) {
  return col.map(brightnessFromScene).median().rename('brightness');
}

// Monthly median; no monthly data -> annualFallback; empty month -> annual.
function brightnessMonthly(col, year, month, annualFallback) {
  var ds = ee.Date.fromYMD(year, month, 1);
  var cm = col.filterDate(ds, ds.advance(1, 'month'));
  var mc = cm.map(brightnessFromScene);
  return ee.Image(ee.Algorithms.If(
    cm.size().gt(0),
    mc.median().unmask(annualFallback).rename('brightness'),
    annualFallback));
}

// Monthly MNDWI with annual per-pixel fallback (and full-month if no scenes).
function mndwiForMonth(col, year, month, annualImg) {
  var ds = ee.Date.fromYMD(year, month, 1);
  var cm = col.filterDate(ds, ds.advance(1, 'month'));
  var mc = cm.map(function(img) {
    return img.normalizedDifference(['green', 'swir1']).rename('mndwi');
  });
  return ee.Image(ee.Algorithms.If(
    cm.size().gt(0),
    mc.median().unmask(annualImg).rename('mndwi'),
    annualImg));
}

function listAllAssets(folderId) {
  var out = [], token = null;
  do {
    var resp = token === null
      ? ee.data.listAssets(folderId)
      : ee.data.listAssets(folderId, { pageToken: token });
    var assets = (resp && resp.assets) ? resp.assets : [];
    for (var i = 0; i < assets.length; i++) out.push(assets[i]);
    token = resp && resp.nextPageToken ? resp.nextPageToken : null;
  } while (token);
  return out;
}

function parseWaterObjName(assetId) {
  var base = String(assetId).split('/').pop();
  var parts = base.split('_');
  return { year: parseInt(parts[2], 10), grid: parts[3] };
}

function tableAssetToFc(asset) {
  var path = asset.id || asset.name;
  var m = parseWaterObjName(path);
  return ee.FeatureCollection(path).map(function(f) {
    return f.set({ year: m.year, grid_name: m.grid });
  });
}

function getClassifYear(gName, assetBase, year) {
  var base = assetBase.charAt(assetBase.length - 1) === '/'
    ? assetBase : assetBase + '/';
  var path = base + 'pilot-' + year + '-' + gName + '-' + versionClassif;
  return ee.Image(path).selfMask();
}

function getLandsatForYear(gFc, gName, year) {
  var cfg = gridConfig.getGridConfig(gName, year);
  return {
    cfg:        cfg,
    collection: mosaic.get_Collection2(
      gFc, cfg.cloudCover, [year], cfg.mosaicPreset
    ),
    get_csf:    mosaic.csf
  };
}

function getUmbralForState(state) {
  if (state === 'D') return UMBRAL.D;
  if (state === 'W') return UMBRAL.W;
  return UMBRAL.N;
}

// hardFail without lulcExcl (34/29 CSF rescue clears only LULC exclude).
function hardFailWithoutLulcExcl(ok_img, hardShadow, handTooHigh, snowHard, brightness_m,
    slopeFabdemFail) {
  var hf = ok_img.eq(0).or(hardShadow).or(snowHard);
  if (handTooHigh) hf = hf.or(handTooHigh);
  if (slopeFabdemFail) hf = hf.or(slopeFabdemFail);
  if (USE_BRIGHTNESS_FILTER && brightness_m) {
    hf = hf.or(brightness_m.gte(BRIGHTNESS_HARD).unmask(0));
  }
  return hf;
}

// Rescue prelim water on exclude-class LULC if csf_m passes class threshold.
function buildLulcExclRescue(isWaterPre, lulcClassImg, csf_m, csfMin,
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail) {
  var hardNoLulc = hardFailWithoutLulcExcl(
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail);
  return isWaterPre.and(lulcClassImg)
    .and(csf_m.gte(csfMin))
    .and(hardNoLulc.not())
    .unmask(0).rename('rescue');
}

// Exclude-class LULC rescue if MNDWI >= threshold.
function buildLulcExclRescueMndwi(isWaterPre, lulcClassImg, mndwi_use, mndwiMin,
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail) {
  var hardNoLulc = hardFailWithoutLulcExcl(
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail);
  return isWaterPre.and(lulcClassImg)
    .and(mndwi_use.gte(mndwiMin).unmask(0))
    .and(hardNoLulc.not())
    .unmask(0).rename('rescue');
}

// LULC 33 rescue: prelim water + high pixel frequency.
function buildLulc33FreqRescue(isWaterPre, lulcClass33, freq_year, minFreq) {
  return isWaterPre.and(lulcClass33).and(freq_year.gte(minFreq))
    .unmask(0).rename('rescue');
}

// Apply binary rescue on water0 (avoids .where with masked images).
function applyRescueWhere(water0, preWater, rescueMask) {
  return water0.where(rescueMask.unmask(0).gt(0), preWater);
}

// Exclude-class MNDWI rescues (paired class/threshold lists).
function applyLulcMndwiRescues(water0, preWater, isWaterPre, lulcImgYear, mndwi_use,
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail) {
  if (!USE_LULC_MNDWI_RESCUE || !lulcImgYear) return water0;
  for (var ri = 0; ri < LULC_MNDWI_RESCUE_CLASSES.length; ri++) {
    var cls = LULC_MNDWI_RESCUE_CLASSES[ri];
    var mndwiMin = LULC_MNDWI_RESCUE_MINS[ri];
    var lulcCls = lulcInClasses(lulcImgYear, [cls], 'lulc_mndwi_' + cls);
    water0 = applyRescueWhere(water0, preWater,
      buildLulcExclRescueMndwi(isWaterPre, lulcCls, mndwi_use, mndwiMin,
        ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail));
  }
  return water0;
}

// Threshold/filter config embedded in asset metadata (mask_config_json).
function buildMaskConfigObject(year, mesesAnual, kDispVal, nObsVal) {
  return {
    schema_version: 1,
    export_script:  'step02_seasonal_false_positive_mask',
    version_salida: version_salida,
    version_classif: versionClassif,
    grid_name:      grid_name,
    year:           year,
    macrozona:      MACROZONA_EFECTIVA,
    forcing_type:   forcingType,
    umbrales:       { D: UMBRAL.D, N: UMBRAL.N, W: UMBRAL.W },
    filters: {
      SLOPE_MAX:              SLOPE_MAX,
      USE_FABDEM_SLOPE_FILTER: USE_FABDEM_SLOPE_FILTER,
      SLOPE_FABDEM_MAX:       SLOPE_FABDEM_MAX,
      SOIL_MAX:               SOIL_MAX,
      SNOW_HARD:              SNOW_HARD,
      USE_SOIL_FILTER:        USE_SOIL_FILTER,
      USE_BRIGHTNESS_FILTER:  USE_BRIGHTNESS_FILTER,
      BRIGHTNESS_HARD:        BRIGHTNESS_HARD,
      USE_MNDWI_FILTER:       USE_MNDWI_FILTER,
      USE_MNDWI_MONTHLY:      USE_MNDWI_MONTHLY,
      MNDWI_MIN:              MNDWI_MIN,
      USE_LULC_MASK:          USE_LULC_MASK,
      LULC_MASK_CLASSES:      LULC_MASK_CLASSES,
      USE_LULC_WATER_RESCUE:  USE_LULC_WATER_RESCUE,
      LULC_WATER_CLASSES:     LULC_WATER_CLASSES,
      USE_LULC_GLACIER_RESCUE: USE_LULC_GLACIER_RESCUE,
      LULC_GLACIER_CLASS:     LULC_GLACIER_CLASS,
      LULC_GLACIER_CSF_MIN:   LULC_GLACIER_CSF_MIN,
      USE_LULC_CLASS29_RESCUE: USE_LULC_CLASS29_RESCUE,
      LULC_CLASS29:           LULC_CLASS29,
      LULC_CLASS29_CSF_MIN:   LULC_CLASS29_CSF_MIN,
      USE_LULC_MNDWI_RESCUE:  USE_LULC_MNDWI_RESCUE,
      LULC_MNDWI_RESCUE_CLASSES: LULC_MNDWI_RESCUE_CLASSES,
      LULC_MNDWI_RESCUE_MINS: LULC_MNDWI_RESCUE_MINS,
      USE_LULC_CLASS33_FREQ_RESCUE: USE_LULC_CLASS33_FREQ_RESCUE,
      LULC_CLASS33:           LULC_CLASS33,
      LULC_CLASS33_MIN_FREQ:  LULC_CLASS33_MIN_FREQ,
      USE_HAND:               USE_HAND,
      HAND_HARD_MAX:          HAND_HARD_MAX,
      HAND_PLAIN_MAX:         HAND_PLAIN_MAX,
      HAND_VALID_MAX:         HAND_VALID_MAX,
      HAND_MIN_FREQ_NORM:     HAND_MIN_FREQ_NORM,
      HAND_RESCUE_MIN_FREQ_ABS:  HAND_RESCUE_MIN_FREQ_ABS,
      HAND_RESCUE_MIN_MEAN_FREQ: HAND_RESCUE_MIN_MEAN_FREQ,
      USE_HAND_ZONE:           USE_HAND_ZONE,
      HAND_ZONE_HARD_MAX:     HAND_ZONE_HARD_MAX,
      HAND_ZONE_MNDWI_ANNUAL:     HAND_ZONE_MNDWI_ANNUAL,
      HAND_ZONE_MNDWI_ANNUAL_MIN: HAND_ZONE_MNDWI_ANNUAL_MIN,
      N_MIN_YEAR_OBS:         N_MIN_YEAR_OBS,
      K_LOW_DATA_YEAR:        K_LOW_DATA_YEAR
    },
    run: {
      n_obs_year: nObsVal,
      k_disp:     kDispVal,
      meses_fallback_anual: mesesAnual,
      month_states: monthStates
    }
  };
}

function buildMaskConfigJson(year, mesesAnual, kDispVal, nObsVal) {
  return JSON.stringify(buildMaskConfigObject(year, mesesAnual, kDispVal, nObsVal));
}

// -----------------------------------------------------------------------------
// Visualization
// -----------------------------------------------------------------------------
var VIS_WATER = {
  min: 1, max: 9,
  palette: ['0000ff','009900','5af100','ffffff','000000',
            'ff0000','ff60c7','c6c6c6','ffff00']
};
var VIS_RGB = { bands: ['swir1','nir','red'], gain: [0.08, 0.06, 0.2] };
var VIS_MEAN_FREQ = {
  min: 0, max: 10,
  palette: [
    '#ffffcc', '#fff4b8', '#ffe9a4', '#fddd90', '#fdd27c', '#fdc668',
    '#fdbb54', '#fdaf40', '#fd8d3c', '#f07028', '#d95218', '#800026'
  ]
};

function buildPreviewPanel(diagCtx) {
  var panel = ui.Panel({ style: { width: '420px', padding: '8px', position: 'bottom-right' } });
  panel.add(ui.Label(grid_name + ' ' + diagCtx.year + ' — ' + MACROZONA_EFECTIVA,
    { fontWeight: 'bold', fontSize: '14px', margin: '0 0 4px 0' }));
  panel.add(ui.Label('Capas en mapa: preliminar vs enmascarado. Curva ha: script de revision.',
    { fontSize: '12px', color: 'gray', margin: '0 0 8px 0' }));

  var btnDiag = ui.Button({
    label: 'Agregar capas DIAG al mapa',
    style: { stretch: 'horizontal', margin: '0 0 4px 0' },
    onClick: function() {
      btnDiag.setDisabled(true);
      btnDiag.setLabel('DIAG agregadas (revisa Layers)');
      addDiagLayers(diagCtx);
    }
  });
  panel.add(btnDiag);
  Map.add(panel);
}

// DIAG layers — reuse images already computed in the main loop.
function addDiagLayers(ctx) {
  var m0   = MAP_PREVIEW_MONTHS[0];
  var band = 'w_' + m0;
  var preD  = ctx.waterPrelim.select(band);
  var postD = ctx.waterMasked.select(band);
  var candidate = preD.gte(1).and(preD.lte(3)).and(postD.eq(4));

  // --- Raw values ---
  Map.addLayer(ctx.mean_freq_img.clip(gridGeometry), VIS_MEAN_FREQ,
    'DIAG: mean_freq poligono', false);
  Map.addLayer(ctx.freq_year.clip(gridGeometry),
    { min: 0, max: 12, palette: ['#f7fbff','#2171b5','#08306b'] },
    'DIAG: freq_year pixel', false);
  Map.addLayer((ctx.csf_m_diag || ctx.csf_y).clip(gridGeometry),
    { min: 0, max: 1, palette: ['#ffffcc','#41ab5d','#225ea8'] },
    'DIAG: csf ' + (ctx.modoSoilSnow || 'mes') + ' (unmask anual)', false);
  Map.addLayer(ctx.csf_y.clip(gridGeometry),
    { min: 0, max: 1, palette: ['#ffffcc','#41ab5d','#225ea8'] },
    'DIAG: csf fallback anual', false);
  Map.addLayer(slopeFabdem.clip(gridGeometry), VIS_SLOPE,
    'DIAG: pendiente FABDEM (grados)', false);
  if (USE_FABDEM_SLOPE_FILTER) {
    Map.addLayer(slopeFabdem.gte(SLOPE_FABDEM_MAX).selfMask().clip(gridGeometry),
      { palette: ['#991b1b'] },
      'DIAG: FABDEM >= ' + SLOPE_FABDEM_MAX + ' grados (filtro duro)', false);
  }
  Map.addLayer(ctx.slope_mean_img.selfMask().clip(gridGeometry), VIS_SLOPE,
    'DIAG: mean_slope poligono (ok_img)', false);
  Map.addLayer(ctx.slopeOk.not().selfMask().clip(gridGeometry),
    { palette: ['#ea580c'] },
    'DIAG: slopeOk=0 (mean_slope pol >= ' + SLOPE_MAX + ')', false);
  Map.addLayer(ctx.soil_m_diag.clip(gridGeometry),
    { min: 0, max: 50, palette: ['#f7f7f7','#d7301f'] },
    'DIAG: soil ' + (ctx.modoSoilSnow || 'mes') + ' mes ' + m0, false);
  Map.addLayer(ctx.snow_m_diag.clip(gridGeometry),
    { min: 0, max: 100, palette: ['#ffffff','#4575b4'] },
    'DIAG: snow ' + (ctx.modoSoilSnow || 'mes') + ' ' + m0, false);
  if (ctx.brightness_diag) {
    Map.addLayer(ctx.brightness_diag.clip(gridGeometry),
      { min: 1000, max: 4000, palette: ['#ffffcc','#fd8d3c','#800026'] },
      'DIAG: brightness ' + (ctx.modoSoilSnow || 'mes') + ' ' + m0, false);
    Map.addLayer(ctx.brightness_diag.gte(BRIGHTNESS_HARD).selfMask().clip(gridGeometry),
      { palette: ['#b45309'] },
      'DIAG: brightness >= ' + BRIGHTNESS_HARD + ' (filtro duro)', false);
  }
  if (USE_LULC_MASK) {
    Map.addLayer(getLulcYear(ctx.year).clip(gridGeometry), VIS_LULC,
      'DIAG: LULC ' + lulcYearForProcessing(ctx.year), false);
  }
  if (ctx.handImg) {
    Map.addLayer(ctx.handImg.clip(gridGeometry),
      { min: 0, max: 50, palette: ['#f7fbff','#74a9cf','#0570b0'] },
      'DIAG: HAND (m)', false);
  }
  if (USE_HAND_ZONE && ctx.handZoneMask) {
    Map.addLayer(ctx.handLimitImg.clip(gridGeometry),
      { min: 0, max: 60, palette: ['#fef3c7','#f59e0b','#b45309'] },
      'DIAG: umbral HAND (m) poligono=' + HAND_ZONE_HARD_MAX + ' resto=' + HAND_HARD_MAX,
      false);
    Map.addLayer(ctx.handZoneMask.selfMask().clip(gridGeometry),
      { palette: ['#06b6d4'] },
      'DIAG: zona HAND calibracion', false);
  }
  if (ctx.handTooHigh) {
    Map.addLayer(ctx.handTooHigh.selfMask().clip(gridGeometry),
      { palette: ['#7f1d1d'] },
      'DIAG: HAND >= umbral local (filtro duro)', false);
  }
  if (ctx.mndwi_use_diag) {
    var mndwiTag = USE_MNDWI_MONTHLY
      ? 'mensual+anual (unmask)' : 'anual';
    Map.addLayer(ctx.mndwi_use_diag.clip(gridGeometry),
      { min: -0.5, max: 0.8,
        palette: ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e'] },
      'DIAG: MNDWI ' + mndwiTag, false);
    Map.addLayer(ctx.mndwi_use_diag.lt(MNDWI_MIN).selfMask().clip(gridGeometry),
      { palette: ['#7c3aed'] },
      'DIAG: MNDWI mensual < ' + MNDWI_MIN, false);
  }
  if (ctx.mndwi_annual) {
    Map.addLayer(ctx.mndwi_annual.clip(gridGeometry),
      { min: -0.5, max: 0.8,
        palette: ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e'] },
      'DIAG: MNDWI anual (mediana año)', false);
    if (USE_HAND_ZONE && HAND_ZONE_MNDWI_ANNUAL && ctx.handZoneMask) {
      Map.addLayer(
        ctx.mndwi_use_diag.lt(MNDWI_MIN).and(ctx.mndwi_annual.lt(HAND_ZONE_MNDWI_ANNUAL_MIN))
          .and(ctx.handZoneMask).selfMask().clip(gridGeometry),
        { palette: ['#9333ea'] },
        'DIAG: MNDWI mens+anual bajo umbral (AND, solo zona)', false);
      Map.addLayer(
        ctx.mndwi_annual.lt(HAND_ZONE_MNDWI_ANNUAL_MIN).and(ctx.handZoneMask).selfMask().clip(gridGeometry),
        { palette: ['#a855f7'] },
        'DIAG: MNDWI anual < ' + HAND_ZONE_MNDWI_ANNUAL_MIN + ' (solo zona)', false);
    }
  }
  if (ctx.mndwiSoftFailDiag) {
    Map.addLayer(ctx.mndwiSoftFailDiag.selfMask().clip(gridGeometry),
      { palette: ['#c026d3'] },
      'DIAG: MNDWI softFail efectivo (zona=mens AND anual)', false);
  }

  // --- Mascaras de decision (lo que REALMENTE evalua el codigo) ---
  // Estos son los binarios que entran en el .where. Inspector: 1=triggerea, 0=no.
  if (ctx.lulcExcl) {
    Map.addLayer(ctx.lulcExcl.selfMask().clip(gridGeometry),
      { palette: ['#9333ea'] },
      'DIAG: lulcExcl = 1 (LULC en lista)', false);
  }
  Map.addLayer(ctx.snow_m_diag.gte(SNOW_HARD).selfMask().clip(gridGeometry),
    { palette: ['#1d4ed8'] },
    'DIAG: snow >= ' + SNOW_HARD + ' (filtro duro)', false);
  Map.addLayer(ctx.hardFailDiag.selfMask().clip(gridGeometry),
    { palette: ['#dc2626'] },
    'DIAG: hardFail = 1 (freq+slope pol o sombra o LULC o HAND o FABDEM o snow)', false);
  Map.addLayer(ctx.softFailDiag.selfMask().clip(gridGeometry),
    { palette: ['#f59e0b'] },
    'DIAG: softFail = 1 (CSF mes o soil mes o MNDWI bajo)', false);
  if (ctx.rescateDiag) {
    Map.addLayer(ctx.rescateDiag.selfMask().clip(gridGeometry),
      { palette: ['#06b6d4'] },
      'DIAG: rescate HAND = 1 (revive)', false);
  }
  if (ctx.lulcWaterRescue) {
    Map.addLayer(ctx.lulcWaterRescue.selfMask().clip(gridGeometry),
      { palette: ['#0ea5e9'] },
      'DIAG: rescate LULC agua = 1 (LULC ' + LULC_WATER_CLASSES.join('/') + ')', false);
  }
  if (ctx.glacierRescueDiag) {
    Map.addLayer(ctx.glacierRescueDiag.selfMask().clip(gridGeometry),
      { palette: ['#14b8a6'] },
      'DIAG: rescate LULC ' + LULC_GLACIER_CLASS +
        ' csf>=' + LULC_GLACIER_CSF_MIN, false);
  }
  if (ctx.class29RescueDiag) {
    Map.addLayer(ctx.class29RescueDiag.selfMask().clip(gridGeometry),
      { palette: ['#0d9488'] },
      'DIAG: rescate LULC ' + LULC_CLASS29 +
        ' csf>=' + LULC_CLASS29_CSF_MIN, false);
  }
  if (ctx.lulcMndwiRescueDiags) {
    for (var mdi = 0; mdi < ctx.lulcMndwiRescueDiags.length; mdi++) {
      var md = ctx.lulcMndwiRescueDiags[mdi];
      Map.addLayer(md.mask.selfMask().clip(gridGeometry),
        { palette: [md.color] },
        'DIAG: rescate LULC ' + md.cls + ' MNDWI>=' + md.min, false);
    }
  }
  if (ctx.class33FreqRescueDiag) {
    Map.addLayer(ctx.class33FreqRescueDiag.selfMask().clip(gridGeometry),
      { palette: ['#2563eb'] },
      'DIAG: rescate LULC ' + LULC_CLASS33 +
        ' freq>=' + LULC_CLASS33_MIN_FREQ, false);
  }

  // Causa visualizada solo sobre candidatos a enmascarar
  // Codigo: 1=freq_v(pol+slope), 2=freq_p(pixel), 3=csf, 4=duro absoluto
  // snow/brightness son duros. soil solo si USE_SOIL_FILTER.
  var isHard = ctx.hardShadow
                 .or(ctx.snow_m_diag.gte(SNOW_HARD))
                 .or(ctx.lulcExcl || ee.Image(0))
                 .or(ctx.handTooHigh || ee.Image(0));
  if (USE_BRIGHTNESS_FILTER && ctx.brightness_diag) {
    isHard = isHard.or(ctx.brightness_diag.gte(BRIGHTNESS_HARD));
  }
  if (USE_SOIL_FILTER) {
    isHard = isHard.or(ctx.soil_m_diag.gte(SOIL_MAX));
  }

  var failFreqV = ctx.mean_freq_img.lt(ctx.umbral.freq_mean).or(ctx.slopeOk.not());
  var failFreqP = ctx.freq_year.lt(ctx.umbral.freq_recap);
  var failCsf   = (ctx.csf_m_diag || ctx.csf_y).lte(ctx.umbral.csf);

  var causa = ee.Image(0)
    .where(failCsf,   3)
    .where(failFreqP, 2)
    .where(failFreqV, 1)
    .where(isHard,    4);
  causa = causa.updateMask(candidate).clip(gridGeometry);

  Map.addLayer(causa,
    { min: 1, max: 4, palette: ['#f97316','#a855f7','#ef4444','#6b7280'] },
    'DIAG: causa (1=freq_v 2=freq_p 3=csf 4=duro)', false);

  print('DIAG umbrales (mes ' + m0 + ' ' + MACROZONA_EFECTIVA + '):',
    'freq_mean=' + ctx.umbral.freq_mean,
    'freq_recap=' + ctx.umbral.freq_recap,
    'csf=' + ctx.umbral.csf,
    '| k_disp=' + (ctx.k_dispVal || 'n/a'),
    '| soil/snow/brightness=' + (ctx.modoSoilSnow || 'n/a'));
}

// -----------------------------------------------------------------------------
// Console analysis charts (preview only)
// -----------------------------------------------------------------------------
var Z_ANOM_W =  0.5;
var Z_ANOM_D = -0.5;

function filterFcByGridForcing(fc, forcingTypeArg) {
  return fc.filter(ee.Filter.and(
    ee.Filter.eq('grid_name', grid_name),
    ee.Filter.eq('forcing_type', forcingTypeArg)
  ));
}

// Landsat coverage + climate extreme chart (light: scene counts + problem_flag).
function printDataAvailabilityChart() {
  var yearsChart = ee.List.sequence(1998, 2025).getInfo();

  // n_obs_year per year (server-side)
  var nObsServer = [];
  yearsChart.forEach(function(yr) {
    var lsY = getLandsatForYear(gridFc, grid_name, yr);
    nObsServer.push(ee.Number(ee.List(
      ee.List.sequence(1, 12).map(function(m) {
        var ds = ee.Date.fromYMD(yr, m, 1);
        return ee.Number(lsY.collection.filterDate(ds, ds.advance(1, 'month'))
                           .size().gt(0));
      })
    ).reduce(ee.Reducer.sum())));
  });

  // problem_flag from annual_anomaly_merged (one dictionary)
  var anomCarta = anomFc.filter(ee.Filter.eq('grid_name', grid_name));
  var anomFlags = ee.Dictionary.fromLists(
    yearsChart.map(function(yr) { return String(yr); }),
    yearsChart.map(function(yr) {
      var f = ee.Feature(anomCarta.filter(ee.Filter.eq('year', yr)).first());
      return ee.Algorithms.If(
        anomCarta.filter(ee.Filter.eq('year', yr)).size().gt(0),
        f.get('problem_flag'), 0);
    })
  );

  // Single combined getInfo
  var combined = ee.Dictionary({
    nObs:     ee.List(nObsServer),
    probFlag: anomFlags.values(yearsChart.map(function(yr) { return String(yr); }))
  }).getInfo();

  var nObsValues = combined.nObs;
  var probValues = combined.probFlag;

  var feats = [];
  var lowData = [], extremos = [];
  for (var i = 0; i < yearsChart.length; i++) {
    var yr = yearsChart[i];
    var n  = nObsValues[i];
    var p  = Number(probValues[i]) || 0;
    feats.push(ee.Feature(null, {
      year: yr,
      n_obs_year: n,
      umbral_min: N_MIN_YEAR_OBS
    }));
    if (n < N_MIN_YEAR_OBS) lowData.push(yr);
    if (p === 1) extremos.push(yr);
  }
  var fcAvail = ee.FeatureCollection(feats);

  print(ui.Chart.feature.byFeature({
    features:   fcAvail,
    xProperty:  'year',
    yProperties: ['n_obs_year', 'umbral_min']
  })
  .setChartType('ComboChart')
  .setOptions({
    title: 'Cobertura Landsat por año — meses con ≥ 1 escena (' + grid_name + ')',
    hAxis: { title: 'Año', format: '####', gridlines: { count: 14 } },
    vAxis: { title: 'Meses con datos', minValue: 0, maxValue: 12,
             ticks: [0,2,4,6,8,10,12] },
    seriesType: 'bars',
    series: {
      0: { type: 'bars', color: '#1f6feb' },
      1: { type: 'line', color: '#dc2626', lineDashStyle: [6,3],
           pointSize: 0, lineWidth: 2 }
    },
    legend: { position: 'top' },
    chartArea: { width: '85%' }
  }));

  print('--- Resumen años problemáticos para ' + grid_name + ' ---');
  if (lowData.length === 0) {
    print('  [DATOS] Todos los años tienen >= ' + N_MIN_YEAR_OBS +
          ' meses con escenas Landsat. k_disp nunca se activa.');
  } else {
    print('  [DATOS] Años con datos insuficientes (n_obs_year < ' +
          N_MIN_YEAR_OBS + ', activan k_disp=' + K_LOW_DATA_YEAR +
          ' => umbrales -' + Math.round((1 - K_LOW_DATA_YEAR) * 100) + '%):',
          lowData.join(', '));
  }
  if (extremos.length === 0) {
    print('  [CLIMA] No hay años climáticamente extremos en la serie ' +
          '(|z| < 2σ del caudal/precip anual).');
  } else {
    print('  [CLIMA] Años climáticamente extremos (problem_flag=1, |z| ≥ 2σ):',
          extremos.join(', '));
  }
}

function printConsoleCharts() {
  var geom = gridFc.geometry().bounds();
  var maskCarta = ee.Image().byte().paint(gridFc, 1).selfMask().updateMask(mascarachile);
  var yearsChart = ee.List.sequence(1998, 2025).getInfo();
  var bands = ['w_1','w_2','w_3','w_4','w_5','w_6',
               'w_7','w_8','w_9','w_10','w_11','w_12'];

  // Precompute n_obs_year + problem_flag (one combined getInfo).
  var nObsServer = [];
  yearsChart.forEach(function(yr) {
    var lsY = getLandsatForYear(gridFc, grid_name, yr);
    nObsServer.push(ee.Number(ee.List(
      ee.List.sequence(1, 12).map(function(m) {
        var ds = ee.Date.fromYMD(yr, m, 1);
        return ee.Number(lsY.collection.filterDate(ds, ds.advance(1, 'month'))
                           .size().gt(0));
      })
    ).reduce(ee.Reducer.sum())));
  });

  var anomCarta = anomFc.filter(ee.Filter.eq('grid_name', grid_name));
  var problemServer = yearsChart.map(function(yr) {
    var f = anomCarta.filter(ee.Filter.eq('year', yr));
    return ee.Algorithms.If(f.size().gt(0),
      ee.Feature(f.first()).get('problem_flag'), 0);
  });

  var combined = ee.Dictionary({
    nObs:    ee.List(nObsServer),
    probFlag: ee.List(problemServer)
  }).getInfo();
  var nObsValues = combined.nObs;
  var probValues = combined.probFlag;

  var nObsByYear     = {};
  var problematicSet = {};   // datos insuficientes (n_obs < umbral)
  var extremoSet     = {};   // problem_flag = 1 (climatico)
  yearsChart.forEach(function(yr, idx) {
    nObsByYear[String(yr)] = nObsValues[idx];
    if (nObsValues[idx] < N_MIN_YEAR_OBS) problematicSet[String(yr)] = true;
    if (Number(probValues[idx]) === 1) extremoSet[String(yr)] = true;
  });

  var resultadosFC = ee.FeatureCollection([]);

  bands.forEach(function(banda) {
    var imgs = yearsChart.map(function(yr) {
      var cfgY = gridConfig.getGridConfig(grid_name, yr);
      var base = cfgY.assetActualBase.charAt(cfgY.assetActualBase.length - 1) === '/'
        ? cfgY.assetActualBase : cfgY.assetActualBase + '/';
      var img = ee.Image(base + 'pilot-' + yr + '-' + grid_name + '-' + versionClassif)
        .selfMask().updateMask(maskCarta);
      var isWater = img.select(banda).gte(1).and(img.select(banda).lte(3));
      return pixelArea.updateMask(isWater).rename('y_' + yr);
    });
    var stack = imgs[0];
    for (var i = 1; i < imgs.length; i++) stack = stack.addBands(imgs[i]);
    var dictAreas = stack.reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: geom, scale: 150, maxPixels: 1e12, tileScale: 4
    });
    var monthNum = parseInt(banda.split('_')[1], 10);
    var fcBanda = ee.FeatureCollection(yearsChart.map(function(yr) {
      return ee.Feature(null, {
        year: yr, month: monthNum,
        area_water_ha: dictAreas.get('y_' + yr),
        n_obs_year:    nObsByYear[String(yr)]
      });
    }));
    resultadosFC = resultadosFC.merge(fcBanda);
  });

  var surfaceChart = resultadosFC
    .filter(ee.Filter.notNull(['area_water_ha']))
    .map(function(ft) {
      var y = ee.Number(ft.get('year'));
      var m = ee.Number(ft.get('month'));
      return ft.set({
        time_index: y.multiply(100).add(m),
        time_label: y.format('%d').cat('-').cat(m.format('%02d'))
      });
    }).sort('time_index');

  print(ui.Chart.feature.byFeature({
    features: surfaceChart, xProperty: 'time_label',
    yProperties: ['area_water_ha']
  }).setOptions({
    title: 'Superficie agua preliminar (ha) — ' + grid_name +
           ' [Chile continental]',
    hAxis: { title: 'Año-mes', slantedText: true, slantedTextAngle: 45 },
    vAxis: { title: 'Superficie (ha)' },
    lineWidth: 2, pointSize: 3,
    series: { 0: { color: '#1f6feb' } }
  }));

  // Explicit summary of problematic years.
  var lowDataYrs = [];
  var extremeYrs = [];
  yearsChart.forEach(function(yr) {
    if (problematicSet[String(yr)]) lowDataYrs.push(yr);
    if (extremoSet[String(yr)])     extremeYrs.push(yr);
  });
  print('--- Resumen años problemáticos (curva mensual) ---');
  if (lowDataYrs.length === 0) {
    print('  [DATOS] Todos los años con cobertura Landsat suficiente.');
  } else {
    print('  [DATOS] Años con datos insuficientes:', lowDataYrs.join(', '));
  }
  if (extremeYrs.length === 0) {
    print('  [CLIMA] Sin años climáticamente extremos.');
  } else {
    print('  [CLIMA] Años climáticamente extremos:', extremeYrs.join(', '));
  }

  // Curves use the same forcing_type that drives D/N/W.
  if (forcingType !== 'flow' && forcingType !== 'precip') {
    print('ATENCION: forcing_type invalido:', forcingType); return;
  }
  var isFlow = forcingType === 'flow';
  var yProp = isFlow ? 'annual_value' : 'annual_pp';
  var titleAnual = (isFlow ? 'Caudal anual (DGA)' : 'Precip anual (CR2MET)') + ' — ' + grid_name;
  var titleMens  = (isFlow ? 'Climatologia caudal (DGA)' : 'Climatologia precip (CR2MET)') + ' — ' + grid_name;
  var yMensLabel = isFlow ? 'Caudal mensual (DGA)' : 'Precipitacion mensual (CR2MET)';

  var fcAnom = filterFcByGridForcing(anomFc, forcingType).sort('year');
  if (fcAnom.size().getInfo() > 0) {
    var stats = fcAnom.aggregate_stats(yProp);
    var mu = ee.Number(stats.get('mean'));
    var sd = ee.Number(stats.get('total_sd'));

    var fcAnomThr = fcAnom.map(function(f) {
      return f.set({
        umbral_W: mu.add(sd.multiply(Z_ANOM_W)),
        umbral_D: mu.add(sd.multiply(Z_ANOM_D))
      });
    });

    print(ui.Chart.feature.byFeature({
      features: fcAnomThr, xProperty: 'year',
      yProperties: [yProp, 'umbral_W', 'umbral_D']
    }).setOptions({
      title: titleAnual + ' (lineas: μ±0.5σ)',
      hAxis: { title: 'Año' }, vAxis: { title: titleAnual },
      lineWidth: 2, pointSize: 4,
      series: {
        0: { color: '#1f6feb' },
        1: { color: '#10b981', lineDashStyle: [4,3], pointSize: 0 },
        2: { color: '#a16207', lineDashStyle: [4,3], pointSize: 0 }
      }
    }));
  }

  var fcClim = filterFcByGridForcing(climFc, forcingType);
  if (fcClim.size().getInfo() > 0) {
    var props = fcClim.first().toDictionary().getInfo();
    var p33v = Number(props.p33) || 0;
    var p67v = Number(props.p67) || 0;
    var featsClim = [];
    for (var m = 1; m <= 12; m++) {
      var v = props['m' + m];
      var st = monthStates[m];
      var stNum = st === 'D' ? -1 : (st === 'W' ? 1 : 0);
      featsClim.push(ee.Feature(null, {
        month: m,
        clim_value: (!v || isNaN(v)) ? 0 : Number(v),
        p33_line: p33v, p67_line: p67v,
        state_num: stNum
      }));
    }
    print('Estados estacionales (curva): ' + JSON.stringify(monthStates));
    print(ui.Chart.feature.byFeature({
      features: ee.FeatureCollection(featsClim), xProperty: 'month',
      yProperties: ['clim_value', 'p33_line', 'p67_line']
    }).setOptions({
      title: titleMens + ' (P33=seco / P67=humedo) — D/N/W desde P33/P67',
      hAxis: { title: 'Mes', ticks: [1,2,3,4,5,6,7,8,9,10,11,12] },
      vAxis: { title: yMensLabel },
      lineWidth: 2, pointSize: 4
    }));
  }
}

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------
var VECT_TABLES = listAllAssets(FOLDER_VECT);
print('Rutas postproceso (classification-' + getClassCollectionId(grid_name) + '):');
print('  classification:', getAssetBaseByGrid(grid_name));
print('  VECT:', FOLDER_VECT);
print('  OUT :', ASSET_OUT_ROOT);
print('Tablas vectoriales en', FOLDER_VECT + ':', VECT_TABLES.length);
print('Carta:', grid_name, '| Modo:', RUN_MODE,
      '| MACROZONA config:', MACROZONA);

// Hydroclimate context: grid attrs + climatology (grid+forcing, else grid-only).
// m1..m12, p33, p67 decide D/N/W (same forcing as charts).
var fcAttrCarta = gridAttrs.filter(ee.Filter.eq('grid_name', grid_name));
var attrCtx = ee.Dictionary({
  hasAttr:     fcAttrCarta.size().gt(0),
  forcingType: ee.Algorithms.If(fcAttrCarta.size().gt(0),
                 fcAttrCarta.first().get('forcing_type'), null),
  mzNameRaw:   ee.Algorithms.If(fcAttrCarta.size().gt(0),
                 fcAttrCarta.first().get('macrozone_name'), null)
}).getInfo();

var forcingType = String(attrCtx.forcingType || '').toLowerCase();

var fcClimGF  = climFc.filter(ee.Filter.and(
  ee.Filter.eq('grid_name', grid_name),
  ee.Filter.eq('forcing_type', forcingType)));
var fcClimAll = climFc.filter(ee.Filter.eq('grid_name', grid_name));
var fcClimCarta = ee.FeatureCollection(ee.Algorithms.If(
  fcClimGF.size().gt(0), fcClimGF, fcClimAll));

var climCtx = ee.Dictionary({
  hasClim:           fcClimCarta.size().gt(0),
  usedForcingFilter: fcClimGF.size().gt(0),
  climProps:         ee.Algorithms.If(fcClimCarta.size().gt(0),
                       fcClimCarta.first().toDictionary(), null)
}).getInfo();

var climProps = climCtx.climProps;

if (!climCtx.hasClim) {
  print('ATENCION:', grid_name,
        'sin fila en seasonal_climatology — todos los meses se trataran como N');
} else {
  print('Climatologia mensual:', grid_name,
        '| forcing_type:', forcingType || '(desconocido)',
        climCtx.usedForcingFilter ? '(filtrada grid_name + forcing_type)'
                                  : '(fallback: solo grid_name)');
}

// Macrozone: 'auto' from grid_attributes_hydro_merged_v2; else forced.
var MACROZONA_EFECTIVA = (MACROZONA === 'auto')
  ? attrCtx.mzNameRaw
  : MACROZONA;
if (!UMBRALES_MACROZONA[MACROZONA_EFECTIVA]) {
  throw new Error('Macrozona invalida para ' + grid_name + ': "' +
                  MACROZONA_EFECTIVA + '" (esperado Norte|Centro|Sur|Austral)');
}
var UMBRAL = UMBRALES_MACROZONA[MACROZONA_EFECTIVA];

print('Macrozona:', MACROZONA_EFECTIVA,
      MACROZONA === 'auto' ? '(auto desde grid_attributes_hydro_merged_v2)'
                           : '(forzada manualmente)');
print('UMBRAL D:', JSON.stringify(UMBRAL.D));
print('UMBRAL N:', JSON.stringify(UMBRAL.N));
print('UMBRAL W:', JSON.stringify(UMBRAL.W));

// Seasonal D/N/W from forcing curve:
//   (p67 - p33) < 2  -> N  (flat seasonality)
//   month value <= p33 -> D
//   month value >= p67 -> W
//   else -> N
function classifySeasonClient(month) {
  if (!climProps) return 'N';
  var p33 = Number(climProps.p33) || 0;
  var p67 = Number(climProps.p67) || 0;
  var v   = Number(climProps['m' + month]) || 0;
  var plana = (p67 - p33) < 2;
  if (plana) return 'N';
  if (v <= p33) return 'D';
  if (v >= p67) return 'W';
  return 'N';
}
// Retro-compatible alias.
var getSeasonStateClient = classifySeasonClient;

var monthStates = {};
for (var mi = 1; mi <= 12; mi++) monthStates[mi] = classifySeasonClient(mi);

print('D/N/W desde curva estacional P33/P67 | forzante:', forcingType || '?');
print('Estados estacionales:', JSON.stringify(monthStates));
for (var iy = 0; iy < years.length; iy++) {
  var year = years[iy];

  var landsat         = getLandsatForYear(gridFc, grid_name, year);
  var runCfg          = landsat.cfg;
  var Collection_year = landsat.collection;
  var get_csf_fn      = landsat.get_csf;

  // problem_flag / year_state from annual_anomaly_merged (cheap getInfo)
  var fcAnomYr = anomFc.filter(ee.Filter.and(
    ee.Filter.eq('grid_name', grid_name),
    ee.Filter.eq('year', year)
  ));
  var anomCtx = ee.Dictionary({
    has:        fcAnomYr.size().gt(0),
    state:      ee.Algorithms.If(fcAnomYr.size().gt(0),
                  fcAnomYr.first().get('year_state'), 'N'),
    problem:    ee.Algorithms.If(fcAnomYr.size().gt(0),
                  fcAnomYr.first().get('problem_flag'), 0),
    zGrid:      ee.Algorithms.If(fcAnomYr.size().gt(0),
                  fcAnomYr.first().get('z_grid'), 0)
  }).getInfo();

  var yearLabel = '[' + (anomCtx.state || 'N') + ']';
  if (Number(anomCtx.problem) === 1) {
    yearLabel += ' EXTREMO_CLIMATICO (|z|=' +
                 (Number(anomCtx.zGrid).toFixed(2)) + ')';
  }

  print('Año:', year, yearLabel, '| PRESET:', runCfg.mosaicPreset,
        '| cloud:', runCfg.cloudCover + '%');

  var waterImg = getClassifYear(grid_name, runCfg.assetActualBase, year);

  // Annual products (ensureCsfBands so .select(snow/soil) always works)
  var ColY      = Collection_year.map(get_csf_fn).map(ensureCsfBands);
  var csf_y     = ColY.select('csf').median();
  var soil_y_fb = ColY.select('soil').median();
  var snow_y_fb = ColY.select('snow').median();

  // Annual MNDWI: median of (green-swir1)/(green+swir1) over year scenes.
  var mndwi_year = Collection_year.map(function(img) {
    return img.normalizedDifference(['green', 'swir1']).rename('mndwi')
              .copyProperties(img, ['system:time_start']);
  }).median().rename('mndwi');

  var brightness_y_fb = brightnessAnnual(Collection_year);

  // Monthly scene counts (1 getInfo/year): n_obs_year, k_disp, monthly vs annual fallback.
  var monthSceneCount = ee.List.sequence(1, 12).map(function(m) {
    var ds = ee.Date.fromYMD(year, m, 1);
    return Collection_year.filterDate(ds, ds.advance(1, 'month')).size();
  }).getInfo();

  var mesesConDatos = [];
  var mesesAnual    = [];
  for (var mm = 1; mm <= 12; mm++) {
    if (monthSceneCount[mm - 1] > 0) mesesConDatos.push(mm);
    else mesesAnual.push(mm);
  }

  var nObsVal    = mesesConDatos.length;
  var n_obs_year = ee.Number(nObsVal);
  var kDispVal   = nObsVal < N_MIN_YEAR_OBS ? K_LOW_DATA_YEAR : 1.0;
  var k_disp     = ee.Number(kDispVal);

  print('  n_obs_year:', nObsVal, '| k_disp:', kDispVal,
        kDispVal < 1 ? '(umbrales rebajados ' + Math.round((1-kDispVal)*100) + '%)'
                     : '(umbrales sin cambio)');
  print('  soil/snow/csf/brightness MENSUAL en meses:',
        mesesConDatos.length ? mesesConDatos.join(', ') : 'ninguno',
        '| fallback ANUAL en:',
        mesesAnual.length ? mesesAnual.join(', ') : 'ninguno');

  // Year vector tables
  var vectTablesCarta = VECT_TABLES.filter(function(a) {
    var p = String(a.id || a.name);
    var base = p.split('/').pop();
    return p.indexOf(grid_name) !== -1 && base.indexOf(String(year)) !== -1;
  }).map(tableAssetToFc);

  var vectFcYear = vectTablesCarta.length === 0
    ? ee.FeatureCollection([])
    : ee.FeatureCollection(vectTablesCarta).flatten()
        .filter(ee.Filter.eq('grid_name', grid_name));

  // Paint base 0: no polygon -> mean_freq=0, mean_slope=0 (slopeOk=true).
  var mean_freq_img = ee.Image(0).float().paint(vectFcYear, 'mean_freq');
  var slope_mean_img = ee.Image(0).float().paint(vectFcYear, 'mean_slope');
  var slopeFabdemGrid = slopeFabdem.clip(gridGeometry);
  var slopeOk = slope_mean_img.lt(SLOPE_MAX);
  var slopeFabdemFail = USE_FABDEM_SLOPE_FILTER
    ? slopeFabdemGrid.gte(SLOPE_FABDEM_MAX).unmask(0)
    : null;

  var freq_year      = waterImg.gte(1).and(waterImg.lte(3)).reduce('sum').rename('freq');
  var freq_year_norm = freq_year.divide(n_obs_year.max(1));

  // Year LULC
  var lulcImgYear = (USE_LULC_MASK || USE_LULC_WATER_RESCUE ||
      USE_LULC_GLACIER_RESCUE || USE_LULC_CLASS29_RESCUE ||
      (USE_LULC_MNDWI_RESCUE && LULC_MNDWI_RESCUE_CLASSES.length) ||
      USE_LULC_CLASS33_FREQ_RESCUE)
    ? getLulcYear(year).clip(gridGeometry)
    : null;
  var lulcExcl = USE_LULC_MASK
    ? maskLulcExcludeClasses(lulcImgYear)
    : null;
  // LULC water rescue (11/33): binary; clears softFail if prelim water.
  var lulcWaterRescue = USE_LULC_WATER_RESCUE
    ? lulcInClasses(lulcImgYear, LULC_WATER_CLASSES, 'lulc_water')
    : null;
  var lulcGlacier = USE_LULC_GLACIER_RESCUE
    ? lulcInClasses(lulcImgYear, [LULC_GLACIER_CLASS], 'lulc_glacier')
    : null;
  var lulcClass29 = USE_LULC_CLASS29_RESCUE
    ? lulcInClasses(lulcImgYear, [LULC_CLASS29], 'lulc_class29')
    : null;
  var lulcClass33 = USE_LULC_CLASS33_FREQ_RESCUE
    ? lulcInClasses(lulcImgYear, [LULC_CLASS33], 'lulc_class33')
    : null;

  // HAND + hard filters — once per year (outside monthly loop).
  // handForRescue: base (HAND_VALID_MAX). handTooHigh: hard. handInPlain: soft rescue.
  var handForRescue = getHand();
  var handZoneMask  = USE_HAND_ZONE
    ? buildHandZoneMask(getHandZoneFc(), gridGeometry)
    : null;
  var handLimitImg  = buildHandLimitImg(handZoneMask);
  var handTooHigh   = buildHandTooHigh(handForRescue, handZoneMask);
  var handInPlain   = handForRescue
    ? handForRescue.lte(HAND_PLAIN_MAX)
    : null;
  // unmask(0): shademask does not cover full grid; else masked.or() kills hardFail.
  var hardShadow    = shademask.eq(1).unmask(0);

  // Annual hardAbs: shade OR LULC excl OR HAND high OR FABDEM slope.
  // Polygon slope (SLOPE_MAX) enters via ok_img, not here.
  var hardAbsAnnual = hardShadow;
  if (USE_LULC_MASK) hardAbsAnnual = hardAbsAnnual.or(lulcExcl);
  if (handTooHigh)   hardAbsAnnual = hardAbsAnnual.or(handTooHigh);
  if (slopeFabdemFail) hardAbsAnnual = hardAbsAnnual.or(slopeFabdemFail);

  // csf_y: annual median (fallback for csf_m / empty months)

  // Monthly loop
  var monthBands = [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) {
    var state  = monthStates[m];
    var umbral = getUmbralForState(state);

    var thr_freq_mean  = ee.Number(umbral.freq_mean).multiply(k_disp);
    var thr_freq_recap = ee.Number(umbral.freq_recap).multiply(k_disp);
    var thr_csf        = ee.Number(umbral.csf);

    // ok_img: (polygon freq + slope) OR (pixel freq + slope). No polygon: mean_freq=0
    // fails freq_v; high freq_year may pass freq_p. mean_slope=0 -> slopeOk=true.
    var ok_img = mean_freq_img.gte(thr_freq_mean).and(slopeOk)
                   .or(freq_year.gte(thr_freq_recap).and(slopeOk))
                   .unmask(0);

    var preWater = waterImg.select('w_' + m);
    var isWaterPre = preWater.gte(1).and(preWater.lte(3));

    var ds = ee.Date.fromYMD(year, m, 1);
    var ColM      = Collection_year.filterDate(ds, ds.advance(1, 'month'));
    var ColM_csf  = ColM.map(get_csf_fn).map(ensureCsfBands);
    var hasScenesM = monthSceneCount[m - 1] > 0;

    // Monthly soil/snow/csf; empty month -> annual fallback
    var soil_m = hasScenesM
      ? ColM_csf.select('soil').median().unmask(soil_y_fb)
      : soil_y_fb;
    var snow_m = hasScenesM
      ? ColM_csf.select('snow').median().unmask(snow_y_fb)
      : snow_y_fb;
    var csf_m = hasScenesM
      ? ColM_csf.select('csf').median().unmask(csf_y)
      : csf_y;

    // Monthly brightness (hard) with same fallback pattern
    var brightness_m = USE_BRIGHTNESS_FILTER
      ? (hasScenesM
          ? brightnessMonthly(Collection_year, year, m, brightness_y_fb)
          : brightness_y_fb)
      : null;

    // MNDWI: monthly + unmask(annual) per pixel; or annual only
    var mndwi_use = USE_MNDWI_MONTHLY
      ? mndwiForMonth(Collection_year, year, m, mndwi_year)
      : mndwi_year;

    // exclu_csf depends on seasonal CSF threshold
    var exclu_csf = csf_m.lte(thr_csf)
      .or(freq_year.lte(3).and(csf_m.lte(thr_csf.multiply(2))));

    // Mask strategy — HARD vs SOFT
    // HARD (not HAND-rescuable): ok_img==0 | hardAbsAnnual | snow>=SNOW_HARD | brightness
    // SOFT (HAND-plain rescueable): exclu_csf | soil (opt) | MNDWI (opt)
    var snowHard = snow_m.gte(SNOW_HARD).unmask(0);
    var hardFail = ok_img.eq(0).or(hardAbsAnnual).or(snowHard);
    if (USE_BRIGHTNESS_FILTER) {
      hardFail = hardFail.or(brightness_m.gte(BRIGHTNESS_HARD).unmask(0));
    }
    hardFail = hardFail.unmask(0);
    var softFail = exclu_csf;
    if (USE_SOIL_FILTER) softFail = softFail.or(soil_m.gte(SOIL_MAX).unmask(0));
    if (USE_MNDWI_FILTER) {
      softFail = softFail.or(buildMndwiSoftFail(mndwi_use, mndwi_year, handZoneMask));
    }
    softFail = softFail.unmask(0);

    // HAND rescue candidates: prelim water, not hardFail, softFail, plain HAND,
    // freq_year_norm min AND (abs freq_year OR polygon mean_freq min).
    var rescate = ee.Image(0);
    if (handInPlain) {
      var freqAbsOk = freq_year.gte(HAND_RESCUE_MIN_FREQ_ABS)
                        .or(mean_freq_img.gte(HAND_RESCUE_MIN_MEAN_FREQ));
      rescate = isWaterPre.and(hardFail.not())
                 .and(softFail)
                 .and(handInPlain)
                 .and(freq_year_norm.gte(HAND_MIN_FREQ_NORM))
                 .and(freqAbsOk);
    }

    // Apply: hard->4, soft->4, then HAND / LULC water / CSF / MNDWI / class33 rescues.
    var water0 = preWater
      .where(isWaterPre.and(hardFail), 4)
      .where(isWaterPre.and(softFail), 4)
      .where(rescate.eq(1), preWater);
    if (lulcWaterRescue) {
      water0 = applyRescueWhere(water0, preWater,
        isWaterPre.and(lulcWaterRescue).and(hardFail.not()).unmask(0));
    }
    if (lulcGlacier) {
      water0 = applyRescueWhere(water0, preWater,
        buildLulcExclRescue(isWaterPre, lulcGlacier, csf_m, LULC_GLACIER_CSF_MIN,
          ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail));
    }
    if (lulcClass29 && USE_LULC_CLASS29_RESCUE) {
      water0 = applyRescueWhere(water0, preWater,
        buildLulcExclRescue(isWaterPre, lulcClass29, csf_m, LULC_CLASS29_CSF_MIN,
          ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail));
    }
    water0 = applyLulcMndwiRescues(water0, preWater, isWaterPre, lulcImgYear, mndwi_use,
      ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail);
    if (lulcClass33) {
      water0 = applyRescueWhere(water0, preWater,
        buildLulc33FreqRescue(isWaterPre, lulcClass33, freq_year,
          LULC_CLASS33_MIN_FREQ).and(hardFail.not()).unmask(0));
    }

    return water0.rename('w_' + m);
  });

  // ee.Image.cat keeps w_1..w_12 chronological (no system:index dependency).
  var water_img = ee.Image.cat(monthBands)
    .set('year', year)
    .set('grid_name', grid_name)
    .set('version', version_salida)
    .set('macrozona', MACROZONA_EFECTIVA)
    .set('forcing_type', forcingType)
    .set('month_states_json', JSON.stringify(monthStates))
    .set('country', paisName.toUpperCase())
    .set('meses_fallback_anual', mesesAnual.join(','))
    .set('mask_config_json',
         buildMaskConfigJson(year, mesesAnual.join(','), kDispVal, nObsVal));

  // Preview
  if (RUN_MODE === 'preview') {
    Map.addLayer(gridFc, { color: 'FFFF00' }, 'Carta ' + grid_name, true);

    MAP_PREVIEW_MONTHS.forEach(function(m) {
      var band = 'w_' + m;
      var state = monthStates[m];
      var dsM = ee.Date.fromYMD(year, m, 1);
      var medM = Collection_year.filterDate(dsM, dsM.advance(1, 'month')).median();

      Map.addLayer(medM.updateMask(maskara), VIS_RGB,
        'Mosaico ' + year + '-' + m + ' (' + state + ')', false);
      Map.addLayer(waterImg.select(band).updateMask(maskara), VIS_WATER,
        'Preliminar ' + year + ' ' + band + ' (' + state + ')', false);
      Map.addLayer(water_img.select(band).updateMask(maskara), VIS_WATER,
        'Enmascarado ' + year + ' ' + band + ' (' + state + ')', true);

      var nuevo_fp = waterImg.select(band).gte(1).and(waterImg.select(band).lte(3))
        .and(water_img.select(band).eq(4));
      Map.addLayer(nuevo_fp.selfMask().updateMask(maskara),
        { palette: ['ff0000'] }, 'Nuevo enmascarado ' + band + ' (->4)', false);
    });

    // DIAG context — full decision-mask recompute for preview month (exact .where inputs).
    var m0Diag = MAP_PREVIEW_MONTHS[0];
    var dsD    = ee.Date.fromYMD(year, m0Diag, 1);
    var stateD = monthStates[m0Diag];
    var umbD   = getUmbralForState(stateD);

    var ColM_d     = Collection_year.filterDate(dsD, dsD.advance(1, 'month'));
    var ColM_csf_d = ColM_d.map(get_csf_fn).map(ensureCsfBands);
    var hasScenesD = monthSceneCount[m0Diag - 1] > 0;
    var soil_m_diag = hasScenesD
      ? ColM_csf_d.select('soil').median().unmask(soil_y_fb)
      : soil_y_fb;
    var snow_m_diag = hasScenesD
      ? ColM_csf_d.select('snow').median().unmask(snow_y_fb)
      : snow_y_fb;
    var csf_m_diag = hasScenesD
      ? ColM_csf_d.select('csf').median().unmask(csf_y)
      : csf_y;
    var brightness_diag = USE_BRIGHTNESS_FILTER
      ? (hasScenesD
          ? brightnessMonthly(Collection_year, year, m0Diag, brightness_y_fb)
          : brightness_y_fb)
      : null;
    var mndwi_diag  = USE_MNDWI_MONTHLY
      ? mndwiForMonth(Collection_year, year, m0Diag, mndwi_year)
      : mndwi_year;

    var thr_fm_d = ee.Number(umbD.freq_mean).multiply(k_disp);
    var thr_fr_d = ee.Number(umbD.freq_recap).multiply(k_disp);
    var thr_cs_d = ee.Number(umbD.csf);

    var ok_img_d = mean_freq_img.gte(thr_fm_d).and(slopeOk)
                     .or(freq_year.gte(thr_fr_d).and(slopeOk))
                     .unmask(0);

    var exclu_csf_d = csf_m_diag.lte(thr_cs_d)
                        .or(freq_year.lte(3).and(csf_m_diag.lte(thr_cs_d.multiply(2))));

    var snowHard_d = snow_m_diag.gte(SNOW_HARD).unmask(0);
    var hardFailDiag = ok_img_d.eq(0).or(hardAbsAnnual).or(snowHard_d);
    if (USE_BRIGHTNESS_FILTER) {
      hardFailDiag = hardFailDiag.or(
        brightness_diag.gte(BRIGHTNESS_HARD).unmask(0));
    }
    var softFailDiag = exclu_csf_d;
    if (USE_SOIL_FILTER) softFailDiag = softFailDiag.or(soil_m_diag.gte(SOIL_MAX));
    var mndwiSoftFailDiag = null;
    if (USE_MNDWI_FILTER) {
      mndwiSoftFailDiag = buildMndwiSoftFail(mndwi_diag, mndwi_year, handZoneMask);
      softFailDiag = softFailDiag.or(mndwiSoftFailDiag);
    }

    var rescateDiag = null;
    if (handInPlain) {
      var freqAbsOk_d = freq_year.gte(HAND_RESCUE_MIN_FREQ_ABS)
                          .or(mean_freq_img.gte(HAND_RESCUE_MIN_MEAN_FREQ));
      var isWaterPre_d = waterImg.select('w_' + m0Diag).gte(1)
                          .and(waterImg.select('w_' + m0Diag).lte(3));
      rescateDiag = isWaterPre_d.and(hardFailDiag.not())
                      .and(softFailDiag)
                      .and(handInPlain)
                      .and(freq_year_norm.gte(HAND_MIN_FREQ_NORM))
                      .and(freqAbsOk_d);
    }

    var isWaterPre_d2 = waterImg.select('w_' + m0Diag).gte(1)
                        .and(waterImg.select('w_' + m0Diag).lte(3));
    var glacierRescueDiag = null;
    if (lulcGlacier) {
      glacierRescueDiag = buildLulcExclRescue(
        isWaterPre_d2, lulcGlacier, csf_m_diag, LULC_GLACIER_CSF_MIN,
        ok_img_d, hardShadow, handTooHigh, snowHard_d, brightness_diag, slopeFabdemFail);
    }
    var class29RescueDiag = null;
    if (lulcClass29 && USE_LULC_CLASS29_RESCUE) {
      class29RescueDiag = buildLulcExclRescue(
        isWaterPre_d2, lulcClass29, csf_m_diag, LULC_CLASS29_CSF_MIN,
        ok_img_d, hardShadow, handTooHigh, snowHard_d, brightness_diag, slopeFabdemFail);
    }
    var MNDWI_RESCUE_DIAG_COLORS = ['#84cc16', '#2dd4bf', '#a3e635'];
    var lulcMndwiRescueDiags = [];
    if (USE_LULC_MNDWI_RESCUE && lulcImgYear) {
      for (var mdi = 0; mdi < LULC_MNDWI_RESCUE_CLASSES.length; mdi++) {
        var clsD = LULC_MNDWI_RESCUE_CLASSES[mdi];
        var minD = LULC_MNDWI_RESCUE_MINS[mdi];
        var lulcClsD = lulcInClasses(lulcImgYear, [clsD], 'lulc_mndwi_' + clsD);
        lulcMndwiRescueDiags.push({
          cls: clsD,
          min: minD,
          color: MNDWI_RESCUE_DIAG_COLORS[mdi % MNDWI_RESCUE_DIAG_COLORS.length],
          mask: buildLulcExclRescueMndwi(
            isWaterPre_d2, lulcClsD, mndwi_diag, minD,
            ok_img_d, hardShadow, handTooHigh, snowHard_d, brightness_diag, slopeFabdemFail)
        });
      }
    }
    var class33FreqRescueDiag = null;
    if (lulcClass33) {
      class33FreqRescueDiag = buildLulc33FreqRescue(
        isWaterPre_d2, lulcClass33, freq_year, LULC_CLASS33_MIN_FREQ)
        .and(hardFailDiag.not());
    }

    var diagCtx = {
      waterPrelim:   waterImg,
      waterMasked:   water_img,
      year:          year,
      umbral:        umbD,
      mean_freq_img: mean_freq_img,
      slope_mean_img: slope_mean_img,
      slopeFabdemGrid: slopeFabdemGrid,
      slopeFabdemFail: slopeFabdemFail,
      freq_year:     freq_year,
      csf_y:         csf_y,
      csf_m_diag:    csf_m_diag,
      soil_m_diag:   soil_m_diag,
      snow_m_diag:   snow_m_diag,
      brightness_diag: brightness_diag,
      modoSoilSnow:  hasScenesD ? 'mensual' : 'ANUAL',
      lulcExcl:      lulcExcl,
      lulcWaterRescue: lulcWaterRescue,
      glacierRescueDiag: glacierRescueDiag,
      class29RescueDiag: class29RescueDiag,
      lulcMndwiRescueDiags: lulcMndwiRescueDiags,
      class33FreqRescueDiag: class33FreqRescueDiag,
      handTooHigh:   handTooHigh,
      handZoneMask:  handZoneMask,
      handLimitImg:  handLimitImg,
      hardShadow:    hardShadow,
      slopeOk:       slopeOk,
      handImg:       handForRescue,
      mndwi_use_diag: mndwi_diag,
      mndwi_annual:  mndwi_year,
      mndwiSoftFailDiag: mndwiSoftFailDiag,
      hardFailDiag:  hardFailDiag,
      softFailDiag:  softFailDiag,
      rescateDiag:   rescateDiag,
      k_dispVal:     kDispVal
    };

    buildPreviewPanel(diagCtx);
  }

  // Export
  if (RUN_MODE === 'export') {
    Export.image.toAsset({
      image:       water_img.byte(),
      description: 'water-mask-' + grid_name + '-' + year + '-' + version_salida,
      assetId:     ASSET_OUT_ROOT + 'water-mask-' + grid_name + '-' + year + '-' + version_salida,
      region:      gridGeometry.bounds(),
      scale:       30,
      pyramidingPolicy: { '.default': 'mode' },
      maxPixels:   1e13
    });
  }
}

if (SHOW_DATA_AVAIL_CHART && RUN_MODE === 'preview') {
  printDataAvailabilityChart();
}

if (SHOW_CONSOLE_CHARTS && RUN_MODE === 'preview') {
  printConsoleCharts();
}

Map.addLayer(gridFc.style({ fillColor: '00000001' }), {}, 'Region de trabajo', false);
if (USE_HAND_ZONE && RUN_MODE === 'preview') {
  Map.addLayer(getHandZoneFc().style({ color: '00ffff', fillColor: '00ffff33' }),
    {}, 'Zona HAND calibracion (HAND>=' + HAND_ZONE_HARD_MAX + ' m)', true);
}
print('Listo. Modo:', RUN_MODE, '| Carta:', grid_name,
      '| Macrozona efectiva:', MACROZONA_EFECTIVA);
if (USE_HAND_ZONE) {
  print('Zona HAND activa: HAND>=' + HAND_ZONE_HARD_MAX + ' m dentro del poligono;',
        'HAND>=' + HAND_HARD_MAX + ' m fuera.');
  if (HAND_ZONE_MNDWI_ANNUAL) {
    print('Zona MNDWI: dentro poligono softFail si mensual <', MNDWI_MIN,
          'Y anual <', HAND_ZONE_MNDWI_ANNUAL_MIN, '(ambos, AND)',
          '| fuera: solo mensual.');
  }
}