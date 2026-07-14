/**
 * Step 01 — Vectorize water objects from preliminary classification.
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Input:  monthly classification images (bands w_1…w_12, classes C1–C9)
 *         from CLASSIFICATION exports (classification-01 or classification-02).
 * Output: FeatureCollection of water objects (C1–C3 frequency > 0) with
 *         mean annual water frequency and mean slope attributes.
 *
 * Uses reduceToVectors (not Streaming — not available in all GEE clients).
 * Optional quadrant split (QUADRANT_ROWS × QUADRANT_COLS) exports one asset
 * per cell to keep tasks manageable on large grids.
 *
 * Next: object / pixel masks (frequency, slope, CSF, exclusions).
 */

// -----------------------------------------------------------------------------
// Classes / palette (preview of input classification)
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
  ]
};

// -----------------------------------------------------------------------------
// Configuration — edit per run
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  step: '01_vectorize_water_objects',

  years: [2017, 2018],
  grids: ['SG-19-Y'],

  classificationVersion: 1,
  outputVersion: 1,

  /** Preview month band from classification (e.g. w_7). */
  previewMonthBand: 'w_7',

  /**
   * Source classification ImageCollection folder.
   * classification-01 → temperate | classification-02 → arid
   */
  classificationAssetRoot:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-02',

  exportAssetBase:
    'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/POSTPROCESSING',

  gridAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile',
  /**
   * 0.25° subgrids used to chunk reduceToVectors.
   * (Current production path still under mapbiomas-raisg auxiliary TEMP.)
   */
  subgridAsset:
    'projects/mapbiomas-raisg/PRODUCTOS/AGUA/DATOS_AUXILIARES/TEMP/sub_grid_0_25_america_sul',

  demCollection: 'projects/sat-io/open-datasets/FABDEM',

  /** Grid split of each carta. 1×1 = full grid; e.g. 2×3 = 6 export tasks. */
  quadrantRows: 1,
  quadrantCols: 1,

  scale: 30,
  previewOnMap: true,
  runExport: false
};

// -----------------------------------------------------------------------------
// Resolve vector output folder from classification root
// -----------------------------------------------------------------------------
function vectorDirectoryFromClassRoot(classRoot) {
  if (classRoot.indexOf('classification-01') !== -1) return '01-VECT-01';
  if (classRoot.indexOf('classification-02') !== -1) return '01-VECT-02';
  return '01-VECT';
}

var VECTOR_DIR = vectorDirectoryFromClassRoot(CONFIG.classificationAssetRoot);

// -----------------------------------------------------------------------------
// Load classification ImageCollection from asset folder
// -----------------------------------------------------------------------------
var assetList = ee.data.listAssets(CONFIG.classificationAssetRoot).assets;
var classificationIc = ee
  .ImageCollection(
    assetList.map(function (asset) {
      return ee.Image(asset.name);
    })
  )
  .filter(ee.Filter.inList('grid_name', ee.List(CONFIG.grids)))
  .filter(ee.Filter.eq('version', CONFIG.classificationVersion));

print('Collection 01 | Vectorize water objects');
print('Classification root:', CONFIG.classificationAssetRoot);
print('Vector folder:', VECTOR_DIR);
print('Years:', CONFIG.years);
print('Grids:', CONFIG.grids);
print('Quadrants:', CONFIG.quadrantRows + ' × ' + CONFIG.quadrantCols);
print('Export:', CONFIG.runExport ? 'enabled' : 'disabled');
print('Classification IC size (matching filters):', classificationIc.size());

// -----------------------------------------------------------------------------
// Spatial references
// -----------------------------------------------------------------------------
var GRIDS = ee.FeatureCollection(CONFIG.gridAsset);
var GRIDS_SEL = GRIDS.filter(ee.Filter.inList('grid_name', ee.List(CONFIG.grids)));
var AOI = GRIDS_SEL.geometry();

Map.centerObject(GRIDS_SEL, 8);
Map.addLayer(
  GRIDS_SEL.style({color: 'FF0000', fillColor: '00000000', width: 2}),
  {},
  'Selected grids',
  true
);
Map.addLayer(GRIDS, {}, 'All grids', false);

var SUBGRIDS = ee
  .FeatureCollection(CONFIG.subgridAsset)
  .filterBounds(AOI);
Map.addLayer(SUBGRIDS, {}, 'Subgrids 0.25°', false);

// -----------------------------------------------------------------------------
// Slope (FABDEM)
// -----------------------------------------------------------------------------
var SLOPE = ee
  .Terrain.slope(
    ee
      .ImageCollection(CONFIG.demCollection)
      .mosaic()
      .setDefaultProjection('EPSG:3857', null, 30)
  )
  .rename('mean_slope');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function assertQuadrantGrid(rows, cols) {
  if (!rows || !cols || rows < 1 || cols < 1) {
    throw new Error('CONFIG.quadrantRows / quadrantCols must be >= 1');
  }
}

function assignCellIndex(feature, xmin, ymin, xstep, ystep, cols) {
  var coords = feature.geometry().centroid(1).coordinates();
  var x = ee.Number(coords.get(0));
  var y = ee.Number(coords.get(1));

  var col = x.subtract(xmin).divide(xstep).floor().min(cols - 1).max(0);
  var row = y
    .subtract(ymin)
    .divide(ystep)
    .floor()
    .min(CONFIG.quadrantRows - 1)
    .max(0);
  var idx = row.multiply(cols).add(col);

  return feature
    .set('cell_row', row)
    .set('cell_col', col)
    .set('cell_idx', idx)
    .set('cell_rc', row.format('%d').cat('_').cat(col.format('%d')));
}

/**
 * Vectorize water mask inside each 0.25° subgrid of one quadrant cell.
 * Uses reduceToVectors (compatible with Code Editor; Streaming is not).
 */
function vectorizeCell(binaryImage, subgridsCell) {
  var subList = subgridsCell.toList(subgridsCell.size());

  return ee.FeatureCollection(
    ee.List(subList).iterate(function (sub, acc) {
      sub = ee.Feature(sub);
      acc = ee.FeatureCollection(acc);

      var subGeom = sub.geometry();
      var subImg = binaryImage.clip(subGeom);

      var anyVal = ee.Dictionary(
        subImg.reduceRegion({
          reducer: ee.Reducer.anyNonZero(),
          geometry: subGeom,
          scale: CONFIG.scale,
          maxPixels: 1e8,
          tileScale: 4
        })
      );

      var hasData = ee.Algorithms.If(
        anyVal.size().gt(0),
        anyVal.values().get(0),
        0
      );

      var vecPart = ee.FeatureCollection(
        ee.Algorithms.If(
          hasData,
          subImg.reduceToVectors({
            geometry: subGeom,
            scale: CONFIG.scale,
            maxPixels: 1e13,
            tileScale: 4
          }),
          ee.FeatureCollection([])
        )
      );

      return acc.merge(vecPart);
    }, ee.FeatureCollection([]))
  );
}

function exportObjects(year, gridName, cellIdx, collection) {
  var baseName =
    'water_objs_' +
    year +
    '_' +
    gridName +
    '_c' +
    cellIdx +
    '_' +
    CONFIG.classificationVersion;

  var assetId =
    CONFIG.exportAssetBase + '/' + VECTOR_DIR + '/' + baseName;

  if (CONFIG.runExport) {
    Export.table.toAsset({
      collection: collection,
      description: baseName,
      assetId: assetId
    });
    print('Export queued:', assetId);
  } else {
    print('Export disabled — would write:', assetId);
    print('Object count (cell ' + cellIdx + '):', collection.size());
  }
}

// -----------------------------------------------------------------------------
// Main loops
// -----------------------------------------------------------------------------
assertQuadrantGrid(CONFIG.quadrantRows, CONFIG.quadrantCols);
var cellCount = CONFIG.quadrantRows * CONFIG.quadrantCols;

CONFIG.years.forEach(function (year) {
  CONFIG.grids.forEach(function (gridName) {
    var classified = classificationIc
      .filter(ee.Filter.eq('year', year))
      .filter(ee.Filter.eq('grid_name', gridName))
      .mosaic()
      .selfMask();

    if (CONFIG.previewOnMap) {
      Map.addLayer(
        classified,
        {
          palette: CLASS_PALETTE.colors,
          min: CLASS_PALETTE.min,
          max: CLASS_PALETTE.max,
          bands: [CONFIG.previewMonthBand]
        },
        'classif-' + year + '-' + gridName,
        true
      );
    }

    // Water months: C1–C3
    var waterMonthly = classified.gte(1).and(classified.lte(3));
    var freqYear = waterMonthly
      .reduce(ee.Reducer.sum())
      .selfMask()
      .rename('mean_freq');
    var waterMask = freqYear.gt(0).selfMask();

    if (CONFIG.previewOnMap) {
      Map.addLayer(
        freqYear,
        {min: 1, max: 12, palette: ['ffffff', '02ffe8', '0066cc', '000066']},
        'freq-' + year + '-' + gridName,
        false
      );
      Map.addLayer(
        waterMask,
        {palette: ['0000ff']},
        'water-mask-' + year + '-' + gridName,
        false
      );
    }

    var gridFeat = GRIDS_SEL.filter(ee.Filter.eq('grid_name', gridName));
    var geomGrid = ee.Feature(gridFeat.first()).geometry();
    var geomInner = geomGrid.buffer(-100);
    var subgridsGrid = SUBGRIDS.filterBounds(geomInner);

    var bounds = geomInner.bounds();
    var ring = ee.List(bounds.coordinates().get(0));
    var xmin = ee.Number(ee.List(ring.get(0)).get(0));
    var ymin = ee.Number(ee.List(ring.get(0)).get(1));
    var xmax = ee.Number(ee.List(ring.get(2)).get(0));
    var ymax = ee.Number(ee.List(ring.get(2)).get(1));
    var xstep = xmax.subtract(xmin).divide(CONFIG.quadrantCols);
    var ystep = ymax.subtract(ymin).divide(CONFIG.quadrantRows);

    var subgridsCells = subgridsGrid.map(function (f) {
      return assignCellIndex(
        f,
        xmin,
        ymin,
        xstep,
        ystep,
        CONFIG.quadrantCols
      );
    });

    for (var cellIdx = 0; cellIdx < cellCount; cellIdx++) {
      var subCell = subgridsCells.filter(ee.Filter.eq('cell_idx', cellIdx));
      var vectors = vectorizeCell(waterMask, subCell);

      var stackStats = freqYear.addBands(SLOPE);
      var vectorsWithProps = stackStats
        .reduceRegions({
          collection: vectors,
          reducer: ee.Reducer.mean(),
          scale: CONFIG.scale,
          tileScale: 4
        })
        .map(function (f) {
          return f
            .set('year', year)
            .set('grid_name', gridName)
            .set('cell_idx', cellIdx)
            .set('quadrant_rows', CONFIG.quadrantRows)
            .set('quadrant_cols', CONFIG.quadrantCols)
            .set('versionClassif', CONFIG.classificationVersion)
            .set('versionOut', CONFIG.outputVersion)
            .set('collection', CONFIG.collection)
            .set('step', CONFIG.step);
        });

      if (CONFIG.previewOnMap && cellIdx === 0) {
        Map.addLayer(
          vectorsWithProps,
          {color: '00FFFF'},
          'objects-' + year + '-' + gridName + '-c0',
          false
        );
      }

      exportObjects(year, gridName, cellIdx, vectorsWithProps);
    }
  });
});

print('Done. Toggle Layers: classif-* is on by default.');
