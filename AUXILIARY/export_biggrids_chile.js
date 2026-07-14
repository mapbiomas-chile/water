/**
 * Export biggrids for Chile (carta mosaics).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Dissolves RAISG / world LULC mosaic tiles into 7-char big grids
 * (`grid_name`, e.g. SI-19-Y) covering Chile.
 *
 * Output:
 *   projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile
 *
 * Paste into the Code Editor and Run. Set CONFIG.runExport = true to queue the Task.
 */

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  country: 'Chile',

  worldGridAsset:
    'projects/mapbiomas-raisg/DATOS_AUXILIARES/VECTORES/grid-world',
  // Continental Chile mask (same as classification QA / shade export).
  countryRasterAsset:
    'projects/mapbiomas-chile/assets/ANCILLARY_DATA/STATISTICS/COLLECTION1/VERSION-1/nivel-politico-1-raster',

  outAssetId:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile',
  exportDescription: 'biggrids-chile',

  // Big-grid id = first 7 chars of tile `name` (e.g. SI-19-Y from SI-19-Y-…).
  bigNameSliceEnd: 7,
  dissolveMaxError: 50,

  previewOnMap: true,
  runExport: false
};

// -----------------------------------------------------------------------------
var grids = ee.FeatureCollection(CONFIG.worldGridAsset);
var countryMask = ee.Image(CONFIG.countryRasterAsset).gt(0).selfMask();
var countryGeom = countryMask.geometry({ maxError: 1000 });

var grid = grids.filterBounds(countryGeom);

print('Tiles intersecting Chile (sample names):',
  grid.limit(20).aggregate_array('name'));

var bigNameProp = grid.map(function (f) {
  return f.set(
    'bigName',
    ee.String(f.get('name')).slice(0, CONFIG.bigNameSliceEnd)
  );
});

var bigName = bigNameProp.aggregate_array('bigName').distinct();
print('Distinct bigName count (client):', bigName.size());

var bigGridList = bigName.map(function (l) {
  var nuwGrid = bigNameProp.filter(ee.Filter.eq('bigName', ee.String(l)));
  return ee.Feature(
    ee.Geometry.MultiPolygon(nuwGrid.geometry().coordinates())
      .dissolve(CONFIG.dissolveMaxError)
  )
    .set('pais', CONFIG.country)
    .set('grid_name', ee.String(l));
});

var bigGrid = ee.FeatureCollection(bigGridList);
print('bigGrid size:', bigGrid.size());

if (CONFIG.previewOnMap) {
  Map.centerObject(countryGeom, 4);
  Map.addLayer(countryMask, { palette: ['cccccc'] }, 'Chile mask', false);
  Map.addLayer(grid.style({ color: '888888', fillColor: '00000000', width: 0.5 }),
    {}, 'World tiles (Chile filter)', false);
  Map.addLayer(bigGrid.style({ color: 'FFCC00', fillColor: '00000000', width: 1.5 }),
    {}, 'biggrids Chile', true);
}

if (CONFIG.runExport) {
  Export.table.toAsset({
    collection: bigGrid,
    description: CONFIG.exportDescription,
    assetId: CONFIG.outAssetId
  });
  print('Export queued:', CONFIG.outAssetId);
} else {
  print('Preview only. Set CONFIG.runExport = true to export', CONFIG.outAssetId);
}
