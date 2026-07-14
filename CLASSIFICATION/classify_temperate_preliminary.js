/**
 * Step 01 — Preliminary monthly water classification (temperate / humid method).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * SMA fractions + fuzzy membership (wet module) + decision tree → C1–C9.
 * Paste this script into the Earth Engine Code Editor and Run.
 *
 * Modules: Module_mosaic_landsat (PRESET wet_FilterAllSnw) +
 *          Module_water_probability (setLimeares / p_* helpers).
 *
 * Optional Geometry Import in GEE editor:
 *   poli — polygon(s) where bright false positives (pbri) are removed.
 *   If missing, the brightness remapping is skipped (script still runs).
 *
 * Classes:
 *   1 Detected water | 2 Observed included | 3 Unobserved included
 *   4 Non-water | 5 Unobserved | 6 Observed exclusion | 7 Unobserved exclusion
 *   8 Shadow water | 9 Slope water
 *
 * Output bands: w_1 … w_12
 */

// -----------------------------------------------------------------------------
// Modules — upload github/water/MODULES/*.js to this GEE Scripts folder.
// Edit GEE_MODULES if your Code Editor path differs.
// -----------------------------------------------------------------------------
var GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';
var mosaic = require(GEE_MODULES + '/Module_mosaic_landsat');
var modules = require(GEE_MODULES + '/Module_water_probability');

mosaic.setDefaultPreset('wet_FilterAllSnw');
modules.setZeroSnowProb(false); // AllSnw: snow band is 0 / no snow zeroing

modules.get_Collection2 = function(geometry, cloud_cover, years) {
  return mosaic.get_Collection2(geometry, cloud_cover, years);
};

// -----------------------------------------------------------------------------
// Classes / palette
// -----------------------------------------------------------------------------
var CLASS_PALETTE = {
  min: 1,
  max: 9,
  colors: [
    '0000ff',
    '009900',
    '5af100',
    'ffffff',
    '000000',
    'ff0000',
    'ff60c7',
    'c6c6c6',
    'ffff00'
  ],
  labels: [
    'C1 Detected water',
    'C2 Observed included water',
    'C3 Unobserved included water',
    'C4 Non-water',
    'C5 Unobserved',
    'C6 Observed exclusion',
    'C7 Unobserved exclusion',
    'C8 Shadow water',
    'C9 Slope water'
  ]
};

// -----------------------------------------------------------------------------
// Configuration — edit per run
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  method: 'temperate',
  country: 'Chile',
  version: 1,

  years: [2011],
  grids: ['SJ-18-Z'],
  regionId: [0],
  cloudCover: 90,

  thresholds: {
    shadeMin: 75,
    shadeMax: 85,
    gvSoilMin: 0,
    gvSoilMax: 10,
    cloudDescMin: 25,
    cloudDescMax: 35,
    cloudAscMin: 2,
    cloudAscMax: 20
  },

  classification: {
    fillGapMonth: 0.4,
    fillGapYear: 0.45,
    mndwi: -0.2,
    pbri: 1000,
    slppostCutoff: 1,
    monthlyProbHigh: 0.4,
    monthlyProbLow: 0.4,
    slopeGte: 14,
    softExcludeProbLt: 0.3
  },

  mosaicReducer: 'median',
  applyEstimatedSma: {
    apply: false,
    shade: [0.713, 27.99],
    gvSoil: [0.696, 0.286],
    cloud: [0.95, 0.483]
  },

  gridAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile',
  slopePostAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/slppost2_30_FABDEM',
  shadeMaskAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/shademask2_FABDEM',
  demCollection: 'projects/sat-io/open-datasets/FABDEM',
  lulcAsset:
    'projects/mapbiomas-chile/assets/LULC/COLLECTION-02/CLASSIFICATIONS/classification-final/clasificacion-final-2',

  exportAssetRoot:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-01',
  exportDescriptionPrefix: 'pilot',

  comparePrevious: true,
  previousCollection:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/00-BETA/classification-01',
  previousVersion: 1,

  scale: 30,
  previewOnMap: true,
  previewMonths: ['w_1', 'w_4', 'w_6', 'w_7'],
  runExport: false
};

// -----------------------------------------------------------------------------
// Production aliases (core algorithm mirrors the validated temperate script)
// -----------------------------------------------------------------------------
var param = {
  pais_name: CONFIG.country,
  years: CONFIG.years,
  regionId: CONFIG.regionId,
  cloud_cover: CONFIG.cloudCover,
  version: CONFIG.version,
  versionComp: CONFIG.previousVersion,
  Comparacion: CONFIG.comparePrevious,
  ExportAgua: CONFIG.runExport,
  cartas: CONFIG.grids,
  Limeares: {
    shade_min: CONFIG.thresholds.shadeMin,
    shade_max: CONFIG.thresholds.shadeMax,
    gv_soil_min: CONFIG.thresholds.gvSoilMin,
    gv_soil_max: CONFIG.thresholds.gvSoilMax,
    cloud_desc_min: CONFIG.thresholds.cloudDescMin,
    cloud_desc_max: CONFIG.thresholds.cloudDescMax,
    cloud_asc_min: CONFIG.thresholds.cloudAscMin,
    cloud_asc_max: CONFIG.thresholds.cloudAscMax
  },
  Clasif: {
    fill_gap_month: CONFIG.classification.fillGapMonth,
    fill_gap_year: CONFIG.classification.fillGapYear,
    mndwi: CONFIG.classification.mndwi,
    pbri: CONFIG.classification.pbri,
    slppost2_corte: CONFIG.classification.slppostCutoff,
    p_img_month_gt: CONFIG.classification.monthlyProbHigh,
    p_img_month_lte: CONFIG.classification.monthlyProbLow,
    slope_gte: CONFIG.classification.slopeGte
  },
  reductorMosaico: CONFIG.mosaicReducer,
  ApplySMAe: {
    Apply: CONFIG.applyEstimatedSma.apply,
    shade: CONFIG.applyEstimatedSma.shade,
    gv_soil: CONFIG.applyEstimatedSma.gvSoil,
    cloud: CONFIG.applyEstimatedSma.cloud
  }
};

var vis = {
  Map_addLayer: CONFIG.previewOnMap,
  listbandMonth: CONFIG.previewMonths
};

var vis_detec = CLASS_PALETTE.colors;

// Optional brightness-exclusion polygons (draw/import as `poli` in GEE).
var HAS_POLI = typeof poli !== 'undefined';
if (!HAS_POLI) {
  print(
    'No Geometry Import named `poli`. Brightness (pbri) remapping will be skipped.'
  );
}

// -----------------------------------------------------------------------------
// Auxiliary layers
// -----------------------------------------------------------------------------
var slppost2 = ee.Image(CONFIG.slopePostAsset).unmask(0);
var shademask2_v3 = ee.Image(CONFIG.shadeMaskAsset);
var fabdem = ee
  .ImageCollection(CONFIG.demCollection)
  .mosaic()
  .setDefaultProjection('EPSG:3857', null, 30);
var slope = ee.Terrain.slope(fabdem);
var clasif_pais = ee.Image(CONFIG.lulcAsset);

var grids = ee.FeatureCollection(CONFIG.gridAsset);
var region = grids.filter(ee.Filter.inList('grid_name', param.cartas));

print('Collection 01 | Temperate preliminary monthly water classification');
print('Years:', CONFIG.years);
print('Grids:', CONFIG.grids);
print('Thresholds:', param.Limeares);
print('Export:', CONFIG.runExport ? 'enabled' : 'disabled');
print('Filtered grids (should be > 0):', region.size());

Map.centerObject(region, 8);
Map.addLayer(
  region.style({color: 'FF0000', fillColor: '00000000', width: 2}),
  {},
  'GRIDS TO CLASSIFY',
  true
);

var ConlAComp = ee.ImageCollection(CONFIG.previousCollection);

// Module parameters (thresholds + optional estimated SMA + mosaic reducer)
modules.setLimeares(param.Limeares);
modules.setParametroSMA(param.ApplySMAe);
modules.setParametroReducto(param.reductorMosaico);

var get_Collection = modules.get_Collection2;
var p_img_month_func = modules.p_img_month_func;
var p_year_func = modules.p_year_func;
var p_month_func = modules.p_month_func;

var Collection = get_Collection(region, param.cloud_cover, param.years);
print('Landsat+SMA collection size:', Collection.size());

// -----------------------------------------------------------------------------
// Monthly water classification (decision tree → C1–C9)
// -----------------------------------------------------------------------------
var water_y_m_func = function (year, moving_window, collection) {
  var p_img_month = p_img_month_func(year, moving_window, collection)[0];
  var p_year = p_year_func(year, collection);
  var p_month = p_month_func(year, moving_window, collection);

  var fill_gap = p_month
    .gte(param.Clasif.fill_gap_month)
    .and(p_year.gte(param.Clasif.fill_gap_year))
    .selfMask();

  var detec = ee
    .Image(0)
    .where(
      slppost2
        .gt(param.Clasif.slppost2_corte)
        .and(p_img_month.gte(param.Clasif.p_img_month_gt)),
      1
    )
    .where(
      slppost2
        .lte(param.Clasif.slppost2_corte)
        .and(p_img_month.gte(param.Clasif.p_img_month_lte)),
      1
    );

  var deteccao = ee.Algorithms.If(
    p_img_month.bandNames().length().eq(1),
    detec,
    ee.Image(0).rename('p_water').selfMask()
  );
  deteccao = ee.Image(deteccao);

  var remv = p_year.lt(CONFIG.classification.softExcludeProbLt).selfMask();
  var gap = fill_gap.mask(deteccao.unmask(0).eq(0)).selfMask().multiply(3);
  var no_data = p_img_month.gt(0).add(1).unmask().eq(0).selfMask();

  var start = ee.Date.fromYMD(year, moving_window, 1);
  var end = start.advance(1, 'month');
  var col = Collection.filterDate(start, end).median();

  var mndwi_month = ee.Algorithms.If(
    col.bandNames().length().gt(0),
    col.normalizedDifference(['green', 'swir1']),
    ee.Image(0).rename('mndwi').selfMask()
  );
  mndwi_month = ee.Image(mndwi_month);

  var bright = ee.Algorithms.If(
    col.bandNames().length().gt(0),
    col.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2']),
    ee.Image.constant([0, 0]).selfMask()
  );
  bright = ee.Image(bright).reduce(ee.Reducer.mean());

  var water = deteccao
    .blend(no_data.multiply(5))
    .blend(gap)
    .blend(remv.multiply(7));

  // Brightness false-positive remapping inside optional `poli` polygons
  if (HAS_POLI) {
    var poliFc = ee.FeatureCollection(poli);
    var poliMask = ee
      .Image()
      .byte()
      .paint({featureCollection: poliFc, color: 1})
      .selfMask();
    water = water.where(
      poliMask
        .and(water.eq(1).or(water.eq(3)))
        .and(bright.gt(param.Clasif.pbri)),
      0
    );
  }

  water = water.where(water.eq(0), 4);
  water = ee.Algorithms.If(
    col.bandNames().length().gt(0),
    water.where(col.select(0).and(water.eq(3)), 2),
    water
  );
  water = ee.Image(water);

  water = ee.Algorithms.If(
    col.bandNames().length().gt(0),
    water.where(col.select(0).and(water.eq(7)), 6),
    water
  );
  water = ee.Image(water);

  water = water
    .where(
      water.eq(1).or(water.eq(2)).or(water.eq(3)).and(shademask2_v3.eq(1)),
      8
    )
    .where(
      water
        .eq(1)
        .or(water.eq(2))
        .or(water.eq(3))
        .and(slope.gte(param.Clasif.slope_gte)),
      9
    );

  return water.rename('water');
};

var water_prob_vis_func = function (year, moving_window, collection) {
  var p_img_month = p_img_month_func(year, moving_window, collection)[0];
  var fracc = p_img_month_func(year, moving_window, collection)[1];
  var p_month = p_month_func(year, moving_window, collection);
  return [p_img_month, p_month, fracc];
};

// -----------------------------------------------------------------------------
// Main loop
// -----------------------------------------------------------------------------
var dif, img1, img2;
var image_colAnt = ee.ImageCollection([]);
var image_ress = ee.ImageCollection([]);
var clasif_pais_agua = ee.ImageCollection([]);

param.years.forEach(function (year) {
  Collection = Collection.filterBounds(region);

  var water_y = water_y_m_func(year, 1, Collection)
    .rename('w_1')
    .addBands(water_y_m_func(year, 2, Collection).rename('w_2'))
    .addBands(water_y_m_func(year, 3, Collection).rename('w_3'))
    .addBands(water_y_m_func(year, 4, Collection).rename('w_4'))
    .addBands(water_y_m_func(year, 5, Collection).rename('w_5'))
    .addBands(water_y_m_func(year, 6, Collection).rename('w_6'))
    .addBands(water_y_m_func(year, 7, Collection).rename('w_7'))
    .addBands(water_y_m_func(year, 8, Collection).rename('w_8'))
    .addBands(water_y_m_func(year, 9, Collection).rename('w_9'))
    .addBands(water_y_m_func(year, 10, Collection).rename('w_10'))
    .addBands(water_y_m_func(year, 11, Collection).rename('w_11'))
    .addBands(water_y_m_func(year, 12, Collection).rename('w_12'));

  var PROB_M = water_prob_vis_func(year, 1, Collection)[0]
    .rename(year.toString() + '_p_img_month_1')
    .addBands(
      water_prob_vis_func(year, 2, Collection)[0].rename(
        year.toString() + '_p_img_month_2'
      )
    )
    .addBands(
      water_prob_vis_func(year, 3, Collection)[0].rename(
        year.toString() + '_p_img_month_3'
      )
    )
    .addBands(
      water_prob_vis_func(year, 4, Collection)[0].rename(
        year.toString() + '_p_img_month_4'
      )
    )
    .addBands(
      water_prob_vis_func(year, 5, Collection)[0].rename(
        year.toString() + '_p_img_month_5'
      )
    )
    .addBands(
      water_prob_vis_func(year, 6, Collection)[0].rename(
        year.toString() + '_p_img_month_6'
      )
    )
    .addBands(
      water_prob_vis_func(year, 7, Collection)[0].rename(
        year.toString() + '_p_img_month_7'
      )
    )
    .addBands(
      water_prob_vis_func(year, 8, Collection)[0].rename(
        year.toString() + '_p_img_month_8'
      )
    )
    .addBands(
      water_prob_vis_func(year, 9, Collection)[0].rename(
        year.toString() + '_p_img_month_9'
      )
    )
    .addBands(
      water_prob_vis_func(year, 10, Collection)[0].rename(
        year.toString() + '_p_img_month_10'
      )
    )
    .addBands(
      water_prob_vis_func(year, 11, Collection)[0].rename(
        year.toString() + '_p_img_month_11'
      )
    )
    .addBands(
      water_prob_vis_func(year, 12, Collection)[0].rename(
        year.toString() + '_p_img_month_12'
      )
    );

  var PROB_FM = water_prob_vis_func(year, 1, Collection)[2]
    .rename([
      year.toString() + '_p_img1_c1',
      year.toString() + '_p_img1_c2',
      year.toString() + '_p_img1_c3'
    ])
    .addBands(
      water_prob_vis_func(year, 2, Collection)[2].rename([
        year.toString() + '_p_img2_c1',
        year.toString() + '_p_img2_c2',
        year.toString() + '_p_img2_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 3, Collection)[2].rename([
        year.toString() + '_p_img3_c1',
        year.toString() + '_p_img3_c2',
        year.toString() + '_p_img3_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 4, Collection)[2].rename([
        year.toString() + '_p_img4_c1',
        year.toString() + '_p_img4_c2',
        year.toString() + '_p_img4_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 5, Collection)[2].rename([
        year.toString() + '_p_img5_c1',
        year.toString() + '_p_img5_c2',
        year.toString() + '_p_img5_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 6, Collection)[2].rename([
        year.toString() + '_p_img6_c1',
        year.toString() + '_p_img6_c2',
        year.toString() + '_p_img6_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 7, Collection)[2].rename([
        year.toString() + '_p_img7_c1',
        year.toString() + '_p_img7_c2',
        year.toString() + '_p_img7_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 8, Collection)[2].rename([
        year.toString() + '_p_img8_c1',
        year.toString() + '_p_img8_c2',
        year.toString() + '_p_img8_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 9, Collection)[2].rename([
        year.toString() + '_p_img9_c1',
        year.toString() + '_p_img9_c2',
        year.toString() + '_p_img9_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 10, Collection)[2].rename([
        year.toString() + '_p_img10_c1',
        year.toString() + '_p_img10_c2',
        year.toString() + '_p_img10_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 11, Collection)[2].rename([
        year.toString() + '_p_img11_c1',
        year.toString() + '_p_img11_c2',
        year.toString() + '_p_img11_c3'
      ])
    )
    .addBands(
      water_prob_vis_func(year, 12, Collection)[2].rename([
        year.toString() + '_p_img12_c1',
        year.toString() + '_p_img12_c2',
        year.toString() + '_p_img12_c3'
      ])
    );

  var PROB_IM = water_prob_vis_func(year, 1, Collection)[1]
    .rename(year.toString() + '_p_month_1')
    .addBands(
      water_prob_vis_func(year, 2, Collection)[1].rename(
        year.toString() + '_p_month_2'
      )
    )
    .addBands(
      water_prob_vis_func(year, 3, Collection)[1].rename(
        year.toString() + '_p_month_3'
      )
    )
    .addBands(
      water_prob_vis_func(year, 4, Collection)[1].rename(
        year.toString() + '_p_month_4'
      )
    )
    .addBands(
      water_prob_vis_func(year, 5, Collection)[1].rename(
        year.toString() + '_p_month_5'
      )
    )
    .addBands(
      water_prob_vis_func(year, 6, Collection)[1].rename(
        year.toString() + '_p_month_6'
      )
    )
    .addBands(
      water_prob_vis_func(year, 7, Collection)[1].rename(
        year.toString() + '_p_month_7'
      )
    )
    .addBands(
      water_prob_vis_func(year, 8, Collection)[1].rename(
        year.toString() + '_p_month_8'
      )
    )
    .addBands(
      water_prob_vis_func(year, 9, Collection)[1].rename(
        year.toString() + '_p_month_9'
      )
    )
    .addBands(
      water_prob_vis_func(year, 10, Collection)[1].rename(
        year.toString() + '_p_month_10'
      )
    )
    .addBands(
      water_prob_vis_func(year, 11, Collection)[1].rename(
        year.toString() + '_p_month_11'
      )
    )
    .addBands(
      water_prob_vis_func(year, 12, Collection)[1].rename(
        year.toString() + '_p_month_12'
      )
    );

  var PROB_AN = PROB_M.reduce(ee.Reducer.mean()).rename(
    year.toString() + '_probAn'
  );
  PROB_M = PROB_M.addBands(PROB_IM).addBands(PROB_AN);

  var image;
  clasif_pais_agua = clasif_pais
    .select('classification_' + year.toString())
    .eq(33)
    .selfMask();

  param.cartas.forEach(function (grid_name) {
    var grid = grids.filter(ee.Filter.eq('grid_name', grid_name));

    image = water_y
      .clip(grid)
      .selfMask()
      .set('year', year)
      .set('region', param.regionId)
      .set('version', param.version)
      .set('grid_name', grid_name)
      .set('pais', param.pais_name)
      .set('collection', CONFIG.collection)
      .set('method', CONFIG.method);

    image_colAnt = ConlAComp.filter(ee.Filter.eq('year', year))
      .filter(ee.Filter.eq('version', param.versionComp))
      .filterBounds(grid.geometry().buffer(-100));

    image_ress = image_ress.merge(image);

    if (param.ExportAgua) {
      Export.image.toAsset({
        image: image.byte(),
        description:
          CONFIG.exportDescriptionPrefix +
          '-' +
          year +
          '-' +
          grid_name +
          '-' +
          param.version,
        assetId:
          CONFIG.exportAssetRoot +
          '/' +
          CONFIG.exportDescriptionPrefix +
          '-' +
          year +
          '-' +
          grid_name +
          '-' +
          param.version,
        region: region.geometry().bounds(),
        scale: CONFIG.scale,
        pyramidingPolicy: {'.default': 'mode'},
        maxPixels: 1e13
      });
    }
  });

  Map.addLayer(
    image_colAnt.mosaic(),
    {},
    'previous-class-' + year.toString(),
    false
  );
  Map.addLayer(PROB_M, {}, 'probabilities-' + year.toString(), false);
  Map.addLayer(PROB_FM, {}, 'fractions-' + year.toString(), false);
  Map.addLayer(
    image_ress.filter(ee.Filter.eq('year', year)).mosaic(),
    {
      min: CLASS_PALETTE.min,
      max: CLASS_PALETTE.max,
      bands: ['w_1'],
      palette: vis_detec
    },
    'current-class-w_1-' + year.toString(),
    true
  );

  if (vis.Map_addLayer) {
    vis.listbandMonth.forEach(function (bandMonth) {
      var month = parseInt(bandMonth.split('_')[1], 10);
      var start = ee.Date.fromYMD(year, month, 1);
      var end = start.advance(1, 'month');

      Map.addLayer(
        Collection.filterBounds(region).filterDate(start, end).median(),
        {bands: ['swir1', 'nir', 'red'], gain: [0.08, 0.06, 0.2]},
        'mosaic-SNR-' + month + '-' + year,
        false
      );
      Map.addLayer(
        Collection.filterBounds(region).filterDate(start, end).median(),
        {bands: ['swir1', 'red', 'blue'], gain: [0.08, 0.06, 0.2]},
        'mosaic-SRB-' + month + '-' + year,
        false
      );
      Map.addLayer(
        Collection.filterBounds(region)
          .filterDate(start, end)
          .median()
          .normalizedDifference(['green', 'swir1']),
        {min: 0, max: 1},
        'mosaic-MNDWI-' + month + '-' + year,
        false
      );

      Map.addLayer(
        image_colAnt.select(bandMonth).mosaic(),
        {
          min: 1,
          max: 9,
          bands: [bandMonth],
          palette: vis_detec
        },
        'previous-' + bandMonth + '-' + year,
        false
      );

      img2 = image_ress.filter(ee.Filter.eq('year', year));
      Map.addLayer(
        img2.select(bandMonth).mosaic(),
        {
          min: 1,
          max: 9,
          bands: [bandMonth],
          palette: vis_detec
        },
        'current-' + bandMonth + '-' + year,
        bandMonth === 'w_1'
      );
      Map.addLayer(
        clasif_pais_agua,
        {palette: 'ff0af9'},
        'LULC-water-' + year.toString(),
        false
      );

      if (param.Comparacion) {
        img1 = image_colAnt.select(bandMonth).median();
        img2 = img2.select(bandMonth).median();
        img1 = img1.eq(1).or(img1.eq(2)).or(img1.eq(3));
        img2 = img2.eq(1).or(img2.eq(2)).or(img2.eq(3));

        dif = img1.unmask(img2).multiply(0);
        dif = dif.where(img1.and(img2), 2);
        dif = dif.where(dif.neq(2).and(img1), 1);
        dif = dif.where(dif.neq(2).and(img2), 3).selfMask();

        Map.addLayer(
          dif.select(bandMonth),
          {min: 1, max: 3, palette: ['ff0000', '00ff00', '0000ff']},
          'diff-prev-vs-current-' + bandMonth + '-' + year,
          false
        );
      }
    });
  }

  Map.addLayer(slope, {}, 'slope', false);
  Map.addLayer(
    slope.gte(CONFIG.classification.slopeGte).selfMask(),
    {palette: 'black'},
    'slope>=' + CONFIG.classification.slopeGte,
    false
  );
  Map.addLayer(
    shademask2_v3.selfMask(),
    {palette: 'aeaeae'},
    'shademask2',
    false
  );
  Map.addLayer(
    slppost2,
    {
      min: 0,
      max: 100,
      palette: [
        '0617ff',
        '108fff',
        '16fff6',
        '14ff33',
        'cdff12',
        'f9ff0c',
        'ffc416',
        'ff0000'
      ]
    },
    'slppost2',
    false
  );

  if (HAS_POLI) {
    Map.addLayer(poli, {color: 'yellow'}, 'Brightness polygons (poli)', false);
  }

  var img_input_freq = image
    .gte(1)
    .and(image.lte(3))
    .selfMask()
    .reduce(ee.Reducer.sum());
  var img_input = img_input_freq.gte(6).selfMask();

  if (vis.Map_addLayer) {
    Map.addLayer(
      img_input_freq,
      {palette: ['ffffff', '02ffe8', '0066cc', '000066'], min: 0, max: 12},
      'freq',
      false
    );
    Map.addLayer(img_input, {palette: 'blue'}, 'annual', false);
  }
});

// -----------------------------------------------------------------------------
// Legend
// -----------------------------------------------------------------------------
if (vis.Map_addLayer) {
  var legend = ui.Panel({
    style: {position: 'bottom-left', padding: '8px 15px'}
  });
  legend.add(
    ui.Label({
      value: 'Legend',
      style: {
        fontWeight: 'bold',
        fontSize: '16px',
        margin: '0 0 4px 0',
        padding: '0'
      }
    })
  );
  legend.add(
    ui.Label({
      value: 'Water classification (temperate / humid)',
      style: {fontSize: '10px', margin: '0 0 4px 0', padding: '0'}
    })
  );

  var makeRow = function (color, name) {
    return ui.Panel({
      widgets: [
        ui.Label({
          style: {
            backgroundColor: '#' + color,
            padding: '8px',
            margin: '0 0 4px 0'
          }
        }),
        ui.Label({value: name, style: {margin: '0 0 4px 6px'}})
      ],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
  };

  CLASS_PALETTE.labels.forEach(function (label, i) {
    legend.add(makeRow(vis_detec[i], label));
  });
  Map.add(legend);
}

print('Done. Active layer: current-class-w_1-*');
