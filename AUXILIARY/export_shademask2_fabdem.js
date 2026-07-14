/**
 * Export topographic shade mask (FABDEM + Landsat mean sun geometry).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Builds shade_mask2 from FABDEM hillshade / hillShadow using mean
 * SUN_AZIMUTH / SUN_ELEVATION from Landsat 5 and 8 sample windows,
 * then takes the per-pixel max and masks to continental Chile.
 *
 * Pipeline asset id (CLASSIFICATION / step02 / revision):
 *   …/RASTER/shademask2_FABDEM
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

  // Sample windows for mean solar geometry (Collection 2 L2).
  landsat5Start: '2005-01-01',
  landsat5End: '2006-12-31',
  landsat8Start: '2012-01-01',
  landsat8End: '2013-12-31',

  hillShadowMeanLte: 0.9,
  hillShadeLte: 120,
  hillShadowMaxDistance: 300,

  outAssetId:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/shademask2_FABDEM',
  exportDescription: 'shademask2_FABDEM',
  scale: 30,

  previewOnMap: true,
  runExport: false
};

// -----------------------------------------------------------------------------
var regionRas = ee.Image(CONFIG.countryRasterAsset).gt(0);
var regionGeom = regionRas.selfMask().geometry({ maxError: 1000 });

function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
  var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0);
  return image.addBands(opticalBands, null, true)
              .addBands(thermalBand, null, true);
}

var landsatLT05 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
  .filterBounds(regionGeom)
  .filterDate(CONFIG.landsat5Start, CONFIG.landsat5End)
  .map(applyScaleFactors);

var landsatLC08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
  .filterBounds(regionGeom)
  .filterDate(CONFIG.landsat8Start, CONFIG.landsat8End);

var Terrain = ee.ImageCollection(CONFIG.demCollection)
  .mosaic()
  .rename('elevation')
  .reproject({ crs: 'EPSG:3857', scale: CONFIG.scale });

function shadeMask2(SAA, SE) {
  var sunAzimuth = ee.Number(SAA);
  var sunElevation = ee.Number(SE);
  var sunZenith = ee.Number(90).subtract(sunElevation);

  var hillShadow = ee.Terrain.hillShadow(
    Terrain, sunAzimuth, sunZenith, CONFIG.hillShadowMaxDistance, true);
  var hillShade = ee.Terrain.hillshade(Terrain, sunAzimuth, sunElevation);
  var hillShadowMean = hillShadow.reduceNeighborhood({
    reducer: ee.Reducer.mean(),
    kernel: ee.Kernel.square(30, 'meters')
  });

  return ee.Image(0)
    .where(
      hillShadowMean.lte(CONFIG.hillShadowMeanLte)
        .or(hillShade.lte(CONFIG.hillShadeLte)),
      1
    )
    .toUint8()
    .rename('shade_mask2');
}

var meanSAA_L5 = landsatLT05.aggregate_mean('SUN_AZIMUTH');
var meanSE_L5 = landsatLT05.aggregate_mean('SUN_ELEVATION');
var meanSAA_L8 = landsatLC08.aggregate_mean('SUN_AZIMUTH');
var meanSE_L8 = landsatLC08.aggregate_mean('SUN_ELEVATION');

print('mean SAA/SE L5:', meanSAA_L5, meanSE_L5);
print('mean SAA/SE L8:', meanSAA_L8, meanSE_L8);

var shade_mask2_L5 = shadeMask2(ee.Number(meanSAA_L5), ee.Number(meanSE_L5));
var shade_mask2_L8 = shadeMask2(ee.Number(meanSAA_L8), ee.Number(meanSE_L8));

var shade_mask2_med = shade_mask2_L5
  .addBands(shade_mask2_L8)
  .reduce('max')
  .mask(regionRas)
  .selfMask()
  .rename('shade_mask2');

if (CONFIG.previewOnMap) {
  Map.centerObject(regionGeom, 4);
  Map.addLayer(regionRas.selfMask(), {}, 'Chile mask', false);
  Map.addLayer(
    landsatLT05.median(),
    { bands: ['SR_B3', 'SR_B2', 'SR_B1'], min: 0, max: 0.3 },
    'L5 mosaic (sample window)',
    false
  );
  Map.addLayer(shade_mask2_med, { palette: ['fbbf24'] }, 'shademask2 (max L5/L8)', true);
}

if (CONFIG.runExport) {
  Export.image.toAsset({
    image: shade_mask2_med.toUint8(),
    description: CONFIG.exportDescription,
    assetId: CONFIG.outAssetId,
    scale: CONFIG.scale,
    region: regionGeom.bounds(),
    maxPixels: 1e13,
    pyramidingPolicy: { '.default': 'mode' }
  });
  print('Export queued:', CONFIG.outAssetId);
} else {
  print('Preview only. Set CONFIG.runExport = true to export', CONFIG.outAssetId);
}
