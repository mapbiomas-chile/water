/**
 * Step 04 — Water rescue fill (frequency or temporal neighbors).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Input:  step-03 gap rasters
 *         03-GAP-XX / water-gap-{grid}-{year}-{IN_VERSION}
 * Output: 04-FQGAP-XX / {prefix}-{grid}-{year}-{OUT_VERSION}
 *         prefix = water-fqgap ('freq') | water-nbgap ('neighbors')
 *
 * METHOD:
 *   'freq'      — Sur/Austral style. Remap fillable classes (default 4) to
 *                 FILL_CLASS where historical water-month count > FREQ_MIN_MONTHS.
 *   'neighbors' — Centro style. Fill a run of fillable classes only if flanked
 *                 by water (1–3) on BOTH sides and run length <= MAX_GAP_RUN;
 *                 inherits the flanking water class. Series is continuous across
 *                 years (Jan/Dec use adjacent year). Real dry-downs are not filled.
 *
 * No mosaic-module requires — starts immediately.
 * Optional GEE Import: geo_f (fill polygon). Soft-disabled if missing.
 */

// -----------------------------------------------------------------------------
// Configuration — edit per run
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  step: '04_freq_neighbor_fill',

  gridName: 'SH-19-V',
  yearStart: 1998,
  yearEnd: 2025,

  importVersion: 1,   // step-03 GAP input version
  outputVersion: 2,   // 04-FQGAP output version

  /** 'freq' (Sur/Austral) | 'neighbors' (Centro) */
  method: 'neighbors',

  /** freq method: fill class 4 where freq > this (max = nYears * 12). */
  freqMinMonths: 336,

  /** neighbors method: max class-4 run length to fill (1 safer, 2 typical Centro). */
  maxGapRun: 2,

  /** Class written by freq fill. neighbors inherits flanking water class. */
  fillClass: 1,

  /**
   * Classes treated as fillable holes (become water).
   * Default [4]. Does not include real water (1–3) or unfilled (5).
   * In neighbors, only 1–3 count as flanking water.
   */
  fillFromClasses: [4],

  /**
   * Optional polygon to restrict fill. Requires GEE Import named geo_f
   * (or set polygonFc below). Soft-disabled if missing.
   */
  usePolygon: true,
  polygonFc: null,   // set ee.FeatureCollection(...) to force; null → try Import geo_f

  /** 'preview': map helpers. 'export': queue all years to 04-FQGAP. */
  runMode: 'preview',

  /** Preview helpers to auto-run in preview mode (heavy ones stay commented below). */
  autoShowFreq: true,
  autoPreviewYear: 2023,
  autoPreviewMonth: 12,

  postprocessingRoot:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/POSTPROCESSING/',
  gridsAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile',

  chartAreaScale: 30,
  cr2metAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/CR2MET_pp',
  cr2metImgPrefix: 'CR2MET_pr_v2_5_best_day_',
  cr2metScale: 5000,
  forcingAttrAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/grid_attributes_hydro_merged_v2',
  flowAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/monthly_flow_merged',
  forcingTypeProp: 'forcing_type',
  flowValueProp: 'flow_value'
};

// Aliases — algorithm below uses these names unchanged
var GRID_NAME         = CONFIG.gridName;
var Y_START           = CONFIG.yearStart;
var Y_END             = CONFIG.yearEnd;
var IN_VERSION        = CONFIG.importVersion;
var OUT_VERSION       = CONFIG.outputVersion;
var METHOD            = CONFIG.method;
var FREQ_MIN_MONTHS   = CONFIG.freqMinMonths;
var MAX_GAP_RUN       = CONFIG.maxGapRun;
var FILL_CLASS        = CONFIG.fillClass;
var FILL_FROM_CLASSES = CONFIG.fillFromClasses;
var USE_POLYGON       = CONFIG.usePolygon;
var RUN_MODE          = CONFIG.runMode;
var POSTPROCESSING_ROOT = CONFIG.postprocessingRoot;
var GRIDS_ASSET       = CONFIG.gridsAsset;
var CHART_AREA_SCALE  = CONFIG.chartAreaScale;
var CR2MET_ASSET      = CONFIG.cr2metAsset;
var CR2MET_IMG_PREFIX = CONFIG.cr2metImgPrefix;
var CR2MET_SCALE      = CONFIG.cr2metScale;
var FORCING_ATTR_ASSET = CONFIG.forcingAttrAsset;
var FLOW_ASSET        = CONFIG.flowAsset;
var FORCING_TYPE_PROP = CONFIG.forcingTypeProp;
var FLOW_VALUE_PROP   = CONFIG.flowValueProp;

var POL_RELLENO = CONFIG.polygonFc;
if (USE_POLYGON && !POL_RELLENO) {
  if (typeof geo_f !== 'undefined') {
    POL_RELLENO = geo_f;
  } else {
    print('AVISO: USE_POLYGON=true pero falta Import "geo_f" — desactivado.');
    USE_POLYGON = false;
  }
}

var VIS_WATER = {
  min: 1, max: 9,
  palette: ['0000ff', '009900', '5af100', 'ffffff', '000000',
            'ff0000', 'ff60c7', 'c6c6c6', 'ffff00']
};
var VIS_FREQ = {
  min: 1, max: 336,
  palette: ['#ffffcc', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#0c2c84']
};

var TRANSITION_CLASS_02 = { 'SH-19-Y': true, 'SI-19-V': true, 'SI-19-Y': true };
var TRANSITION_CLASS_01 = { 'SI-18-Z': true };
var TEMPLATED_SPECIAL_CLASS_02 = { 'SN-19-V': true, 'SN-19-X': true };

// -----------------------------------------------------------------------------
// Path helpers
// -----------------------------------------------------------------------------
function isArid(g) {
  g = String(g || '');
  return g.indexOf('SH-') === 0 || g.indexOf('SE-') === 0 ||
         g.indexOf('SF-') === 0 || g.indexOf('SG-') === 0;
}

function getClassCollectionId(raw) {
  var g = String(raw || '').trim().toUpperCase();
  if (isArid(g)) return '02';
  if (TRANSITION_CLASS_01[g]) return '01';
  if (TRANSITION_CLASS_02[g]) return '02';
  if (TEMPLATED_SPECIAL_CLASS_02[g]) return '02';
  return '01';
}

/** Step-03 GAP input folder. */
function getGapInRoot(raw) {
  return POSTPROCESSING_ROOT + '03-GAP-' + getClassCollectionId(raw) + '/';
}

/** Step-04 FQGAP output folder. */
function getFqGapRoot(raw) {
  return POSTPROCESSING_ROOT + '04-FQGAP-' + getClassCollectionId(raw) + '/';
}

function outPrefix() {
  return METHOD === 'neighbors' ? 'water-nbgap' : 'water-fqgap';
}

function bandFromMonth(m) { return 'w_' + m; }

var ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
var years = [];
for (var y = Y_START; y <= Y_END; y++) years.push(y);
var MAX_MESES = years.length * 12;

// -----------------------------------------------------------------------------
// Base layers
// -----------------------------------------------------------------------------
var grids        = ee.FeatureCollection(GRIDS_ASSET);
var pixelArea    = ee.Image.pixelArea().divide(10000);   // ha
var forcingAttrs = ee.FeatureCollection(FORCING_ATTR_ASSET);
var flowTable    = ee.FeatureCollection(FLOW_ASSET);
var CR2MET_MONTH_BANDS = ee.List.sequence(1, 12).map(function(m) {
  return ee.String('m_').cat(ee.Number(m).format('%d'));
});

function precipAssetId(year) {
  return CR2MET_ASSET + '/' + CR2MET_IMG_PREFIX + year;
}

function getGridFc(g)       { return grids.filter(ee.Filter.eq('grid_name', g)); }
function getGridGeometry(g) { return getGridFc(g).geometry(); }

function getMaskCarta(g) {
  return ee.Image().byte().paint(getGridFc(g), 1).selfMask();
}

function loadGapYear(year, g) {
  return ee.Image(
    getGapInRoot(g) + 'water-gap-' + g + '-' + year + '-' + IN_VERSION
  );
}

function isWaterBand(b) { return b.gte(1).and(b.lte(3)); }

function isFillable(b) {
  var m = b.eq(FILL_FROM_CLASSES[0]);
  for (var k = 1; k < FILL_FROM_CLASSES.length; k++) {
    m = m.or(b.eq(FILL_FROM_CLASSES[k]));
  }
  return m;
}

var maskCarta = getMaskCarta(GRID_NAME);
Map.centerObject(getGridGeometry(GRID_NAME), 9);

// -----------------------------------------------------------------------------
// Frequency image (water-month count) — used by 'freq'; reference for both
// -----------------------------------------------------------------------------
function buildFreqImage(g, maskCartaArg) {
  var yearly = years.map(function(year) {
    var img = loadGapYear(year, g).updateMask(maskCartaArg);
    var monthWater = ALL_MONTHS.map(function(m) {
      return isWaterBand(img.select(bandFromMonth(m))).rename('water');
    });
    return ee.ImageCollection.fromImages(monthWater).sum().rename('n_meses');
  });
  return ee.ImageCollection.fromImages(yearly).sum().rename('freq').updateMask(maskCartaArg);
}

var freqImg = buildFreqImage(GRID_NAME, maskCarta);

// -----------------------------------------------------------------------------
// METHOD 'neighbors' — continuous series, water|gap|water (run <= MAX_GAP_RUN)
// -----------------------------------------------------------------------------
function loadMonthlyClassArray(g) {
  var arr = [];
  years.forEach(function(year) {
    var img = loadGapYear(year, g).updateMask(maskCarta);
    ALL_MONTHS.forEach(function(m) {
      arr.push({ year: year, month: m, c: img.select(bandFromMonth(m)).rename('c') });
    });
  });
  return arr;
}

function buildNeighborFilledByYear(g) {
  var arr  = loadMonthlyClassArray(g);
  var n    = arr.length;
  var polOK = USE_POLYGON ? ee.Image(0).paint(POL_RELLENO, 1).gt(0) : ee.Image(1);

  function water(i) {
    if (i < 0 || i >= n) return ee.Image(0);
    var c = arr[i].c;
    return c.gte(1).and(c.lte(3)).unmask(0);
  }
  function isGap(i) {
    if (i < 0 || i >= n) return ee.Image(0);
    return isFillable(arr[i].c).unmask(0);
  }
  function clsW(i) {
    if (i < 0 || i >= n) return ee.Image(0);
    var c = arr[i].c.unmask(0);
    return c.multiply(water(i));
  }

  var filled = [];
  for (var i = 0; i < n; i++) {
    var cur = arr[i].c;

    // Pattern 1: isolated hole  water | gap | water
    var single = isGap(i).and(water(i - 1)).and(water(i + 1));
    var doFill = single;

    if (MAX_GAP_RUN >= 2) {
      // Pattern 2 (run of 2): water | gap gap | water
      var leftOfPair  = isGap(i).and(water(i - 1)).and(isGap(i + 1)).and(water(i + 2));
      var rightOfPair = isGap(i).and(water(i + 1)).and(isGap(i - 1)).and(water(i - 2));
      doFill = single.or(leftOfPair).or(rightOfPair);
    }
    // Runs of 3+ never match → not filled (preserves real dry-downs).

    var fillVal = clsW(i - 1).max(clsW(i + 1));
    var gate = doFill.and(polOK).and(fillVal.gt(0)).updateMask(cur.mask());
    var newC = cur.where(gate, fillVal).rename('c');
    filled.push({ year: arr[i].year, month: arr[i].month, c: newC });
  }

  var byYear = {};
  filled.forEach(function(e) {
    var band = e.c.rename(bandFromMonth(e.month));
    byYear[e.year] = byYear[e.year] ? byYear[e.year].addBands(band) : band;
  });
  Object.keys(byYear).forEach(function(yk) { byYear[yk] = byYear[yk].toByte(); });
  return byYear;
}

var neighborFilledByYear = (METHOD === 'neighbors')
  ? buildNeighborFilledByYear(GRID_NAME) : null;

// -----------------------------------------------------------------------------
// Dispatch rescue for one year
// -----------------------------------------------------------------------------
function freqGate() {
  var polOK = USE_POLYGON ? ee.Image(0).paint(POL_RELLENO, 1).gt(0) : ee.Image(1);
  return freqImg.gt(FREQ_MIN_MONTHS).and(polOK);
}

function rescueYear(g, year) {
  if (METHOD === 'neighbors') {
    return neighborFilledByYear[year];
  }
  var img  = loadGapYear(year, g);
  var gate = freqGate();
  var out = img;
  ALL_MONTHS.forEach(function(m) {
    var banda = bandFromMonth(m);
    var cur   = img.select(banda);
    var doFill = isFillable(cur).and(gate);
    out = out.addBands(cur.where(doFill, FILL_CLASS).rename(banda), [banda], true);
  });
  return out.toByte();
}

// -----------------------------------------------------------------------------
// Visualization helpers (call from console / uncomment below)
// -----------------------------------------------------------------------------
function showFreq(g) {
  Map.centerObject(getGridGeometry(g), 9);
  Map.addLayer(getGridFc(g).style({ fillColor: '00000000', color: 'FFFF00' }),
    {}, 'Carta ' + g, true);
  Map.addLayer(freqImg.selfMask(), VIS_FREQ, 'Frecuencia (nº meses agua) ' + g, true);
  if (METHOD === 'freq') {
    Map.addLayer(freqImg.gt(FREQ_MIN_MONTHS).selfMask(),
      { palette: ['ff00ff'] }, 'Píxeles freq > ' + FREQ_MIN_MONTHS + ' (candidatos)', false);
    print('Frecuencia', g, '| umbral fill: freq >', FREQ_MIN_MONTHS, '| máx', MAX_MESES);
  } else {
    print('Frecuencia', g, '(referencia; METHOD=neighbors) | máx', MAX_MESES);
  }
}

function showFreqFillPixels(g, year, month) {
  if (METHOD !== 'freq') {
    print('showFreqFillPixels applies only when METHOD = "freq".'); return;
  }
  var gate = freqGate();
  Map.centerObject(getGridGeometry(g), 10);
  Map.addLayer(getGridFc(g).style({ fillColor: '00000000', color: 'FFFF00' }),
    {}, 'Carta ' + g, true);
  Map.addLayer(freqImg.selfMask(), VIS_FREQ, 'Frecuencia (nº meses agua)', false);
  Map.addLayer(gate.selfMask(), { palette: ['00ffff'] },
    'CANDIDATOS relleno (freq > ' + FREQ_MIN_MONTHS + ')', true);

  if (year !== undefined && month !== undefined) {
    var banda = bandFromMonth(month);
    var cur   = loadGapYear(year, g).select(banda).updateMask(maskCarta);
    var doFill = isFillable(cur).and(gate);
    Map.addLayer(doFill.selfMask(), { palette: ['ff00ff'] },
      'RELLENADOS ' + year + '-' + month + ' (clase ' +
      FILL_FROM_CLASSES.join('/') + ')', true);
    print('Relleno freq |', g, year + '-' + month,
          '| magenta: clase', FILL_FROM_CLASSES.join('/'), '→', FILL_CLASS);
  }
}

function showMonthlyClassStack(g, source) {
  source = source || 'before';
  var stack = null;
  years.forEach(function(year) {
    var img = (source === 'after' ? rescueYear(g, year) : loadGapYear(year, g))
      .updateMask(maskCarta);
    ALL_MONTHS.forEach(function(m) {
      var mm = (m < 10 ? '0' : '') + m;
      var band = img.select([bandFromMonth(m)]).rename('m' + year + '_' + mm);
      stack = stack ? stack.addBands(band) : band;
    });
  });
  Map.centerObject(getGridGeometry(g), 10);
  Map.addLayer(stack,
    { bands: ['m' + Y_END + '_06'], min: 1, max: 9, palette: VIS_WATER.palette },
    'Clase mensual stack ' + source + ' (Inspector) ' + g, true);
  print('Stack ' + source + ' listo. Inspector → click píxel (clases 1998–2025).');
  return stack;
}

function previewRescue(g, year, month) {
  var banda  = bandFromMonth(month);
  var before = loadGapYear(year, g).select(banda).updateMask(maskCarta);
  var after  = rescueYear(g, year).select(banda).updateMask(maskCarta);
  Map.centerObject(getGridGeometry(g), 10);
  Map.addLayer(freqImg.selfMask(), VIS_FREQ, 'Frecuencia (nº meses agua)', false);
  Map.addLayer(before, VIS_WATER, 'ANTES ' + year + '-' + month, false);
  Map.addLayer(after,  VIS_WATER, 'DESPUÉS ' + year + '-' + month, true);
  if (USE_POLYGON) {
    Map.addLayer(POL_RELLENO.style({ fillColor: '00000000', color: 'ff00ff' }),
      {}, 'pol_relleno');
  }
  print('Preview', g, year + '-' + month, '| método', METHOD);
}

function enableClickInspector(g) {
  Map.style().set('cursor', 'crosshair');
  Map.onClick(function(coords) {
    var pt = ee.Geometry.Point([coords.lon, coords.lat]);
    var imgsBefore = [], imgsAfter = [];
    years.forEach(function(year) {
      var b = loadGapYear(year, g).updateMask(maskCarta);
      var a = rescueYear(g, year);
      ALL_MONTHS.forEach(function(m) {
        var t = ee.Date.fromYMD(year, m, 1).millis();
        imgsBefore.push(b.select(bandFromMonth(m)).rename('clase')
          .set('system:time_start', t));
        imgsAfter.push(a.select(bandFromMonth(m)).rename('clase')
          .set('system:time_start', t));
      });
    });
    var icB = ee.ImageCollection(imgsBefore);
    var icA = ee.ImageCollection(imgsAfter);
    var cB = ui.Chart.image.series({
        imageCollection: icB.select('clase'),
        region: pt, reducer: ee.Reducer.first(), scale: 30
      })
      .setSeriesNames(['ANTES'])
      .setOptions({
        title: 'Clase mes a mes — ANTES — ' + g,
        pointSize: 3, vAxis: { viewWindow: { min: 0, max: 9 } }
      });
    var cA = ui.Chart.image.series({
        imageCollection: icA.select('clase'),
        region: pt, reducer: ee.Reducer.first(), scale: 30
      })
      .setSeriesNames(['DESPUÉS'])
      .setOptions({
        title: 'Clase mes a mes — DESPUÉS — ' + g,
        pointSize: 3, colors: ['#1f6feb'],
        vAxis: { viewWindow: { min: 0, max: 9 } }
      });
    print('--- Punto', coords.lon.toFixed(4), coords.lat.toFixed(4),
          '| método', METHOD, '---');
    print(cB); print(cA);
  });
  print('Inspector: click un píxel para clase mes a mes (antes/después).');
}

// -----------------------------------------------------------------------------
// Export all years → 04-FQGAP-XX
// -----------------------------------------------------------------------------
function exportRescueCarta(g) {
  var region  = getGridGeometry(g);
  var outRoot = getFqGapRoot(g);
  var pref    = outPrefix();
  years.forEach(function(year) {
    Export.image.toAsset({
      image: rescueYear(g, year),
      description: pref + '-' + g + '-' + year + '-' + OUT_VERSION,
      assetId: outRoot + pref + '-' + g + '-' + year + '-' + OUT_VERSION,
      region: region,
      scale: 30,
      pyramidingPolicy: { '.default': 'mode' },
      maxPixels: 1e13
    });
  });
  print('Exports encolados:', pref + '-' + g + '-{año}-' + OUT_VERSION, 'en', outRoot);
}

// -----------------------------------------------------------------------------
// Charts: area before/after vs forcing
// -----------------------------------------------------------------------------
function imageForSeries(year, g, source) {
  return source === 'after' ? rescueYear(g, year) : loadGapYear(year, g);
}
function prop_for(source) { return source === 'after' ? 'area_after' : 'area_before'; }

function buildAreaSeriesFC(g, source) {
  var geom = getGridGeometry(g).bounds();
  var fc = ee.FeatureCollection([]);
  ALL_MONTHS.forEach(function(m) {
    var banda = bandFromMonth(m);
    var stack = null;
    years.forEach(function(year) {
      var img      = imageForSeries(year, g, source).updateMask(maskCarta);
      var maskAgua = isWaterBand(img.select(banda));
      var areaBand = pixelArea.updateMask(maskAgua).rename('y_' + year);
      stack = stack ? stack.addBands(areaBand) : areaBand;
    });
    var dictAreas = stack.reduceRegion({
      reducer: ee.Reducer.sum(), geometry: geom,
      scale: CHART_AREA_SCALE, maxPixels: 1e13, tileScale: 4
    });
    var prop = prop_for(source);
    var fcBanda = ee.FeatureCollection(years.map(function(year) {
      var label = ee.Number(year).format('%d').cat('-').cat(ee.Number(m).format('%02d'));
      var feat = { time_index: ee.Number(year).multiply(100).add(m), time_label: label };
      feat[prop] = dictAreas.get('y_' + year);
      return ee.Feature(null, feat);
    }));
    fc = fc.merge(fcBanda);
  });
  return fc.filter(ee.Filter.notNull([prop_for(source)])).sort('time_index');
}

function buildAreaBeforeAfterFC(g) {
  var before = buildAreaSeriesFC(g, 'before');
  var after  = buildAreaSeriesFC(g, 'after');
  return ee.Join.inner().apply(
    before, after,
    ee.Filter.equals({ leftField: 'time_label', rightField: 'time_label' })
  ).map(function(f) {
    var b = ee.Feature(f.get('primary'));
    return b.set('area_after', ee.Feature(f.get('secondary')).get('area_after'));
  }).sort('time_index');
}

function buildPrecipSeriesFC(region) {
  var fc = ee.FeatureCollection([]);
  years.forEach(function(year) {
    var img = ee.Image(precipAssetId(year)).rename(CR2MET_MONTH_BANDS);
    var dict = img.reduceRegion({
      reducer: ee.Reducer.mean(), geometry: region,
      scale: CR2MET_SCALE, maxPixels: 1e12, tileScale: 4
    });
    var fcYear = ee.FeatureCollection(ee.List.sequence(1, 12).map(function(m) {
      m = ee.Number(m);
      var label = ee.Number(year).format('%d').cat('-').cat(m.format('%02d'));
      return ee.Feature(null, {
        time_label: label,
        forcing: dict.get(ee.String('m_').cat(m.format('%d')))
      });
    }));
    fc = fc.merge(fcYear);
  });
  return fc.filter(ee.Filter.notNull(['forcing']));
}

function buildFlowSeriesFC(g) {
  return flowTable
    .filter(ee.Filter.eq('grid_name', g))
    .filter(ee.Filter.notNull([FLOW_VALUE_PROP, 'year', 'month']))
    .map(function(ft) {
      var year  = ee.Number(ft.get('year'));
      var month = ee.Number(ft.get('month'));
      var label = year.format('%d').cat('-').cat(month.format('%02d'));
      return ee.Feature(null, { time_label: label, forcing: ft.get(FLOW_VALUE_PROP) });
    });
}

function buildBeforeAfterChart(g, forcingFC, forcingName, forcingColor) {
  var areaFC = buildAreaBeforeAfterFC(g);
  var joined = ee.Join.inner().apply(
    areaFC, forcingFC,
    ee.Filter.equals({ leftField: 'time_label', rightField: 'time_label' })
  ).map(function(f) {
    var a = ee.Feature(f.get('primary'));
    return a.set('forcing', ee.Feature(f.get('secondary')).get('forcing'));
  }).sort('time_index');

  return ui.Chart.feature.byFeature({
    features: joined, xProperty: 'time_label',
    yProperties: ['area_before', 'area_after', 'forcing']
  }).setChartType('LineChart').setOptions({
    title: 'Agua 1-3 (ha): sin relleno vs con relleno vs ' + forcingName +
           ' — ' + g + ' [' + METHOD + ']',
    series: {
      0: { targetAxisIndex: 0, color: '#999999', lineWidth: 1, pointSize: 0,
           lineDashStyle: [3, 3] },
      1: { targetAxisIndex: 0, color: '#1f6feb', lineWidth: 1.8, pointSize: 0 },
      2: { targetAxisIndex: 1, color: forcingColor, lineWidth: 1, pointSize: 0,
           lineDashStyle: [4, 2] }
    },
    vAxes: { 0: { title: 'Superficie agua (ha)' }, 1: { title: forcingName } },
    hAxis: {
      title: 'Año-Mes', slantedText: true, slantedTextAngle: 60,
      textStyle: { fontSize: 8 }
    },
    interpolateNulls: true
  });
}

function forcingTypeServer(g) {
  var sub = forcingAttrs.filter(ee.Filter.eq('grid_name', g));
  return ee.String(ee.Algorithms.If(
    sub.size().gt(0), sub.first().get(FORCING_TYPE_PROP), 'precip'));
}

function resolveForcingType(g, callback) {
  forcingTypeServer(g).evaluate(function(t) {
    var ftype = (t === null || t === undefined ? 'precip' : String(t)).toLowerCase();
    callback(ftype === 'flow' || ftype === 'caudal' ? 'flow' : 'precip');
  });
}

function printBeforeAfterForcingChart(g) {
  print('--- Curva sin/con relleno vs forzante |', g, '| método', METHOD, '---');
  resolveForcingType(g, function(ftype) {
    if (ftype === 'flow') {
      print('Forzante', g, '= CAUDAL');
      print(buildBeforeAfterChart(g, buildFlowSeriesFC(g), 'Caudal (m³/s)', '#2b8a3e'));
    } else {
      print('Forzante', g, '= PRECIPITACIÓN (CR2MET)');
      print(buildBeforeAfterChart(g, buildPrecipSeriesFC(getGridGeometry(g)),
                                  'Precipitación (mm/mes)', '#e8590c'));
    }
  });
}

function showFreqHistogram(g) {
  if (METHOD !== 'freq') {
    print('showFreqHistogram applies only when METHOD = "freq".'); return;
  }
  var region = USE_POLYGON ? POL_RELLENO.geometry() : getGridGeometry(g);
  var ambito = USE_POLYGON ? 'polígono' : 'carta completa';
  var freqPos = freqImg.updateMask(freqImg.gte(1));
  var chart = ui.Chart.image.histogram({
      image: freqPos, region: region, scale: 30,
      maxPixels: 1e13, minBucketWidth: 1
    }).setOptions({
      title: 'Histograma frecuencia (>=1) — ' + g + ' [' + ambito + ']',
      hAxis: { title: 'Meses-agua (máx ' + MAX_MESES + ')', gridlines: { count: 12 } },
      vAxis: { title: 'Nº de píxeles', logScale: true },
      legend: { position: 'none' }, colors: ['#1d91c0']
    });
  print('--- Histograma frecuencia |', g, '|', ambito, '---');
  print(chart);
}

// -----------------------------------------------------------------------------
// Run
// -----------------------------------------------------------------------------
print('Step 04 — Rescue fill | 03-GAP → 04-FQGAP');
print('Carta:', GRID_NAME, '| método:', METHOD,
      '| entrada v' + IN_VERSION, '→ salida v' + OUT_VERSION);
print('Entrada:', getGapInRoot(GRID_NAME) + 'water-gap-…');
print('Salida :', getFqGapRoot(GRID_NAME), '| prefijo:', outPrefix());
if (METHOD === 'neighbors') {
  print('Vecinos: rellena racha clase', FILL_FROM_CLASSES.join('/'),
        '(largo ≤', MAX_GAP_RUN, ') flanqueada por agua 1–3; hereda clase.');
} else {
  print('Frecuencia: clase', FILL_FROM_CLASSES.join('/'), '→', FILL_CLASS,
        'donde freq >', FREQ_MIN_MONTHS);
}

if (RUN_MODE === 'preview') {
  if (CONFIG.autoShowFreq) showFreq(GRID_NAME);
  previewRescue(GRID_NAME, CONFIG.autoPreviewYear, CONFIG.autoPreviewMonth);
  print('Opcional (consola): showMonthlyClassStack, enableClickInspector,');
  print('  showFreqFillPixels, showFreqHistogram, printBeforeAfterForcingChart');
}

if (RUN_MODE === 'export') {
  exportRescueCarta(GRID_NAME);
}

print('Listo. Modo:', RUN_MODE);
