/**
 * Step 03 — Gap-fill + post-mask filters.
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Input:  step-02 monthly masks (water-mask-{grid}-{year}-{v}).
 * Output: gap-filled months + frequency / polygon filters
 *         (water-gap-{grid}-{year}-{v}).
 *
 * Gap-fill: class 5 and unmasked pixels filled from neighboring months in a
 * 5-year window (class 5 never used as a fill source).
 *
 * Then (optional):
 *   - Frequency filter: water 1–3 with <= N months over FREQ_Y_* -> class 4
 *   - no_agua polygon: water 1–3 inside -> class 4
 *   - excluir_filtros polygon: rescues pixels from the two filters above
 *
 * Optional GEE Imports: no_agua, excluir_filtros.
 * RUN_MODE: preview (map layers) | export (Tasks).
 */

// -----------------------------------------------------------------------------
// Configuration — edit per run
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  step: '03_gap_fill',

  country: 'Chile',
  inputImagePrefix: 'water-mask',
  grids: ['SE-19-Y'],
  importVersion: 2,
  outputVersion: 2,

  yearStart: 1998,
  yearEnd: 2025,
  previewMonthBand: 'w_11',

  /** 'preview': one year on map. 'export': queue Tasks for all years. */
  runMode: 'preview',
  previewYear: 2001,

  useNoAguaGeometries: true,
  useExcludeGeometries: true,
  noAguaClass: 4,

  useFreqFilter: true,
  freqYearStart: 1998,
  freqYearEnd: 2025,
  freqMaxMonths: 40,
  waterClassMin: 1,
  waterClassMax: 3,

  /** Class 5 = unfilled / no neighbor available; never used as fill source. */
  gapUnfilledClass: 5,

  /** Export manual polygons to MASK-VECTORS (one task per grid/type). */
  exportMaskVectors: false,

  postprocessingRoot:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/POSTPROCESSING/',
  gridsAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile'
};

// Aliases — algorithm below uses these names unchanged
var paisName              = CONFIG.country;
var imput_imgColl         = CONFIG.inputImagePrefix;
var cartas                = CONFIG.grids;
var version_importar      = CONFIG.importVersion;
var version_salida        = CONFIG.outputVersion;
var y_start               = CONFIG.yearStart;
var y_end                 = CONFIG.yearEnd;
var viz_month             = CONFIG.previewMonthBand;
var USE_NO_AGUA_GEOMETRIES = CONFIG.useNoAguaGeometries;
var USE_EXCLUDE_GEOMETRIES = CONFIG.useExcludeGeometries;
var NO_AGUA_CLASS         = CONFIG.noAguaClass;
var USE_FREQ_FILTER       = CONFIG.useFreqFilter;
var FREQ_Y_START          = CONFIG.freqYearStart;
var FREQ_Y_END            = CONFIG.freqYearEnd;
var FREQ_MAX_MONTHS       = CONFIG.freqMaxMonths;
var WATER_CLASS_MIN       = CONFIG.waterClassMin;
var WATER_CLASS_MAX       = CONFIG.waterClassMax;
var GAP_UNFILLED_CLASS    = CONFIG.gapUnfilledClass;
var RUN_MODE              = CONFIG.runMode;
var PREVIEW_YEAR          = CONFIG.previewYear;
var EXPORT_MASK_VECTORS   = CONFIG.exportMaskVectors;
var POSTPROCESSING_ROOT   = CONFIG.postprocessingRoot;
var MASK_VECTORS_ROOT     = POSTPROCESSING_ROOT + 'MASK-VECTORS/';
var GRIDS_ASSET           = CONFIG.gridsAsset;

var TRANSITION_CLASS_02 = { 'SH-19-Y': true, 'SI-19-V': true, 'SI-19-Y': true };
var TRANSITION_CLASS_01 = { 'SI-18-Z': true };
var TEMPLATED_SPECIAL_CLASS_02 = { 'SN-19-V': true, 'SN-19-X': true };

var imageVisParam = {
  opacity: 1,
  min: 1,
  max: 9,
  palette: [
    '0000ff', '009900', '5af100', 'ffffff', '000000',
    'ff0000', 'ff60c7', 'c6c6c6', 'ffff00'
  ]
};

// Soft-disable geometry filters if Imports are missing (paste-friendly).
if (USE_NO_AGUA_GEOMETRIES && typeof no_agua === 'undefined') {
  print('AVISO: USE_NO_AGUA_GEOMETRIES=true pero falta Import "no_agua" — desactivado.');
  USE_NO_AGUA_GEOMETRIES = false;
}
if (USE_EXCLUDE_GEOMETRIES && typeof excluir_filtros === 'undefined') {
  print('AVISO: USE_EXCLUDE_GEOMETRIES=true pero falta Import "excluir_filtros" — desactivado.');
  USE_EXCLUDE_GEOMETRIES = false;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function isArid(gridName) {
  var g = String(gridName || '');
  return g.indexOf('SH-') === 0 || g.indexOf('SE-') === 0 ||
         g.indexOf('SF-') === 0 || g.indexOf('SG-') === 0;
}

function getClassCollectionId(gridNameRaw) {
  var gridName = String(gridNameRaw || '').trim().toUpperCase();
  if (isArid(gridName)) return '02';
  if (TRANSITION_CLASS_01[gridName]) return '01';
  if (TRANSITION_CLASS_02[gridName]) return '02';
  if (TEMPLATED_SPECIAL_CLASS_02[gridName]) return '02';
  return '01';
}

function getMaskInRoot(gridNameRaw) {
  return POSTPROCESSING_ROOT + '02-MASK-' + getClassCollectionId(gridNameRaw) + '/';
}

function getGapOutRoot(gridNameRaw) {
  return POSTPROCESSING_ROOT + '03-GAP-' + getClassCollectionId(gridNameRaw) + '/';
}

function resolveCollectionFromCartas(cartaList) {
  if (!cartaList || cartaList.length === 0) {
    throw new Error('Lista cartas vacia.');
  }
  var colId = getClassCollectionId(cartaList[0]);
  for (var i = 1; i < cartaList.length; i++) {
    if (getClassCollectionId(cartaList[i]) !== colId) {
      throw new Error('Cartas mezclan classification-01 y -02: ' + cartaList.join(', '));
    }
  }
  return colId;
}

var COLLECTION_ID = resolveCollectionFromCartas(cartas);
var MASK_IN_ROOT = POSTPROCESSING_ROOT + '02-MASK-' + COLLECTION_ID + '/';
var GAP_OUT_ROOT = POSTPROCESSING_ROOT + '03-GAP-' + COLLECTION_ID + '/';

var grids = ee.FeatureCollection(GRIDS_ASSET);
Map.centerObject(
  grids.filter(ee.Filter.inList('grid_name', cartas)),
  8
);

function bandName(m) {
  return ee.String('w_').cat(ee.Number(m).format('%d'));
}

function monthBandNames(prefix, n) {
  n = n || 12;
  return ee.List.sequence(1, n).map(function(i) {
    return ee.String(prefix).cat(ee.Number(i).format('%d'));
  });
}

function loadCartaYear(carta, year) {
  var assetId = getMaskInRoot(carta) + imput_imgColl + '-' + carta + '-' + year + '-' +
    version_importar;
  return ee.Image(assetId);
}

function gapAssetBase(carta, year) {
  return 'water-gap-' + carta + '-' + year + '-' + version_salida;
}

function getCartaGeometry(carta) {
  return ee.Feature(
    grids.filter(ee.Filter.eq('grid_name', carta)).first()
  ).geometry();
}

function computeWindowYears(year, yStart, yEnd) {
  var anchor = year > yEnd - 2
    ? (yEnd - year - 4 + year)
    : (Math.max(yStart - year, -2) + year);
  return [0, 1, 2, 3, 4].map(function(d) { return anchor + d; });
}

function processBlockStart(year, yStart, yEnd) {
  var wy = computeWindowYears(year, yStart, yEnd);
  var idx = wy.indexOf(year);
  if (idx < 0) idx = 2;
  return idx * 12 + 1;
}

function buildFiveYearStack(carta, windowYears) {
  var img = loadCartaYear(carta, windowYears[0]);
  for (var i = 1; i < windowYears.length; i++) {
    img = img.addBands(loadCartaYear(carta, windowYears[i]));
  }
  return img.rename(monthBandNames('w_', windowYears.length * 12));
}

// Gap-fill targets: class 5 + unmasked pixels. Class 5 never used as source.
function gapFillTargetMask(band) {
  return band.eq(GAP_UNFILLED_CLASS).or(band.mask().not());
}

function fillSourceBand(img, monthIndex) {
  var band = img.select(bandName(monthIndex));
  return band.updateMask(band.neq(GAP_UNFILLED_CLASS));
}

function gapFillMonth(img, monthIndex, nBands) {
  var actualRaw = img.select(bandName(monthIndex));
  var needsFill = gapFillTargetMask(actualRaw);
  var listMonths = ee.List.sequence(1, nBands);
  var listPrev = listMonths.slice(0, ee.Number(monthIndex).subtract(1)).reverse();
  var listNext = listMonths.slice(monthIndex, nBands);
  var zLoop = listNext.zip(listPrev);
  var listMonthGap = ee.List(ee.Algorithms.If(
    ee.Number(listNext.size()).gt(listPrev.size()),
    zLoop.flatten().cat(listNext).distinct(),
    zLoop.flatten().cat(listPrev).distinct()
  ));
  var neighbors = ee.List.sequence(0, listMonthGap.size().subtract(1)).map(function(i) {
    return fillSourceBand(img, listMonthGap.get(i))
      .rename('w').set('w', ee.Number(i).add(1));
  });
  var col = ee.ImageCollection.fromImages([
    fillSourceBand(img, monthIndex).rename('w').set('w', 0)
  ]).merge(ee.ImageCollection(neighbors));
  var filled = col.sort('w', false).mosaic();
  return actualRaw.where(needsFill, filled.unmask(actualRaw.unmask(GAP_UNFILLED_CLASS)));
}

function gapFillYear(carta, year, yStart, yEnd) {
  var windowYears = computeWindowYears(year, yStart, yEnd);
  var stack = buildFiveYearStack(carta, windowYears);
  var nBands = windowYears.length * 12;
  var start = processBlockStart(year, yStart, yEnd);
  var filled = ee.List.sequence(start, start + 11).map(function(m) {
    return gapFillMonth(stack, m, nBands);
  });
  return ee.ImageCollection(filled).toBands()
    .rename(monthBandNames('w_', 12))
    .set('year', year).set('carta', carta).set('window_years', windowYears);
}

function geometryFromImport(geom) {
  if (geom instanceof ee.FeatureCollection) return geom.geometry();
  if (geom instanceof ee.Feature) return geom.geometry();
  return geom;
}

function featureCollectionFromImport(geom) {
  if (geom instanceof ee.FeatureCollection) return geom;
  if (geom instanceof ee.Feature) return ee.FeatureCollection([geom]);
  return ee.FeatureCollection([ee.Feature(geom)]);
}

function maskVectorAssetBase(carta, vectorType) {
  return String(carta) + '-' + vectorType + '-' + version_salida;
}

function prepareMaskVectorFc(geomImport, carta, vectorType) {
  var cartaGeom = getCartaGeometry(carta);
  return featureCollectionFromImport(geomImport)
    .filterBounds(cartaGeom)
    .map(function(f) {
      return f.intersection(cartaGeom, 1).set({
        grid_name: carta,
        vector_type: vectorType,
        version: version_salida,
        country: paisName,
        script: 'step03_gap_fill'
      });
    });
}

function exportMaskVector(carta, vectorType, geomImport) {
  var name = maskVectorAssetBase(carta, vectorType);
  Export.table.toAsset({
    collection: prepareMaskVectorFc(geomImport, carta, vectorType),
    description: name,
    assetId: MASK_VECTORS_ROOT + name
  });
}

function buildPolygonMask(region, geom, rename) {
  return ee.Image(0).byte()
    .paint(geometryFromImport(geom), 1)
    .clip(region)
    .unmask(0)
    .rename(rename);
}

function buildNoAguaMask(region) {
  if (!USE_NO_AGUA_GEOMETRIES) return null;
  return buildPolygonMask(region, no_agua, 'no_agua_mask');
}

function buildExcludeMask(region) {
  if (!USE_EXCLUDE_GEOMETRIES) return null;
  return buildPolygonMask(region, excluir_filtros, 'exclude_mask');
}

function filterActiveZone(excludeMask) {
  return excludeMask ? excludeMask.eq(0) : ee.Image(1).byte();
}

function isWaterBand(band) {
  return band.gte(WATER_CLASS_MIN).and(band.lte(WATER_CLASS_MAX));
}

function yearWaterMonthCount(year, carta) {
  var img = loadCartaYear(carta, year);
  var monthWater = ee.List.sequence(1, 12).map(function(m) {
    m = ee.Number(m);
    return isWaterBand(img.select(bandName(m))).rename('water');
  });
  return ee.ImageCollection.fromImages(monthWater).sum();
}

function buildWaterFrequency(carta, yFreqStart, yFreqEnd) {
  var freqYears = [];
  for (var y = yFreqStart; y <= yFreqEnd; y++) freqYears.push(y);
  return ee.ImageCollection(freqYears.map(function(year) {
    return yearWaterMonthCount(year, carta).rename('water');
  })).sum().rename('freq_meses');
}

function applyFrequencyFilter(img, freqImg, activeZone) {
  if (!USE_FREQ_FILTER) return img;
  var applyMask = freqImg.lte(FREQ_MAX_MONTHS).and(activeZone);
  var bands = img.bandNames();
  var outBands = bands.map(function(b) {
    var band = img.select([b]);
    return band.where(isWaterBand(band).and(applyMask), NO_AGUA_CLASS);
  });
  return ee.ImageCollection(outBands).toBands().rename(bands);
}

function applyNoAguaGeometries(img, noAguaMask, activeZone) {
  if (!noAguaMask) return img;
  var inside = noAguaMask.eq(1).and(activeZone);
  var bands = img.bandNames();
  var outBands = bands.map(function(b) {
    var band = img.select([b]);
    return band.where(isWaterBand(band).and(inside), NO_AGUA_CLASS);
  });
  return ee.ImageCollection(outBands).toBands().rename(bands);
}

function applyPostGapFilters(img, freqImg, noAguaMask, excludeMask) {
  var activeZone = filterActiveZone(excludeMask);
  img = applyFrequencyFilter(img, freqImg, activeZone);
  img = applyNoAguaGeometries(img, noAguaMask, activeZone);
  return { image: img, activeZone: activeZone };
}

function exportGapYear(output, carta, year, region) {
  var name = gapAssetBase(carta, year);
  Export.image.toAsset({
    image: output.byte(),
    description: name,
    assetId: getGapOutRoot(carta) + name,
    region: region,
    scale: 30,
    pyramidingPolicy: { '.default': 'mode' },
    maxPixels: 1e13
  });
}

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------
var years = ee.List.sequence(y_start, y_end).getInfo();
if (RUN_MODE === 'preview') years = [PREVIEW_YEAR];

print('Step 03 — Gap-fill + filtros | classification-' + COLLECTION_ID);
print('  MASK entrada:', MASK_IN_ROOT);
print('  GAP  salida :', GAP_OUT_ROOT);
print('  Modo:', RUN_MODE, '| grids:', cartas.join(', '));
if (USE_FREQ_FILTER) {
  print('Filtro frecuencia:', FREQ_Y_START, '-', FREQ_Y_END,
        '| agua 1-3 con <=', FREQ_MAX_MONTHS, 'meses ->', NO_AGUA_CLASS);
}
if (USE_NO_AGUA_GEOMETRIES) print('Poligono no_agua: ACTIVO');
if (USE_EXCLUDE_GEOMETRIES) print('Poligono excluir_filtros: ACTIVO');
if (EXPORT_MASK_VECTORS && RUN_MODE === 'export') {
  print('Vectores manuales ->', MASK_VECTORS_ROOT, '| version:', version_salida);
}

var taskCount = 0;
var vectorTaskCount = 0;

cartas.forEach(function(carta) {
  var region = getCartaGeometry(carta).bounds();

  if (EXPORT_MASK_VECTORS && RUN_MODE === 'export') {
    if (USE_NO_AGUA_GEOMETRIES) {
      exportMaskVector(carta, 'no_agua', no_agua);
      vectorTaskCount++;
      print('  vector task:', maskVectorAssetBase(carta, 'no_agua'));
    }
    if (USE_EXCLUDE_GEOMETRIES) {
      exportMaskVector(carta, 'excluir_filtros', excluir_filtros);
      vectorTaskCount++;
      print('  vector task:', maskVectorAssetBase(carta, 'excluir_filtros'));
    }
  }

  var cartaNoAguaMask = buildNoAguaMask(region);
  var cartaExcludeMask = buildExcludeMask(region);
  var cartaFreqImg = USE_FREQ_FILTER
    ? buildWaterFrequency(carta, FREQ_Y_START, FREQ_Y_END)
    : null;
  var cartaActiveZone = filterActiveZone(cartaExcludeMask);

  years.forEach(function(year) {
    print('Carta', carta, '| año', year, '| salida:', gapAssetBase(carta, year));

    var output = gapFillYear(carta, year, y_start, y_end);
    output = applyPostGapFilters(output, cartaFreqImg, cartaNoAguaMask, cartaExcludeMask).image;

    if (RUN_MODE === 'preview') {
      Map.addLayer(output, {
        min: imageVisParam.min, max: imageVisParam.max,
        bands: viz_month, palette: imageVisParam.palette
      }, 'gap+filtros ' + carta + ' ' + viz_month + ' ' + year, true);

      if (USE_FREQ_FILTER && cartaFreqImg) {
        Map.addLayer(cartaFreqImg.clip(region),
          { min: 0, max: FREQ_MAX_MONTHS + 10, palette: ['000000', 'fee08b', 'd73027'] },
          'freq ' + FREQ_Y_START + '-' + FREQ_Y_END + ' ' + carta, false);
        Map.addLayer(
          cartaFreqImg.lte(FREQ_MAX_MONTHS).and(cartaActiveZone).selfMask().clip(region),
          { palette: ['#f97316'] },
          'baja freq (<=' + FREQ_MAX_MONTHS + ') ' + carta, false);
      }
      if (cartaNoAguaMask) {
        Map.addLayer(cartaNoAguaMask.selfMask(), { palette: ['#ef4444'] },
          'no_agua ' + carta, false);
      }
      if (cartaExcludeMask) {
        Map.addLayer(cartaExcludeMask.selfMask(), { palette: ['#22c55e'] },
          'excluir_filtros ' + carta, false);
      }
    }

    if (RUN_MODE === 'export') {
      exportGapYear(output, carta, year, region);
      taskCount++;
    }
  });
});

if (RUN_MODE === 'export') {
  print('Tasks encoladas (raster GAP):', taskCount);
  if (EXPORT_MASK_VECTORS) {
    print('Tasks encoladas (vectores MASK-VECTORS):', vectorTaskCount);
  }
}

print('Listo. Modo:', RUN_MODE);
