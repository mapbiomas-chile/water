/**
 * Export slppost (valley–ridge relative elevation) from FABDEM.
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Relative position of each pixel between local min (valley) and max (ridge)
 * in a square kernel → percent-like 0–100 layer used in the decision tree
 * (`slppostCutoff` in arid/temperate classification).
 *
 * Output:
 *   …/RASTER/slppost2_30_FABDEM
 *
 * Paste into the Code Editor and Run. Set CONFIG.runExport = true for Tasks.
 */

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------
var CONFIG = {
  collection: '01',
  country: 'Chile',

  countryRasterAsset:
    'projects/mapbiomas-chile/assets/ANCILLARY_DATA/STATISTICS/COLLECTION1/VERSION-1/nivel-politico-1-raster',
  demCollection: 'projects/sat-io/open-datasets/FABDEM',

  // Kernel size in pixels (legacy name: slppost2_30 → kernel 30).
  kernelPixels: 30,

  outAssetId:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/slppost2_30_FABDEM',
  exportDescription: 'slppost2_30_FABDEM',
  scale: 30,

  previewOnMap: true,
  runExport: false
};

// -----------------------------------------------------------------------------
var geometryRas = ee.Image(CONFIG.countryRasterAsset).gt(0);
var area = geometryRas.selfMask().geometry({ maxError: 1000 });

var dem = ee.ImageCollection(CONFIG.demCollection)
  .filterBounds(area)
  .mosaic()
  .mask(geometryRas)
  .selfMask();

var valleyElev = dem.reduceNeighborhood({
  reducer: ee.Reducer.min(),
  kernel: ee.Kernel.square(CONFIG.kernelPixels)
});

var ridgeElev = dem.reduceNeighborhood({
  reducer: ee.Reducer.max(),
  kernel: ee.Kernel.square(CONFIG.kernelPixels)
});

var imTop = dem.subtract(valleyElev);
var imBottom = ridgeElev.subtract(valleyElev);

var slppost2 = imTop
  .divide(imBottom)
  .multiply(100)
  .add(0.5)
  .toUint8()
  .rename('slppost');

if (CONFIG.previewOnMap) {
  Map.centerObject(area, 4);
  Map.addLayer(geometryRas.selfMask(), {}, 'Chile mask', false);
  Map.addLayer(
    slppost2,
    {
      min: 0,
      max: 100,
      palette: [
        '#00007F', '#0000FF', '#007FFF', '#00FFFF',
        '#7FFF7F', '#FFFF00', '#FF7F00', '#FF0000', '#7F0000'
      ]
    },
    'slppost2',
    true
  );
}

if (CONFIG.runExport) {
  Export.image.toAsset({
    image: slppost2,
    description: CONFIG.exportDescription,
    assetId: CONFIG.outAssetId,
    scale: CONFIG.scale,
    region: area,
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mode' }
  });
  print('Export queued:', CONFIG.outAssetId);
} else {
  print('Preview only. Set CONFIG.runExport = true to export', CONFIG.outAssetId);
}
