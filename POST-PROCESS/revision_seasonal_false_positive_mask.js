/**
 * Revision tool — Seasonal false-positive mask (step 02 companion).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Visual QA for one grid and selected years:
 *   1. PRELIMINARY — pilot classification (no mask)
 *   2. EXPORTED    — water-mask asset under review
 *   3. RECOMPUTED  — live recompute (same logic as step 02)
 *
 * Modes:
 *   validate  — DIAG from exported mask_config_json
 *   calibrate — DIAG + layer 3/DIFF using section-1 thresholds
 *
 * Does not export. Surface curves: preliminar vs exported only.
 * Uses MODULES/Module_mosaic_landsat + Module_grid_config (PRESET names).
 */

// -----------------------------------------------------------------------------
// Configuration — edit per revision
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  step: 'revision_seasonal_false_positive_mask',
  country: 'Chile',
  classificationVersion: 1,
  outputVersion: 2,
  gridName: 'SI-19-Y',
  macrozone: 'auto',
  years: [2009, 2021],
  mapPreviewMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  maskAssetPrefix: 'water-mask-',
  chartAreaScale: 60,
  revisionMode: 'validate',  // 'validate' | 'calibrate'
  showShademaskDiag: true
};

var paisName       = CONFIG.country;
var versionClassif = CONFIG.classificationVersion;
var version_salida = CONFIG.outputVersion;
var grid_name = CONFIG.gridName;
var MACROZONA = CONFIG.macrozone;
var years = CONFIG.years;
var MAP_PREVIEW_MONTHS = CONFIG.mapPreviewMonths;
var MASK_ASSET_PREFIX = CONFIG.maskAssetPrefix;
var CHART_AREA_SCALE = CONFIG.chartAreaScale;
var REVISION_MODE = CONFIG.revisionMode;
var SHOW_SHADEMASK_DIAG = CONFIG.showShademaskDiag;
var revisionModeSelect = null;

// Legacy editable block kept below for calibrate mode (section 1 defaults).
// -----------------------------------------------------------------------------
// =================================================================
// 1) UMBRALES Y FILTROS — defaults locales (fallback si el asset no trae metadata)
//    D=mes seco | N=mes neutro | W=mes humedo
// =================================================================
var UMBRALES_MACROZONA = {
  Norte:   { D: { freq_mean: 2.1, freq_recap:  9.0, csf: 0.34 },
             N: { freq_mean: 3.9, freq_recap:  5.0, csf: 0.36 },
             W: { freq_mean: 3.9, freq_recap:  6.0, csf: 0.30 } },
  Centro:  { D: { freq_mean: 2.1, freq_recap:  9.0, csf: 0.32 },
             N: { freq_mean: 1.8, freq_recap:  8.0, csf: 0.33 },
             W: { freq_mean: 1.5, freq_recap:  7.0, csf: 0.38 } },
  Sur:     { D: { freq_mean: 2.0, freq_recap:  6.0, csf: 0.30 },
             N: { freq_mean: 1.7, freq_recap:  8.0, csf: 0.32 },
             W: { freq_mean: 1.4, freq_recap:  10.1, csf: 0.40 } },
  Austral: { D: { freq_mean: 1.8, freq_recap:  8.0, csf: 0.28 },
             N: { freq_mean: 1.5, freq_recap:  7.0, csf: 0.30 },
             W: { freq_mean: 1.2, freq_recap:  6.0, csf: 0.42 } }
};

// SLOPE_MAX (grados): umbral sobre mean_slope de poligonos vectoriales (ok_img).
var SLOPE_MAX  = 20;
// FABDEM por pixel: filtro DURO opcional (hardAbsAnnual), independiente de SLOPE_MAX.
var USE_FABDEM_SLOPE_FILTER = true;
var SLOPE_FABDEM_MAX          = 20;
var SOIL_MAX   = 20;
var SNOW_HARD  = 75;

// Brightness = promedio(blue, green, red, nir). Filtro DURO, mensual + fallback anual.
var USE_BRIGHTNESS_FILTER = false;
var BRIGHTNESS_HARD       = 2000;

// Filtro de suelo (softFail): si false, soil_m NO entra en softFail.
var USE_SOIL_FILTER = false;

// MNDWI. USE_MNDWI_MONTHLY: mediana del mes con unmask(mndwi_year) por pixel;
// mes sin escenas -> mediana anual completa.
var USE_MNDWI_FILTER  = true;
var USE_MNDWI_MONTHLY = true;
var MNDWI_MIN         = -0.15;

// LULC MapBiomas
var USE_LULC_MASK     = true;
var LULC_ASSET        = 'projects/mapbiomas-chile/assets/LULC/COLLECTION-02/CLASSIFICATIONS/classification-final/clasificacion-final-2';
var LULC_YEAR_MIN     = 1999;  // primera banda en asset (no existe 1998)
var LULC_YEAR_MAX     = 2024;
var LULC_MASK_CLASSES = [23, 24, 29, 34, 66];

// Rescate por LULC agua: si el pixel es agua preliminar (1-3) y su clase LULC
// esta en LULC_WATER_CLASSES, se mantiene como agua (anula softFail, NO hardFail).
// Util para humedales (11) o cuerpos con minerales (33) con MNDWI negativo.
var USE_LULC_WATER_RESCUE = true;
var LULC_WATER_CLASSES    = [11, 33];

// Rescate por clase LULC en LULC_MASK_CLASSES (solo anula hardFail por lulcExcl).
var USE_LULC_GLACIER_RESCUE = true;
var LULC_GLACIER_CLASS      = 34;
var LULC_GLACIER_CSF_MIN    = 0.65;

var USE_LULC_CLASS29_RESCUE = false;
var LULC_CLASS29            = 29;
var LULC_CLASS29_CSF_MIN    = 0.9;

// Rescate LULC excluyente por MNDWI: listas pareadas por indice.
var USE_LULC_MNDWI_RESCUE       = true;
var LULC_MNDWI_RESCUE_CLASSES   = [23, 29, 66];
var LULC_MNDWI_RESCUE_MINS      = [0.45, 0, 0.2];

var USE_LULC_CLASS33_FREQ_RESCUE = true;
var LULC_CLASS33            = 33;
var LULC_CLASS33_MIN_FREQ   = 10;

if (USE_LULC_MNDWI_RESCUE &&
    LULC_MNDWI_RESCUE_CLASSES.length !== LULC_MNDWI_RESCUE_MINS.length) {
  throw new Error('LULC_MNDWI_RESCUE_CLASSES y LULC_MNDWI_RESCUE_MINS deben tener el mismo largo');
}

// HAND
var USE_HAND            = true;
var HAND_COLLECTION     = 'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/HAND_GLO30_CHL';
var HAND_BAND           = 'b1';
var HAND_HARD_MAX       = 50;
var HAND_PLAIN_MAX      = 15;
var HAND_VALID_MAX      = 500;
var HAND_MIN_FREQ_NORM  = 0.25;
var HAND_RESCUE_MIN_FREQ_ABS  = 3;
var HAND_RESCUE_MIN_MEAN_FREQ = 1.0;

// Disponibilidad Landsat
var N_MIN_YEAR_OBS  = 6;
var K_LOW_DATA_YEAR = 0.85;

// =================================================================
// 2) RUTAS DE ASSETS
// =================================================================
var GRIDS_ASSET =
  'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile';

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

// Modules — upload github/water/MODULES/*.js to GEE Scripts.
// Edit GEE_MODULES if your Code Editor path differs.
var GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';
var gridConfig = require(GEE_MODULES + '/Module_grid_config');
var mosaic = require(GEE_MODULES + '/Module_mosaic_landsat');

// =================================================================
// 3) ASSETS GLOBALES Y HELPERS
// =================================================================
var grids        = ee.FeatureCollection(GRIDS_ASSET);
var gridFc       = grids.filter(ee.Filter.eq('grid_name', grid_name));
var gridGeometry = gridFc.geometry();
var maskara      = ee.Image(0).paint(gridFc, 1).selfMask();

var fabdem = ee.ImageCollection('projects/sat-io/open-datasets/FABDEM')
               .mosaic().setDefaultProjection('EPSG:3857', null, 30);
// Pendiente FABDEM (grados). Filtro duro opcional: slopeFabdem >= SLOPE_FABDEM_MAX.
var slopeFabdem = ee.Terrain.slope(fabdem).rename('slope_deg');
var VIS_SLOPE = {
  min: 0, max: 40,
  palette: ['#f7f7f7', '#fdae61', '#d7301f', '#7f0000']
};
var SHADEMASK_ASSET =
  'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/shademask2_FABDEM';
var shademask = ee.Image(SHADEMASK_ASSET);
var pixelArea    = ee.Image.pixelArea().divide(10000);
var mascarachile = ee.Image(
  'projects/mapbiomas-chile/assets/ANCILLARY_DATA/STATISTICS/COLLECTION1/VERSION-1/nivel-politico-1-raster'
).gt(0).selfMask();

var lulcStack = USE_LULC_MASK ? ee.Image(LULC_ASSET) : null;

// Paleta MapBiomas LULC (classification8 + clases extendidas Chile)
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
  // unmask(0): evita propagar mascara nativa de LULC por .or()/.and() siguientes.
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

// Garantiza bandas 'snow'/'soil' en cada imagen (algunos modulos de mosaico
// no generan 'snow' -> rompe .select('snow').median()). Rellena con 0.
// OJO: esto cubre "hay imagenes pero les falta la banda"; NO cubre el caso de
// coleccion vacia (mes sin escenas), donde median() da 0 bandas. Ese caso se
// resuelve aparte con el conteo de escenas por mes (ver computeNewMask).
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

// Promedio reflectancia blue+green+red+nir (escala Landsat del mosaico).
function brightnessFromScene(img) {
  return ee.Image(img).select(['blue', 'green', 'red', 'nir'])
    .reduce(ee.Reducer.mean()).rename('brightness');
}

function brightnessAnnual(col) {
  return col.map(brightnessFromScene).median().rename('brightness');
}

function brightnessMonthly(col, year, month, annualFallback) {
  var ds = ee.Date.fromYMD(year, month, 1);
  var cm = col.filterDate(ds, ds.advance(1, 'month'));
  var mc = cm.map(brightnessFromScene);
  return ee.Image(ee.Algorithms.If(
    cm.size().gt(0),
    mc.median().unmask(annualFallback).rename('brightness'),
    annualFallback));
}

// MNDWI = (green - swir1) / (green + swir1).
// Mensual: mediana del mes; huecos por pixel -> fallback mndwi_year;
// mes sin escenas -> imagen anual completa.
function waterIndexForMonth(col, year, month, annualFallback, bandA, bandB, outName) {
  annualFallback = ee.Image(annualFallback).rename(outName);
  var ds = ee.Date.fromYMD(year, month, 1);
  var cm = col.filterDate(ds, ds.advance(1, 'month'));
  var mc = cm.map(function(img) {
    return img.normalizedDifference([bandA, bandB]).rename(outName);
  });
  return ee.Image(ee.Algorithms.If(
    cm.size().gt(0),
    mc.median().unmask(annualFallback).rename(outName),
    annualFallback));
}

function mndwiForMonth(col, year, month, mndwiYear) {
  return waterIndexForMonth(col, year, month, mndwiYear, 'green', 'swir1', 'mndwi');
}

function computeMndwiYear(col) {
  return col.map(function(img) {
    return img.normalizedDifference(['green', 'swir1']).rename('mndwi')
              .copyProperties(img, ['system:time_start']);
  }).median().rename('mndwi');
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

// Asset enmascarado YA exportado.
function getExportedMaskId(year) {
  return ASSET_OUT_ROOT + MASK_ASSET_PREFIX + grid_name + '-' + year +
         '-' + version_salida;
}
function getExportedMask(year) {
  return ee.Image(getExportedMaskId(year));
}

function getLandsatForYear(gFc, gName, year) {
  var cfg = gridConfig.getGridConfig(gName, year);
  return {
    cfg:        cfg,
    collection: mosaic.get_Collection2(
      gFc, cfg.cloudCover, [year], cfg.mosaicPreset),
    get_csf:    mosaic.csf
  };
}

function getUmbralForState(state) {
  if (state === 'D') return UMBRAL.D;
  if (state === 'W') return UMBRAL.W;
  return UMBRAL.N;
}

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

function buildLulcExclRescue(isWaterPre, lulcClassImg, csf_m, csfMin,
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail) {
  var hardNoLulc = hardFailWithoutLulcExcl(
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail);
  return isWaterPre.and(lulcClassImg)
    .and(csf_m.gte(csfMin))
    .and(hardNoLulc.not())
    .unmask(0).rename('rescue');
}

function buildLulcExclRescueMndwi(isWaterPre, lulcClassImg, mndwi_use, mndwiMin,
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail) {
  var hardNoLulc = hardFailWithoutLulcExcl(
    ok_img, hardShadow, handTooHigh, snowHard, brightness_m, slopeFabdemFail);
  return isWaterPre.and(lulcClassImg)
    .and(mndwi_use.gte(mndwiMin).unmask(0))
    .and(hardNoLulc.not())
    .unmask(0).rename('rescue');
}

function buildLulc33FreqRescue(isWaterPre, lulcClass33, freq_year, minFreq) {
  return isWaterPre.and(lulcClass33).and(freq_year.gte(minFreq))
    .unmask(0).rename('rescue');
}

function applyRescueWhere(water0, preWater, rescueMask) {
  return water0.where(rescueMask.unmask(0).gt(0), preWater);
}

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

// Captura defaults del script (fallback) y aplica config parseada desde asset.
var maskConfigSource = 'script (defaults)';

function captureScriptMaskDefaults() {
  return JSON.parse(JSON.stringify({
    schema_version: 1,
    export_script: 'revision_enmascaramiento_estacional',
    grid_name: grid_name,
    macrozona: MACROZONA_EFECTIVA,
    forcing_type: forcingType,
    umbrales: {
      D: UMBRAL.D,
      N: UMBRAL.N,
      W: UMBRAL.W
    },
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
      N_MIN_YEAR_OBS:         N_MIN_YEAR_OBS,
      K_LOW_DATA_YEAR:        K_LOW_DATA_YEAR
    },
    run: {
      month_states: monthStates
    }
  }));
}

function applyMaskConfig(cfg) {
  if (!cfg || !cfg.umbrales || !cfg.filters) {
    throw new Error('mask_config_json invalido (falta umbrales o filters)');
  }
  UMBRAL = cfg.umbrales;
  var f = cfg.filters;
  SLOPE_MAX              = f.SLOPE_MAX;
  USE_FABDEM_SLOPE_FILTER = (f.USE_FABDEM_SLOPE_FILTER !== undefined)
    ? f.USE_FABDEM_SLOPE_FILTER : false;
  SLOPE_FABDEM_MAX       = (f.SLOPE_FABDEM_MAX !== undefined)
    ? f.SLOPE_FABDEM_MAX : SLOPE_MAX;
  SOIL_MAX               = f.SOIL_MAX;
  SNOW_HARD              = f.SNOW_HARD;
  USE_SOIL_FILTER        = f.USE_SOIL_FILTER;
  USE_BRIGHTNESS_FILTER  = f.USE_BRIGHTNESS_FILTER;
  BRIGHTNESS_HARD        = f.BRIGHTNESS_HARD;
  USE_MNDWI_FILTER       = f.USE_MNDWI_FILTER;
  USE_MNDWI_MONTHLY      = f.USE_MNDWI_MONTHLY;
  MNDWI_MIN              = f.MNDWI_MIN;
  USE_LULC_MASK          = f.USE_LULC_MASK;
  LULC_MASK_CLASSES      = f.LULC_MASK_CLASSES;
  USE_LULC_WATER_RESCUE  = f.USE_LULC_WATER_RESCUE;
  LULC_WATER_CLASSES     = f.LULC_WATER_CLASSES;
  USE_LULC_GLACIER_RESCUE = (f.USE_LULC_GLACIER_RESCUE !== undefined)
    ? f.USE_LULC_GLACIER_RESCUE : true;
  LULC_GLACIER_CLASS     = (f.LULC_GLACIER_CLASS !== undefined)
    ? f.LULC_GLACIER_CLASS : 34;
  LULC_GLACIER_CSF_MIN   = (f.LULC_GLACIER_CSF_MIN !== undefined)
    ? f.LULC_GLACIER_CSF_MIN : 0.65;
  USE_LULC_CLASS29_RESCUE = (f.USE_LULC_CLASS29_RESCUE !== undefined)
    ? f.USE_LULC_CLASS29_RESCUE : true;
  LULC_CLASS29           = (f.LULC_CLASS29 !== undefined)
    ? f.LULC_CLASS29 : 29;
  LULC_CLASS29_CSF_MIN   = (f.LULC_CLASS29_CSF_MIN !== undefined)
    ? f.LULC_CLASS29_CSF_MIN : 0.9;
  if (f.LULC_MNDWI_RESCUE_CLASSES && f.LULC_MNDWI_RESCUE_MINS) {
    USE_LULC_MNDWI_RESCUE = (f.USE_LULC_MNDWI_RESCUE !== undefined)
      ? f.USE_LULC_MNDWI_RESCUE : true;
    LULC_MNDWI_RESCUE_CLASSES = f.LULC_MNDWI_RESCUE_CLASSES;
    LULC_MNDWI_RESCUE_MINS = f.LULC_MNDWI_RESCUE_MINS;
  } else {
    // Compatibilidad con exports antiguos (CLASS23 / CLASS29 MNDWI por separado).
    LULC_MNDWI_RESCUE_CLASSES = [];
    LULC_MNDWI_RESCUE_MINS = [];
    if (f.USE_LULC_CLASS23_RESCUE !== false) {
      LULC_MNDWI_RESCUE_CLASSES.push(
        (f.LULC_CLASS23 !== undefined) ? f.LULC_CLASS23 : 23);
      LULC_MNDWI_RESCUE_MINS.push(
        (f.LULC_CLASS23_MNDWI_MIN !== undefined) ? f.LULC_CLASS23_MNDWI_MIN : 0.45);
    }
    if (f.USE_LULC_CLASS29_MNDWI_RESCUE !== false) {
      LULC_MNDWI_RESCUE_CLASSES.push(
        (f.LULC_CLASS29 !== undefined) ? f.LULC_CLASS29 : 29);
      LULC_MNDWI_RESCUE_MINS.push(
        (f.LULC_CLASS29_MNDWI_MIN !== undefined) ? f.LULC_CLASS29_MNDWI_MIN : 0);
    }
    USE_LULC_MNDWI_RESCUE = LULC_MNDWI_RESCUE_CLASSES.length > 0;
  }
  USE_LULC_CLASS33_FREQ_RESCUE = (f.USE_LULC_CLASS33_FREQ_RESCUE !== undefined)
    ? f.USE_LULC_CLASS33_FREQ_RESCUE : true;
  LULC_CLASS33           = (f.LULC_CLASS33 !== undefined)
    ? f.LULC_CLASS33 : 33;
  LULC_CLASS33_MIN_FREQ  = (f.LULC_CLASS33_MIN_FREQ !== undefined)
    ? f.LULC_CLASS33_MIN_FREQ : 10;
  USE_HAND               = f.USE_HAND;
  HAND_HARD_MAX          = f.HAND_HARD_MAX;
  HAND_PLAIN_MAX         = f.HAND_PLAIN_MAX;
  HAND_VALID_MAX         = f.HAND_VALID_MAX;
  HAND_MIN_FREQ_NORM     = f.HAND_MIN_FREQ_NORM;
  HAND_RESCUE_MIN_FREQ_ABS  = f.HAND_RESCUE_MIN_FREQ_ABS;
  HAND_RESCUE_MIN_MEAN_FREQ = f.HAND_RESCUE_MIN_MEAN_FREQ;
  N_MIN_YEAR_OBS         = f.N_MIN_YEAR_OBS;
  K_LOW_DATA_YEAR        = f.K_LOW_DATA_YEAR;
}

function resetMaskConfigToScriptDefaults() {
  applyMaskConfig(MASK_SCRIPT_DEFAULTS);
  maskConfigSource = 'script (defaults)';
}

// Segun REVISION_MODE: metadata del export o defaults editables (seccion 1).
function resolveMaskConfigForYear(year) {
  var mode = revisionModeSelect
    ? revisionModeSelect.getValue()
    : REVISION_MODE;
  if (mode === 'calibrate') {
    resetMaskConfigToScriptDefaults();
    maskConfigSource = 'script (calibrar — seccion 1)';
    print('Modo calibrar:', year,
          '— umbrales/filtros desde seccion 1 del script.');
    print('  Capas binarias DIAG + capa 3 usan estos valores (pueden diferir del export).');
    return false;
  }
  return loadMaskConfigForYear(year);
}
function loadMaskConfigForYear(year) {
  try {
    var json = ee.Image(getExportedMaskId(year)).get('mask_config_json').getInfo();
    if (!json) {
      resetMaskConfigToScriptDefaults();
      print('AVISO:', year,
            'sin mask_config_json en el export — umbrales del script (seccion 1).');
      return false;
    }
    var cfg = JSON.parse(json);
    applyMaskConfig(cfg);
    maskConfigSource = 'asset exportado ' + year;
    print('Modo validar: umbrales/filtros desde export', year,
          '| macrozona', cfg.macrozona || '?',
          '| forcing_type', cfg.forcing_type || forcingType || '?');
    print('  D:', JSON.stringify(UMBRAL.D),
          'N:', JSON.stringify(UMBRAL.N),
          'W:', JSON.stringify(UMBRAL.W));
    if (cfg.run && cfg.run.month_states) {
      print('  month_states en export:', JSON.stringify(cfg.run.month_states));
    }
    print('  month_states activos (selector/DIAG):', JSON.stringify(monthStates));
    return true;
  } catch (e) {
    resetMaskConfigToScriptDefaults();
    print('AVISO: no se pudo leer mask_config_json de', year, '—', e);
    return false;
  }
}

// =================================================================
// 4) VISUALIZACION
// =================================================================
var VIS_WATER = {
  min: 1, max: 9,
  palette: ['0000ff','009900','5af100','ffffff','000000',
            'ff0000','ff60c7','c6c6c6','ffff00']
};
var VIS_RGB = { bands: ['swir1','nir','red'], gain: [0.08, 0.06, 0.2] };
// YlOrRd ampliada (12 tonos): misma familia que #ffffcc / #fd8d3c / #800026
var VIS_MEAN_FREQ = {
  min: 0, max: 10,
  palette: [
    '#ffffcc', '#fff4b8', '#ffe9a4', '#fddd90', '#fdd27c', '#fdc668',
    '#fdbb54', '#fdaf40', '#fd8d3c', '#f07028', '#d95218', '#800026'
  ]
};

// Mascara carta + Chile continental (superficies en consola)
function chartMaskCarta() {
  return ee.Image().byte().paint(gridFc, 1).selfMask().updateMask(mascarachile);
}

// Apila ha de agua (1-3) de los 12 meses en UNA imagen (1 reduceRegion por producto).
function waterAreaStack12(img, prefix) {
  var maskCarta = chartMaskCarta();
  var stack = null;
  for (var m = 1; m <= 12; m++) {
    var band = 'w_' + m;
    var b = img.select(band).updateMask(maskCarta);
    var layer = pixelArea.updateMask(b.gte(1).and(b.lte(3)))
      .rename(prefix + m);
    stack = stack === null ? layer : stack.addBands(layer);
  }
  return stack;
}

// Curva de lineas: 1 sola agregacion (24 bandas) — evita "Too many concurrent
// aggregations" que dispara el loop de 24 reduceRegion en paralelo.
function buildWaterAreaLineChart(year, prelimImg, exportImg) {
  var stack = waterAreaStack12(prelimImg, 'pre_')
    .addBands(waterAreaStack12(exportImg, 'exp_'));
  var sums = stack.reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: gridGeometry,
    scale: CHART_AREA_SCALE,
    maxPixels: 1e11,
    tileScale: 4
  });

  var feats = ee.List.sequence(1, 12).map(function(m) {
    m = ee.Number(m);
    var ms = m.format('%d');
    return ee.Feature(null, {
      month: m,
      preliminar_ha: ee.Number(sums.get(ee.String('pre_').cat(ms))).float(),
      exportado_ha:  ee.Number(sums.get(ee.String('exp_').cat(ms))).float()
    });
  });

  return ui.Chart.feature.byFeature({
    features: ee.FeatureCollection(feats),
    xProperty: 'month',
    yProperties: ['preliminar_ha', 'exportado_ha']
  })
  .setSeriesNames(['Preliminar', 'Enmascarado exportado'])
  .setOptions({
    title: 'Superficie agua (clases 1-3, ha) — ' + grid_name + ' ' + year +
           ' | escala ' + CHART_AREA_SCALE + ' m',
    hAxis: { title: 'Mes', ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    vAxis: { title: 'Superficie (ha)' },
    lineWidth: 2,
    pointSize: 4,
    series: {
      0: { color: '#1f6feb' },
      1: { color: '#e36209', lineDashStyle: [4, 3] }
    },
    chartArea: { width: '82%' }
  });
}

function getPrelimYearImage(year) {
  var cfg = gridConfig.getGridConfig(grid_name, year);
  return getClassifYear(grid_name, cfg.assetActualBase, year);
}

function filterFcByGridForcing(fc, forcingTypeArg) {
  return fc.filter(ee.Filter.and(
    ee.Filter.eq('grid_name', grid_name),
    ee.Filter.eq('forcing_type', forcingTypeArg)
  ));
}

function getClimMonthlyYTitle(typ) {
  if (typ === 'flow') return 'Caudal mensual climatologico (DGA)';
  if (typ === 'precip') return 'Precipitacion mensual climatologica (CR2MET)';
  return 'Variable climatica mensual';
}

function printSeasonalityChart() {
  if (!climProps) {
    print('ATENCION: sin seasonal_climatology para', grid_name);
    return;
  }
  var p33 = Number(climProps.p33) || 0;
  var p67 = Number(climProps.p67) || 0;
  var yTitle = getClimMonthlyYTitle(forcingType);
  var forcingLabel = forcingType === 'flow' ? 'caudal (DGA)'
    : (forcingType === 'precip' ? 'precip (CR2MET)' : forcingType || 'desconocido');
  var feats = [];
  for (var m = 1; m <= 12; m++) {
    var v = Number(climProps['m' + m]) || 0;
    var st = monthStates[m];
    var stNum = st === 'D' ? -1 : (st === 'W' ? 1 : 0);
    feats.push(ee.Feature(null, {
      month: m,
      clim_value: v,
      p33_line: p33,
      p67_line: p67,
      state_num: stNum
    }));
  }

  print('Estacionalidad (' + grid_name + ') | forzante: ' + forcingLabel);
  print('  D/N/W = P33/P67 (bajo=D, alto=W) | estados:', JSON.stringify(monthStates));

  print(ui.Chart.feature.byFeature({
    features: ee.FeatureCollection(feats),
    xProperty: 'month',
    yProperties: ['clim_value', 'p33_line', 'p67_line', 'state_num']
  })
  .setChartType('ComboChart')
  .setOptions({
    title: yTitle + ' (P33=seco / P67=humedo) — ' + grid_name +
      ' — D/N/W desde P33/P67',
    hAxis: { title: 'Mes', ticks: [1,2,3,4,5,6,7,8,9,10,11,12] },
    vAxes: {
      0: { title: yTitle, minValue: 0 },
      1: {
        title: 'Estado aplicado (D/N/W)',
        minValue: -1.2,
        maxValue: 1.2,
        ticks: [{ v: -1, f: 'D' }, { v: 0, f: 'N' }, { v: 1, f: 'W' }]
      }
    },
    seriesType: 'bars',
    lineWidth: 2,
    pointSize: 4,
    series: {
      0: { type: 'line', targetAxisIndex: 0, color: '#1f6feb' },
      1: { type: 'line', targetAxisIndex: 0, color: '#a16207',
           lineDashStyle: [4, 3], pointSize: 0 },
      2: { type: 'line', targetAxisIndex: 0, color: '#10b981',
           lineDashStyle: [4, 3], pointSize: 0 },
      3: { type: 'bars', targetAxisIndex: 1, color: '#64748b' }
    }
  }));
}

function printAnnualTypeChart() {
  var typ = forcingType;
  if (typ !== 'flow' && typ !== 'precip') {
    print('ATENCION: forcing_type invalido o vacio para', grid_name, ':', typ);
    return;
  }
  var forcingLabel = typ === 'flow' ? 'caudal' : 'precipitacion';
  var yProp = typ === 'flow' ? 'annual_value' : 'annual_pp';
  var anomGrid = filterFcByGridForcing(anomFc, typ).sort('year');
  if (anomGrid.size().getInfo() === 0) {
    print('ATENCION: sin annual_anomaly para', grid_name, '| forcing_type:', typ);
    return;
  }
  var stats = anomGrid.aggregate_stats(yProp);
  var mu = ee.Number(stats.get('mean'));
  var sd = ee.Number(stats.get('total_sd'));
  var fc = anomGrid.map(function(f) {
    return f.set({
      umbral_W: mu.add(sd.multiply(0.5)),
      umbral_D: mu.add(sd.multiply(-0.5))
    });
  });

  var yTitle = typ === 'flow' ? 'Caudal anual (DGA)' : 'Precip anual (CR2MET)';
  print('Serie anual por intervalo temporal (' + grid_name + ') | forzante: ' + forcingLabel);
  print(ui.Chart.feature.byFeature({
    features: fc,
    xProperty: 'year',
    yProperties: [yProp, 'umbral_W', 'umbral_D']
  }).setOptions({
    title: yTitle + ' — ' + grid_name + ' (lineas: μ±0.5σ)' +
      ' | ' + forcingLabel,
    hAxis: { title: 'Año' },
    vAxis: { title: yTitle + ' — ' + grid_name },
    lineWidth: 2,
    pointSize: 4,
    series: {
      0: { color: '#1f6feb' },
      1: { color: '#10b981', lineDashStyle: [4, 3], pointSize: 0 },
      2: { color: '#a16207', lineDashStyle: [4, 3], pointSize: 0 }
    }
  }));
}

// =================================================================
// 5) CONTEXTO HIDROCLIMATICO + MACROZONA
// =================================================================
var VECT_TABLES = listAllAssets(FOLDER_VECT);
print('Rutas (classification-' + getClassCollectionId(grid_name) + '):');
print('  preliminar base:', getAssetBaseByGrid(grid_name));
print('  enmascarado OUT:', ASSET_OUT_ROOT);
print('  VECT:', FOLDER_VECT, '| tablas:', VECT_TABLES.length);

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

// =================================================================
// CLASIFICACION ESTACIONAL D/N/W  (regla unica por curva de forzante)
// =================================================================
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
var getSeasonStateClient = classifySeasonClient;

var monthStates = {};
for (var mi = 1; mi <= 12; mi++) monthStates[mi] = classifySeasonClient(mi);

print('D/N/W desde curva estacional P33/P67 | forzante:', forcingType || '?');
print('Estados estacionales:', JSON.stringify(monthStates));
print('Al cargar comparacion se lee mask_config_json del asset exportado (si existe).');

var MASK_SCRIPT_DEFAULTS = captureScriptMaskDefaults();

// =================================================================
// 6) RECOMPUTO EN VIVO DEL ENMASCARADO  (con umbrales editables)
//    Devuelve la imagen 12-bandas "nuevo enmascarado".
//    Misma logica que enmascaramiento_estacional.js (loop mensual).
// =================================================================
function computeNewMask(year) {
  var landsat         = getLandsatForYear(gridFc, grid_name, year);
  var runCfg          = landsat.cfg;
  var Collection_year = landsat.collection;
  var get_csf_fn      = landsat.get_csf;

  var waterImg = getClassifYear(grid_name, runCfg.assetActualBase, year);

  var ColY      = Collection_year.map(get_csf_fn).map(ensureCsfBands);
  var csf_y     = ColY.select('csf').median();
  var soil_y_fb = ColY.select('soil').median();
  var snow_y_fb = ColY.select('snow').median();

  var mndwi_year = computeMndwiYear(Collection_year);

  var brightness_y_fb = brightnessAnnual(Collection_year);

  // Conteo de escenas por mes (1 solo getInfo por año). Define:
  //   - n_obs_year y k_disp (disponibilidad anual)
  //   - por mes, si soil/snow/brightness usan el mensual o caen al fallback anual
  var monthSceneCount = ee.List.sequence(1, 12).map(function(m) {
    var ds = ee.Date.fromYMD(year, m, 1);
    return Collection_year.filterDate(ds, ds.advance(1, 'month')).size();
  }).getInfo();

  var nObsVal = 0;
  for (var cm = 0; cm < 12; cm++) if (monthSceneCount[cm] > 0) nObsVal++;
  var n_obs_year = ee.Number(nObsVal);
  var kDispVal   = nObsVal < N_MIN_YEAR_OBS ? K_LOW_DATA_YEAR : 1.0;
  var k_disp     = ee.Number(kDispVal);

  var freq_year      = waterImg.gte(1).and(waterImg.lte(3)).reduce('sum').rename('freq');
  var freq_year_norm = freq_year.divide(n_obs_year.max(1));

  var vectTablesCarta = VECT_TABLES.filter(function(a) {
    var p = String(a.id || a.name);
    var base = p.split('/').pop();
    return p.indexOf(grid_name) !== -1 && base.indexOf(String(year)) !== -1;
  }).map(tableAssetToFc);

  var vectFcYear = vectTablesCarta.length === 0
    ? ee.FeatureCollection([])
    : ee.FeatureCollection(vectTablesCarta).flatten()
        .filter(ee.Filter.eq('grid_name', grid_name));

  var mean_freq_img = ee.Image(0).float().paint(vectFcYear, 'mean_freq');
  var slope_mean_img = ee.Image(0).float().paint(vectFcYear, 'mean_slope');
  var slopeFabdemGrid = slopeFabdem.clip(gridGeometry);
  var slopeOk = slope_mean_img.lt(SLOPE_MAX);
  var slopeFabdemFail = USE_FABDEM_SLOPE_FILTER
    ? slopeFabdemGrid.gte(SLOPE_FABDEM_MAX).unmask(0)
    : null;

  var lulcImgYear = (USE_LULC_MASK || USE_LULC_WATER_RESCUE ||
      USE_LULC_GLACIER_RESCUE || USE_LULC_CLASS29_RESCUE ||
      (USE_LULC_MNDWI_RESCUE && LULC_MNDWI_RESCUE_CLASSES.length) ||
      USE_LULC_CLASS33_FREQ_RESCUE)
    ? getLulcYear(year).clip(gridGeometry)
    : null;
  var lulcExcl = USE_LULC_MASK
    ? maskLulcExcludeClasses(lulcImgYear)
    : null;
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

  var handForRescue = getHand();
  var handTooHigh   = handForRescue
    ? handForRescue.gte(HAND_HARD_MAX).unmask(0) : null;
  var handInPlain   = handForRescue
    ? handForRescue.lte(HAND_PLAIN_MAX) : null;
  // unmask(0): shademask2_FABDEM no cubre toda la carta.
  var staticShadow = shademask.eq(1).unmask(0);
  var hardShadow = staticShadow;
  var hardAbsAnnual = hardShadow;
  if (USE_LULC_MASK) hardAbsAnnual = hardAbsAnnual.or(lulcExcl);
  if (handTooHigh)   hardAbsAnnual = hardAbsAnnual.or(handTooHigh);
  if (slopeFabdemFail) hardAbsAnnual = hardAbsAnnual.or(slopeFabdemFail);

  var monthBands = [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) {
    var state  = monthStates[m];
    var umbral = getUmbralForState(state);

    var thr_freq_mean  = ee.Number(umbral.freq_mean).multiply(k_disp);
    var thr_freq_recap = ee.Number(umbral.freq_recap).multiply(k_disp);
    var thr_csf        = ee.Number(umbral.csf);

    var ok_img = mean_freq_img.gte(thr_freq_mean).and(slopeOk)
                   .or(freq_year.gte(thr_freq_recap).and(slopeOk))
                   .unmask(0);

    var preWater = waterImg.select('w_' + m);
    var isWaterPre = preWater.gte(1).and(preWater.lte(3));

    var ds = ee.Date.fromYMD(year, m, 1);
    var ColM      = Collection_year.filterDate(ds, ds.advance(1, 'month'));
    var ColM_csf  = ColM.map(get_csf_fn).map(ensureCsfBands);
    var hasScenesM = monthSceneCount[m - 1] > 0;
    var soil_m = hasScenesM
      ? ColM_csf.select('soil').median().unmask(soil_y_fb)
      : soil_y_fb;
    var snow_m = hasScenesM
      ? ColM_csf.select('snow').median().unmask(snow_y_fb)
      : snow_y_fb;
    var csf_m = hasScenesM
      ? ColM_csf.select('csf').median().unmask(csf_y)
      : csf_y;

    var brightness_m = USE_BRIGHTNESS_FILTER
      ? (hasScenesM
          ? brightnessMonthly(Collection_year, year, m, brightness_y_fb)
          : brightness_y_fb)
      : null;

    var mndwi_use = USE_MNDWI_MONTHLY
      ? mndwiForMonth(Collection_year, year, m, mndwi_year)
      : mndwi_year;

    var exclu_csf = csf_m.lte(thr_csf)
      .or(freq_year.lte(3).and(csf_m.lte(thr_csf.multiply(2))));

    var snowHard = snow_m.gte(SNOW_HARD).unmask(0);
    var hardFail = ok_img.eq(0).or(hardAbsAnnual).or(snowHard);
    if (USE_BRIGHTNESS_FILTER) {
      hardFail = hardFail.or(brightness_m.gte(BRIGHTNESS_HARD).unmask(0));
    }
    hardFail = hardFail.unmask(0);
    var softFail = exclu_csf;
    if (USE_SOIL_FILTER) softFail = softFail.or(soil_m.gte(SOIL_MAX).unmask(0));
    if (USE_MNDWI_FILTER) {
      softFail = softFail.or(mndwi_use.lt(MNDWI_MIN).unmask(0));
    }
    softFail = softFail.unmask(0);

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

  var water_img = ee.Image.cat(monthBands);

  return {
    waterImg:  waterImg,    // preliminar (12 bandas)
    newMask:   water_img,   // nuevo enmascarado recalculado (12 bandas)
    runCfg:    runCfg,
    collection: Collection_year,
    get_csf:   get_csf_fn,
    // --- intermedios anuales para DIAG ---
    csf_y:          csf_y,
    soil_y_fb:      soil_y_fb,
    snow_y_fb:      snow_y_fb,
    brightness_y_fb: brightness_y_fb,
    mndwi_year:     mndwi_year,
    monthSceneCount: monthSceneCount,
    n_obs_year:     n_obs_year,
    k_disp:         k_disp,
    mean_freq_img:  mean_freq_img,
    slope_mean_img: slope_mean_img,
    slopeFabdemGrid: slopeFabdemGrid,
    slopeFabdemFail: slopeFabdemFail,
    freq_year:      freq_year,
    freq_year_norm: freq_year_norm,
    lulcExcl:       lulcExcl,
    lulcWaterRescue: lulcWaterRescue,
    lulcGlacier:    lulcGlacier,
    lulcImgYear:    lulcImgYear,
    lulcClass29:    lulcClass29,
    lulcClass33:    lulcClass33,
    handImg:        handForRescue,
    handTooHigh:    handTooHigh,
    handInPlain:    handInPlain,
    staticShadow:   staticShadow,
    hardShadow:     hardShadow,
    hardAbsAnnual:  hardAbsAnnual,
    slopeOk:        slopeOk,
  };
}

// Recalcula las mascaras de decision para un mes y agrega TODAS las capas DIAG.
// Muestra exactamente lo que el codigo evalua (no aproximaciones).
function addDiagLayers(comp, year, month) {
  var band  = 'w_' + month;
  var state = monthStates[month];
  var umbral = getUmbralForState(state);
  var tag   = year + ' ' + band + ' (' + state + ')';

  var preD  = comp.waterImg.select(band);
  var postD = comp.newMask.select(band);
  var candidate = preD.gte(1).and(preD.lte(3)).and(postD.eq(4));

  var hasScenesM = comp.monthSceneCount[month - 1] > 0;
  var modoTag    = hasScenesM ? 'mensual' : 'ANUAL';
  var dsD = ee.Date.fromYMD(year, month, 1);
  var ColM_csf = comp.collection.filterDate(dsD, dsD.advance(1, 'month'))
                   .map(comp.get_csf).map(ensureCsfBands);
  var soil_m = hasScenesM
    ? ColM_csf.select('soil').median().unmask(comp.soil_y_fb)
    : comp.soil_y_fb;
  var snow_m = hasScenesM
    ? ColM_csf.select('snow').median().unmask(comp.snow_y_fb)
    : comp.snow_y_fb;
  var csf_m = hasScenesM
    ? ColM_csf.select('csf').median().unmask(comp.csf_y)
    : comp.csf_y;
  var brightness_m = USE_BRIGHTNESS_FILTER
    ? (hasScenesM
        ? brightnessMonthly(comp.collection, year, month, comp.brightness_y_fb)
        : comp.brightness_y_fb)
    : null;

  var mndwi_use = USE_MNDWI_MONTHLY
    ? mndwiForMonth(comp.collection, year, month, comp.mndwi_year)
    : comp.mndwi_year;

  // --- VALORES CRUDOS ---
  Map.addLayer(comp.mean_freq_img.clip(gridGeometry), VIS_MEAN_FREQ,
    'DIAG mean_freq poligono ' + tag, false);
  Map.addLayer(comp.freq_year.clip(gridGeometry),
    { min: 0, max: 12, palette: ['#f7fbff','#2171b5','#08306b'] },
    'DIAG freq_year pixel ' + tag, false);
  Map.addLayer(comp.freq_year_norm.clip(gridGeometry),
    { min: 0, max: 1, palette: ['#f7fbff','#2171b5','#08306b'] },
    'DIAG freq_year_norm ' + tag, false);
  Map.addLayer(csf_m.clip(gridGeometry),
    { min: 0, max: 1, palette: ['#ffffcc','#41ab5d','#225ea8'] },
    'DIAG csf ' + modoTag + ' unmask anual ' + tag, false);
  Map.addLayer(comp.csf_y.clip(gridGeometry),
    { min: 0, max: 1, palette: ['#ffffcc','#41ab5d','#225ea8'] },
    'DIAG csf fallback anual ' + tag, false);
  Map.addLayer(slopeFabdem.clip(gridGeometry), VIS_SLOPE,
    'DIAG pendiente FABDEM (grados) ' + tag, false);
  if (USE_FABDEM_SLOPE_FILTER) {
    Map.addLayer(slopeFabdem.gte(SLOPE_FABDEM_MAX).selfMask().clip(gridGeometry),
      { palette: ['#991b1b'] },
      'DIAG FABDEM >= ' + SLOPE_FABDEM_MAX + ' grados (filtro duro) ' + tag, false);
  }
  Map.addLayer(comp.slope_mean_img.selfMask().clip(gridGeometry), VIS_SLOPE,
    'DIAG mean_slope poligono (ok_img) ' + tag, false);
  Map.addLayer(comp.slopeOk.not().selfMask().clip(gridGeometry),
    { palette: ['#ea580c'] },
    'DIAG slopeOk=0 (mean_slope pol >= ' + SLOPE_MAX + ') ' + tag, false);
  Map.addLayer(soil_m.clip(gridGeometry),
    { min: 0, max: 50, palette: ['#f7f7f7','#d7301f'] },
    'DIAG soil ' + modoTag + ' ' + tag, false);
  Map.addLayer(snow_m.clip(gridGeometry),
    { min: 0, max: 100, palette: ['#ffffff','#4575b4'] },
    'DIAG snow ' + modoTag + ' ' + tag, false);
  if (brightness_m) {
    Map.addLayer(brightness_m.clip(gridGeometry),
      { min: 1000, max: 4000, palette: ['#ffffcc','#fd8d3c','#800026'] },
      'DIAG brightness ' + modoTag + ' ' + tag, false);
    Map.addLayer(brightness_m.gte(BRIGHTNESS_HARD).selfMask().clip(gridGeometry),
      { palette: ['#b45309'] },
      'DIAG brightness>=' + BRIGHTNESS_HARD + ' duro ' + tag, false);
  }
  if (USE_LULC_MASK) {
    Map.addLayer(getLulcYear(year).clip(gridGeometry), VIS_LULC,
      'DIAG LULC ' + lulcYearForProcessing(year) + ' ' + tag, false);
  }
  if (comp.handImg) {
    Map.addLayer(comp.handImg.clip(gridGeometry),
      { min: 0, max: 50, palette: ['#f7fbff','#74a9cf','#0570b0'] },
      'DIAG HAND (m) ' + tag, false);
  }
  Map.addLayer(mndwi_use.clip(gridGeometry),
    { min: -0.5, max: 0.8,
      palette: ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e'] },
    'DIAG MNDWI ' + (USE_MNDWI_MONTHLY ? 'mensual+anual' : 'anual') + ' ' + tag,
    false);
  Map.addLayer(comp.mndwi_year.clip(gridGeometry),
    { min: -0.5, max: 0.8,
      palette: ['#8c510a','#d8b365','#f6e8c3','#c7eae5','#5ab4ac','#01665e'] },
    'DIAG MNDWI fallback anual (green-swir1) ' + tag, false);

  // --- MASCARAS DE DECISION (binarios 0/1 que entran al .where) ---
  var thr_fm = ee.Number(umbral.freq_mean).multiply(comp.k_disp);
  var thr_fr = ee.Number(umbral.freq_recap).multiply(comp.k_disp);
  var thr_cs = ee.Number(umbral.csf);

  var ok_img = comp.mean_freq_img.gte(thr_fm).and(comp.slopeOk)
                 .or(comp.freq_year.gte(thr_fr).and(comp.slopeOk))
                 .unmask(0);
  var exclu_csf = csf_m.lte(thr_cs)
    .or(comp.freq_year.lte(3).and(csf_m.lte(thr_cs.multiply(2))));

  var snowHard = snow_m.gte(SNOW_HARD).unmask(0);
  var hardShadow = comp.hardShadow;
  var hardAbsAnnual = comp.hardAbsAnnual;
  var hardNoLulc = hardFailWithoutLulcExcl(
    ok_img, hardShadow, comp.handTooHigh, snowHard, brightness_m, comp.slopeFabdemFail);
  var hardFail = ok_img.eq(0).or(hardAbsAnnual).or(snowHard);
  if (USE_BRIGHTNESS_FILTER && brightness_m) {
    hardFail = hardFail.or(brightness_m.gte(BRIGHTNESS_HARD).unmask(0));
  }
  var softFail = exclu_csf;
  if (USE_SOIL_FILTER) softFail = softFail.or(soil_m.gte(SOIL_MAX).unmask(0));
  if (USE_MNDWI_FILTER) {
    softFail = softFail.or(mndwi_use.lt(MNDWI_MIN).unmask(0));
  }
  softFail = softFail.unmask(0);

  var preIsW = preD.gte(1).and(preD.lte(3));
  var rescate = ee.Image(0);
  if (comp.handInPlain) {
    var freqAbsOk = comp.freq_year.gte(HAND_RESCUE_MIN_FREQ_ABS)
                      .or(comp.mean_freq_img.gte(HAND_RESCUE_MIN_MEAN_FREQ));
    rescate = preIsW.and(hardFail.not()).and(softFail)
                .and(comp.handInPlain)
                .and(comp.freq_year_norm.gte(HAND_MIN_FREQ_NORM))
                .and(freqAbsOk);
  }

  if (SHOW_SHADEMASK_DIAG) {
    Map.addLayer(shademask.clip(gridGeometry),
      { min: 0, max: 1, palette: ['000000', 'fbbf24'] },
      'DIAG shademask2_FABDEM asset ' + tag, false);
    Map.addLayer(comp.staticShadow.selfMask().clip(gridGeometry),
      { palette: ['#fbbf24'] },
      'DIAG hardShadow=1 (shademask2) ' + tag, false);
    Map.addLayer(hardNoLulc.selfMask().clip(gridGeometry),
      { palette: ['#b91c1c'] },
      'DIAG hardNoLulc=1 (bloquea rescate LULC CSF/MNDWI) ' + tag, false);
  }
  Map.addLayer(ok_img.eq(0).selfMask().clip(gridGeometry),
    { palette: ['#ea580c'] },
    'DIAG ok_img=0 (freq+slope) ' + tag, false);
  if (comp.lulcExcl) {
    Map.addLayer(comp.lulcExcl.selfMask().clip(gridGeometry),
      { palette: ['#9333ea'] }, 'DIAG lulcExcl=1 ' + tag, false);
  }
  if (comp.handTooHigh) {
    Map.addLayer(comp.handTooHigh.selfMask().clip(gridGeometry),
      { palette: ['#7f1d1d'] },
      'DIAG HAND>=' + HAND_HARD_MAX + 'm duro ' + tag, false);
  }
  Map.addLayer(snowHard.selfMask().clip(gridGeometry),
    { palette: ['#1d4ed8'] }, 'DIAG snow>=' + SNOW_HARD + ' duro ' + tag, false);
  Map.addLayer(mndwi_use.lt(MNDWI_MIN).selfMask().clip(gridGeometry),
    { palette: ['#7c3aed'] }, 'DIAG MNDWI<' + MNDWI_MIN + ' ' + tag, false);
  Map.addLayer(hardFail.selfMask().clip(gridGeometry),
    { palette: ['#dc2626'] }, 'DIAG hardFail=1 ' + tag, false);
  Map.addLayer(softFail.selfMask().clip(gridGeometry),
    { palette: ['#f59e0b'] }, 'DIAG softFail=1 ' + tag, false);
  Map.addLayer(rescate.selfMask().clip(gridGeometry),
    { palette: ['#06b6d4'] }, 'DIAG rescate HAND=1 ' + tag, false);
  if (comp.lulcWaterRescue) {
    Map.addLayer(comp.lulcWaterRescue.selfMask().clip(gridGeometry),
      { palette: ['#0ea5e9'] },
      'DIAG rescate LULC agua=1 (LULC ' + LULC_WATER_CLASSES.join('/') + ') ' + tag,
      false);
  }
  if (comp.lulcGlacier) {
    var glacierRescue = buildLulcExclRescue(
      preIsW, comp.lulcGlacier, csf_m, LULC_GLACIER_CSF_MIN,
      ok_img, hardShadow, comp.handTooHigh, snowHard, brightness_m, comp.slopeFabdemFail);
    Map.addLayer(glacierRescue.selfMask().clip(gridGeometry),
      { palette: ['#14b8a6'] },
      'DIAG rescate LULC ' + LULC_GLACIER_CLASS +
        ' csf>=' + LULC_GLACIER_CSF_MIN + ' ' + tag, false);
  }
  if (comp.lulcClass29 && USE_LULC_CLASS29_RESCUE) {
    var class29Rescue = buildLulcExclRescue(
      preIsW, comp.lulcClass29, csf_m, LULC_CLASS29_CSF_MIN,
      ok_img, hardShadow, comp.handTooHigh, snowHard, brightness_m, comp.slopeFabdemFail);
    Map.addLayer(class29Rescue.selfMask().clip(gridGeometry),
      { palette: ['#0d9488'] },
      'DIAG rescate LULC ' + LULC_CLASS29 +
        ' csf>=' + LULC_CLASS29_CSF_MIN + ' ' + tag, false);
  }
  if (USE_LULC_MNDWI_RESCUE && comp.lulcImgYear) {
    var MNDWI_RESCUE_DIAG_COLORS = ['#84cc16', '#2dd4bf', '#a3e635'];
    for (var mdi = 0; mdi < LULC_MNDWI_RESCUE_CLASSES.length; mdi++) {
      var clsD = LULC_MNDWI_RESCUE_CLASSES[mdi];
      var minD = LULC_MNDWI_RESCUE_MINS[mdi];
      var lulcClsD = lulcInClasses(comp.lulcImgYear, [clsD], 'lulc_mndwi_' + clsD);
      var mndwiRescue = buildLulcExclRescueMndwi(
        preIsW, lulcClsD, mndwi_use, minD,
        ok_img, hardShadow, comp.handTooHigh, snowHard, brightness_m, comp.slopeFabdemFail);
      Map.addLayer(mndwiRescue.selfMask().clip(gridGeometry),
        { palette: [MNDWI_RESCUE_DIAG_COLORS[mdi % MNDWI_RESCUE_DIAG_COLORS.length]] },
        'DIAG rescate LULC ' + clsD + ' MNDWI>=' + minD + ' ' + tag, false);
    }
  }
  if (comp.lulcClass33) {
    var class33FreqRescue = buildLulc33FreqRescue(
      preIsW, comp.lulcClass33, comp.freq_year, LULC_CLASS33_MIN_FREQ)
      .and(hardFail.not());
    Map.addLayer(class33FreqRescue.selfMask().clip(gridGeometry),
      { palette: ['#2563eb'] },
      'DIAG rescate LULC ' + LULC_CLASS33 +
        ' freq>=' + LULC_CLASS33_MIN_FREQ + ' ' + tag, false);
  }
  Map.addLayer(postD.clip(gridGeometry), VIS_WATER,
    'DIAG recalc clase final ' + tag, false);

  var isHard = hardShadow.or(snowHard)
                 .or(comp.lulcExcl || ee.Image(0))
                 .or(comp.handTooHigh || ee.Image(0))
                 .or(comp.slopeFabdemFail || ee.Image(0));
  if (USE_BRIGHTNESS_FILTER && brightness_m) {
    isHard = isHard.or(brightness_m.gte(BRIGHTNESS_HARD));
  }
  if (USE_SOIL_FILTER) isHard = isHard.or(soil_m.gte(SOIL_MAX));
  var failFreqV = comp.mean_freq_img.lt(umbral.freq_mean).or(comp.slopeOk.not());
  var failFreqP = comp.freq_year.lt(umbral.freq_recap);
  var failCsf   = csf_m.lte(umbral.csf);
  var causa = ee.Image(0)
    .where(failCsf, 3).where(failFreqP, 2).where(failFreqV, 1).where(isHard, 4)
    .updateMask(candidate).clip(gridGeometry);
  Map.addLayer(causa,
    { min: 1, max: 4, palette: ['#f97316','#a855f7','#ef4444','#6b7280'] },
    'DIAG causa ' + tag + ' (1=freq_v 2=freq_p 3=csf 4=duro)', false);

  print('DIAG ' + tag + ' | umbral=' + JSON.stringify(umbral) +
        ' | k_disp=' + comp.k_disp.getInfo() +
        ' | soil/snow/csf/brightness=' + (hasScenesM ? 'MENSUAL' : 'ANUAL (sin escenas)'));
}

// =================================================================
// 7) AGREGAR COMPARACION AL MAPA  (año + mes seleccionados)
// =================================================================
var soilSnowStatus = null;
var maskConfigStatus = null;

function addGridOutline() {
  Map.addLayer(gridFc.style({ fillColor: '00000000', color: 'FFFF00' }),
    {}, 'Carta ' + grid_name, true);
}

function addComparisonLayers(year, month) {
  // Limpia todas las capas previas para que el panel no se llene al cambiar
  // de mes/año. Re-agrega solo el contorno de la carta.
  Map.layers().reset();
  addGridOutline();

  var band  = 'w_' + month;
  var state = monthStates[month];
  var tag   = year + ' ' + band + ' (' + state + ')';

  resolveMaskConfigForYear(year);
  if (maskConfigStatus) {
    var modeLbl = revisionModeSelect
      ? revisionModeSelect.getValue()
      : REVISION_MODE;
    maskConfigStatus.setValue(
      'Modo ' + modeLbl + ' | umbrales: ' + maskConfigSource);
  }

  var comp      = computeNewMask(year);
  var prelim    = comp.waterImg.select(band);
  var nuevo     = comp.newMask.select(band);
  var exportFull = getExportedMask(year);
  var exportImg = exportFull.select(band);

  var isCalibrate = (revisionModeSelect
    ? revisionModeSelect.getValue()
    : REVISION_MODE) === 'calibrate';

  var modoMes = comp.monthSceneCount[month - 1] > 0
    ? 'MENSUAL' : 'ANUAL (mes sin escenas)';
  var mesesAnual = [];
  for (var mm = 1; mm <= 12; mm++) {
    if (comp.monthSceneCount[mm - 1] === 0) mesesAnual.push(mm);
  }
  var resumenAnual = mesesAnual.length ? mesesAnual.join(', ') : 'ninguno';
  if (soilSnowStatus) {
    soilSnowStatus.setValue(
      'soil/snow/brightness mes ' + month + ': ' + modoMes +
      '  |  fallback anual en meses: ' + resumenAnual);
  }
  print('soil/snow/brightness ' + tag + ':', modoMes,
        '| fallback anual en meses:', resumenAnual);

  // Mosaico RGB del mes
  var dsM = ee.Date.fromYMD(year, month, 1);
  var medM = comp.collection.filterDate(dsM, dsM.advance(1, 'month')).median();
  Map.addLayer(medM.updateMask(maskara), VIS_RGB,
    'Mosaico ' + tag, false);

  // Capas principales
  Map.addLayer(prelim.updateMask(maskara), VIS_WATER,
    '1. Preliminar ' + tag, false);
  Map.addLayer(exportImg.updateMask(maskara), VIS_WATER,
    '2. Enmascarado EXPORTADO ' + tag, true);
  Map.addLayer(nuevo.updateMask(maskara), VIS_WATER,
    '3. RECALCULADO (mask_config) ' + tag, false);

  // Nuevos FP (pre agua 1-3 -> 4) en cada version
  var preIsWater = prelim.gte(1).and(prelim.lte(3));
  var fpExport = preIsWater.and(exportImg.eq(4));
  Map.addLayer(fpExport.selfMask().updateMask(maskara),
    { palette: ['ff0000'] }, 'FP exportado (->4) ' + tag, false);
  var fpNuevo = preIsWater.and(nuevo.eq(4));
  Map.addLayer(fpNuevo.selfMask().updateMask(maskara),
    { palette: ['ff8800'] }, 'FP recalc (->4) ' + tag, false);

  // DIFF exportado vs recalculado (donde difiere la clase final)
  var nuevoMasked  = nuevo.eq(4);
  var exportMasked = exportImg.eq(4);
  var diff = ee.Image(0)
    .where(nuevoMasked.and(exportMasked.not()), 1)
    .where(exportMasked.and(nuevoMasked.not()), 2)
    .updateMask(preIsWater)
    .selfMask();
  Map.addLayer(diff.updateMask(maskara),
    { min: 1, max: 2, palette: ['#dc2626', '#06b6d4'] },
    'DIFF recalc vs export ' + tag +
      ' (rojo=recalc+ estricto, cian=export+ estricto/debe re-exportar)',
    false);

  if (isCalibrate) {
    print('Modo calibrar: capa 3 usa seccion 1 del script (puede diferir del export).');
  }

  // Todas las capas DIAG (insumos crudos + mascaras de decision) del mes
  addDiagLayers(comp, year, month);

  print('Comparacion cargada:', tag,
        '| umbral ' + state + ':', JSON.stringify(getUmbralForState(state)));
}

// =================================================================
// 8) PANEL DE CONTROL
// =================================================================
Map.centerObject(gridGeometry, 9);

var panel = ui.Panel({ style: {
  width: '330px', padding: '10px', position: 'bottom-right'
}});
panel.add(ui.Label('Revision enmascaramiento — ' + grid_name,
  { fontWeight: 'bold', fontSize: '15px' }));
panel.add(ui.Label('Macrozona: ' + MACROZONA_EFECTIVA,
  { fontSize: '12px', color: '#555' }));
panel.add(ui.Label('1.Preliminar  2.Exportado  3.Nuevo',
  { fontSize: '11px', color: '#777', margin: '0 0 4px 0' }));
panel.add(ui.Label('Validar: capas 1+2+DIAG. Calibrar: + capa 3, FP nuevo y DIFF.',
  { fontSize: '10px', color: '#888', margin: '0 0 6px 0' }));

maskConfigStatus = ui.Label('Modo / umbrales: (carga una comparacion)',
  { fontSize: '11px', color: '#555', margin: '0 0 4px 0' });
panel.add(maskConfigStatus);

revisionModeSelect = ui.Select({
  items: [
    { label: 'Validar (umbrales del export)', value: 'validate' },
    { label: 'Calibrar (umbrales seccion 1)', value: 'calibrate' }
  ],
  value: REVISION_MODE,
  style: { stretch: 'horizontal' }
});
panel.add(ui.Label('Modo revision:', { fontSize: '12px', margin: '4px 0 0 0' }));
panel.add(revisionModeSelect);

var yearSelect = ui.Select({
  items: years.map(String),
  value: String(years[0]),
  style: { stretch: 'horizontal' }
});
var monthSelect = ui.Select({
  items: MAP_PREVIEW_MONTHS.map(function(m) {
    return { label: 'Mes ' + m + ' (' + monthStates[m] + ')', value: String(m) };
  }),
  value: String(MAP_PREVIEW_MONTHS[0]),
  style: { stretch: 'horizontal' }
});

panel.add(ui.Label('Año:', { fontSize: '12px', margin: '4px 0 0 0' }));
panel.add(yearSelect);
panel.add(ui.Label('Mes:', { fontSize: '12px', margin: '4px 0 0 0' }));
panel.add(monthSelect);

var btnLoad = ui.Button({
  label: 'Cargar comparacion en el mapa',
  style: { stretch: 'horizontal', margin: '8px 0 0 0' },
  onClick: function() {
    var yr = parseInt(yearSelect.getValue(), 10);
    var mo = parseInt(monthSelect.getValue(), 10);
    btnLoad.setLabel('Cargando ' + yr + '-' + mo + ' ...');
    addComparisonLayers(yr, mo);
    btnLoad.setLabel('Cargar comparacion en el mapa');
  }
});
panel.add(btnLoad);

var chartPanel = ui.Panel();
var btnChart = ui.Button({
  label: 'Curva superficie (consola)',
  style: { stretch: 'horizontal', margin: '6px 0 0 0' },
  onClick: function() {
    var yr = parseInt(yearSelect.getValue(), 10);
    btnChart.setDisabled(true);
    btnChart.setLabel('Calculando curva ' + yr + '...');
    chartPanel.clear();
    chartPanel.add(ui.Label('Agregando curva en consola (~15 s)...',
      { fontSize: '11px', color: '#888' }));
    // Assets ya exportados — NO pasa por computeNewMask (evita agregaciones
    // concurrentes con el recomputo en vivo del mapa).
    print('Curva agua (1-3): Preliminar vs Exportado — ' + grid_name + ' ' + yr);
    print(buildWaterAreaLineChart(
      yr, getPrelimYearImage(yr), getExportedMask(yr)));
    chartPanel.clear();
    chartPanel.add(ui.Label('Curva impresa en consola (pestaña Console).',
      { fontSize: '11px', color: '#0a7' }));
    btnChart.setLabel('Curva superficie (consola)');
    btnChart.setDisabled(false);
  }
});
panel.add(btnChart);
panel.add(chartPanel);

var btnSeasonality = ui.Button({
  label: 'Grafico estacionalidad (D/N/W)',
  style: { stretch: 'horizontal', margin: '6px 0 0 0' },
  onClick: function() {
    printSeasonalityChart();
  }
});
panel.add(btnSeasonality);

var btnAnnualInfo = ui.Button({
  label: 'Grafico anual (μ±0.5σ)',
  style: { stretch: 'horizontal', margin: '6px 0 0 0' },
  onClick: function() {
    printAnnualTypeChart();
  }
});
panel.add(btnAnnualInfo);

soilSnowStatus = ui.Label('soil/snow/brightness: (carga una comparacion)',
  { fontSize: '11px', color: '#0a7', margin: '6px 0 0 0' });
panel.add(soilSnowStatus);

panel.add(ui.Label(
  'Mapa: carga comparacion + DIAG. Curva de lineas: boton aparte (consola). ' +
  'No se mezcla con computeNewMask para evitar error de agregaciones.',
  { fontSize: '10px', color: '#999', margin: '8px 0 0 0' }));

Map.add(panel);

// Carga inicial automatica del primer año / primer mes
addComparisonLayers(years[0], MAP_PREVIEW_MONTHS[0]);

print('Listo. Revision para', grid_name, '| años:', years.join(', '));
print('NOTA: ok_img usa mean_slope poligono <', SLOPE_MAX, 'grados.',
      '| FABDEM pixel:', USE_FABDEM_SLOPE_FILTER
        ? ('activo (>=' + SLOPE_FABDEM_MAX + ' grados -> hardFail)')
        : 'desactivado',
      '| sombra = shademask2_FABDEM.');
