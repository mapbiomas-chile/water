/**
 * Unified Landsat C2 mosaic + SMA module for Chile Water.
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Replaces the dry/wet × FilterNo/All/AllSnw/SC(/ESN) module family.
 * Callers choose pixel QA filter and SMA mode via options / PRESET names.
 *
 * Exports:
 *   get_Collection2(region, cloudCover, years, optionsOrPreset?)
 *   csf(image)
 *   setDefaultOptions / setDefaultPreset
 *   optionsFromPreset(presetName)
 *   PRESETS
 *
 * Fourth argument may be a PRESET name string (e.g. 'wet_FilterAllSnw')
 * or an options object.
 */

// -----------------------------------------------------------------------------
// Spectral endmembers (shared reflectance vectors)
// -----------------------------------------------------------------------------
var EM_GV    = [119.0, 475.0, 169.0, 6250.0, 2399.0, 675.0];
var EM_NPV   = [1514.0, 1597.0, 1421.0, 3053.0, 7707.0, 1975.0];
var EM_SOIL  = [1799.0, 2479.0, 3158.0, 5437.0, 7707.0, 6646.0];
var EM_CLOUD = [4031.0, 8714.0, 7900.0, 8989.0, 7002.0, 6607.0];
var EM_SNOW  = [7800.0, 7910.0, 7950.0, 6750.0, 310.0, 380.0];
var EM_SHADE = [810.0, 650.0, 100.0, 0.0, 0.0, 0.0];

var BAND_NAMES = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'];
var BANDS_L5 = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
var BANDS_L7 = ['SR_B1', 'SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B7'];
var BANDS_L8 = ['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'SR_B7'];

// -----------------------------------------------------------------------------
// Presets (named configurations for get_Collection2)
// -----------------------------------------------------------------------------
var PRESETS = {
  dry_FilterNo: {
    pixelFilter: 'none', smaMode: 'dry',
    useCloudScore: false, sortByCloudCover: true, l7EndDate: '2014-12-31'
  },
  dry_FilterAll: {
    pixelFilter: 'all', smaMode: 'dry',
    useCloudScore: false, sortByCloudCover: false, l7EndDate: '2014-12-31'
  },
  dry_FilterAllSnw: {
    pixelFilter: 'all_snow', smaMode: 'dry',
    useCloudScore: false, sortByCloudCover: false, l7EndDate: '2014-12-31'
  },
  dry_FilterSC: {
    pixelFilter: 'sc', smaMode: 'dry',
    useCloudScore: false, sortByCloudCover: false, l7EndDate: '2014-12-31'
  },
  wet_FilterAll: {
    pixelFilter: 'all', smaMode: 'wet',
    useCloudScore: false, cloudScoreThresh: 10,
    sortByCloudCover: false, l7EndDate: '2013-12-31'
  },
  wet_FilterAllSnw: {
    pixelFilter: 'all_snow', smaMode: 'wet_nosnow',
    useCloudScore: true, cloudScoreThresh: 10,
    sortByCloudCover: false, l7EndDate: '2013-12-31'
  },
  wet_FilterSC: {
    pixelFilter: 'sc', smaMode: 'wet_nosnow',
    useCloudScore: true, cloudScoreThresh: 10,
    sortByCloudCover: false, l7EndDate: '2013-12-31'
  },
  wet_ESN_FilterAll: {
    pixelFilter: 'all', smaMode: 'wet',
    useCloudScore: false, cloudScoreThresh: 10,
    sortByCloudCover: false, l7EndDate: '2013-12-31'
  },
  wet_ESN_FilterAllSnw: {
    pixelFilter: 'all_snow', smaMode: 'wet',
    useCloudScore: false, cloudScoreThresh: 10,
    sortByCloudCover: false, l7EndDate: '2013-12-31'
  }
};

var defaultOptions = {
  pixelFilter: 'none',
  smaMode: 'dry',
  useCloudScore: false,
  cloudScoreThresh: 30,
  sortByCloudCover: false,
  l7EndDate: '2014-12-31'
};

function mergeOptions(base, extra) {
  var out = {};
  var k;
  for (k in base) {
    if (base.hasOwnProperty(k)) out[k] = base[k];
  }
  if (extra) {
    for (k in extra) {
      if (extra.hasOwnProperty(k) && extra[k] !== undefined && extra[k] !== null) {
        out[k] = extra[k];
      }
    }
  }
  return out;
}

/** Resolve a PRESET name (string) or options object. */
function optionsFromPreset(presetOrOptions) {
  if (presetOrOptions === undefined || presetOrOptions === null) {
    return null;
  }
  if (typeof presetOrOptions === 'string') {
    var name = String(presetOrOptions).trim();
    if (!PRESETS[name]) {
      throw new Error('Unknown mosaic PRESET: ' + name);
    }
    return PRESETS[name];
  }
  return presetOrOptions;
}

exports.PRESETS = PRESETS;

exports.optionsFromPreset = optionsFromPreset;

exports.setDefaultOptions = function(options) {
  defaultOptions = mergeOptions(defaultOptions, optionsFromPreset(options) || {});
};

exports.setDefaultPreset = function(presetName) {
  exports.setDefaultOptions(optionsFromPreset(presetName));
};

// -----------------------------------------------------------------------------
// QA pixel filters
// -----------------------------------------------------------------------------
function qaFlags(image) {
  var bandNames = image.bandNames();
  var hasQA_PIXEL = bandNames.contains('QA_PIXEL');
  var hasPixelQA = bandNames.contains('pixel_qa');

  var c2 = (function() {
    var qa = image.select('QA_PIXEL');
    return {
      cirrus: qa.bitwiseAnd(1 << 2).neq(0),
      cloud: qa.bitwiseAnd(1 << 3).neq(0),
      shadow: qa.bitwiseAnd(1 << 4).neq(0),
      snow: qa.bitwiseAnd(1 << 5).neq(0)
    };
  })();

  var c1 = (function() {
    var qa = image.select('pixel_qa');
    return {
      shadow: qa.bitwiseAnd(1 << 3).neq(0),
      snow: qa.bitwiseAnd(1 << 4).neq(0),
      cloud: qa.bitwiseAnd(1 << 5).neq(0),
      cirrus: ee.Image(0) // not in C1 mask set used historically
    };
  })();

  return { hasQA_PIXEL: hasQA_PIXEL, hasPixelQA: hasPixelQA, c2: c2, c1: c1 };
}

function maskBadPixels(image, pixelFilter) {
  if (pixelFilter === 'none') return image;

  var f = qaFlags(image);

  var maskC2 = (function() {
    var bad;
    if (pixelFilter === 'sc') {
      bad = f.c2.shadow;
    } else if (pixelFilter === 'all_snow') {
      bad = f.c2.cirrus.or(f.c2.cloud).or(f.c2.shadow);
    } else {
      // 'all'
      bad = f.c2.cirrus.or(f.c2.cloud).or(f.c2.shadow).or(f.c2.snow);
    }
    return image.updateMask(bad.not());
  })();

  var maskC1 = (function() {
    var bad;
    if (pixelFilter === 'sc') {
      bad = f.c1.shadow;
    } else if (pixelFilter === 'all_snow') {
      bad = f.c1.shadow.or(f.c1.cloud);
    } else {
      bad = f.c1.shadow.or(f.c1.snow).or(f.c1.cloud);
    }
    return image.updateMask(bad.not());
  })();

  return ee.Image(ee.Algorithms.If(
    f.hasQA_PIXEL, maskC2,
    ee.Algorithms.If(f.hasPixelQA, maskC1, image)
  ));
}

// -----------------------------------------------------------------------------
// Scaling / SMA / cloudScore
// -----------------------------------------------------------------------------
function applyScaleFactors(image) {
  var opticalBands = image.select('SR_B.')
    .multiply(0.0000275).add(-0.2).multiply(10000);
  return image.addBands(opticalBands, null, true).toUint16();
}

function sma(image, smaMode) {
  var fractions;
  var shade;

  if (smaMode === 'dry') {
    fractions = ee.Image(image)
      .select(BAND_NAMES)
      .unmix([EM_GV, EM_NPV, EM_SOIL, EM_CLOUD, EM_SNOW, EM_SHADE], true, true)
      .max(0).multiply(100).byte()
      .rename(['gv', 'npv', 'soil', 'cloud', 'snow', 'shade']);
    return image.addBands(fractions);
  }

  if (smaMode === 'wet') {
    fractions = ee.Image(image)
      .select(BAND_NAMES)
      .unmix([EM_GV, EM_NPV, EM_SOIL, EM_CLOUD, EM_SNOW])
      .max(0).multiply(100).byte()
      .rename(['gv', 'npv', 'soil', 'cloud', 'snow']);
    shade = fractions.expression('b("gv") + b("npv") + b("soil")')
      .subtract(100).abs().byte().rename('shade');
    return image.addBands(fractions).addBands(shade);
  }

  // wet_nosnow: no snow endmember; expose snow=0 for API stability
  fractions = ee.Image(image)
    .select(BAND_NAMES)
    .unmix([EM_GV, EM_NPV, EM_SOIL, EM_CLOUD])
    .max(0).multiply(100).byte()
    .rename(['gv', 'npv', 'soil', 'cloud']);
  shade = fractions.expression('b("gv") + b("npv") + b("soil")')
    .subtract(100).abs().byte().rename('shade');
  var snow0 = ee.Image(0).byte().rename('snow');
  return image.addBands(fractions).addBands(shade).addBands(snow0);
}

function cloudScore(image, thresh) {
  thresh = thresh === undefined || thresh === null ? 10 : thresh;

  var rescale = function(obj) {
    return obj.image.subtract(obj.min)
      .divide(ee.Number(obj.max).subtract(obj.min))
      .clamp(0, 1);
  };

  var score = ee.Image(1.0);
  score = score.min(rescale({
    image: image.select(['blue']), min: 1000, max: 3000
  }));
  score = score.min(rescale({
    image: image.expression("b('red') + b('green') + b('blue')"),
    min: 2000, max: 8000
  }));
  score = score.min(rescale({
    image: image.expression("b('nir') + b('swir1') + b('swir2')"),
    min: 3000, max: 8000
  }));
  var ndsi = image.normalizedDifference(['green', 'swir1']);
  score = score.min(rescale({
    image: ndsi, min: 0.8, max: 0.6
  })).multiply(100).uint16();

  return image.updateMask(score.lt(thresh));
}

function regionBounds(region) {
  // Accept FeatureCollection (typical grid FC) or Geometry
  return ee.FeatureCollection(region).geometry().bounds();
}

function yearRange(years) {
  var ymin = 2100;
  var ymax = 1983;
  years.forEach(function(y) {
    if (ymin > y) ymin = y;
    if (ymax < y) ymax = y;
  });
  return { ymin: ymin, ymax: ymax };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------
exports.get_Collection2 = function(geometry, cloud_cover, years, optionsOrPreset) {
  var opts = mergeOptions(defaultOptions, optionsFromPreset(optionsOrPreset) || {});
  var yr = yearRange(years);
  var bounds = regionBounds(geometry);
  var pixelFilter = opts.pixelFilter;
  var smaMode = opts.smaMode;

  var l5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2');
  var l7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2')
    .filterDate('1995-01-01', opts.l7EndDate);
  var l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');

  var dateStart = (yr.ymin - 5) + '-01-01';
  var dateEnd = (yr.ymax + 5) + '-12-31';

  function prep(col, inputBands) {
    var out = col
      .filterDate(dateStart, dateEnd)
      .filterBounds(bounds)
      .map(applyScaleFactors)
      .map(function(img) { return maskBadPixels(img, pixelFilter); });
    out = out.select(inputBands, BAND_NAMES)
      .map(function(img) { return sma(img, smaMode); });
    return out;
  }

  var processed = prep(l5, BANDS_L5)
    .merge(prep(l7, BANDS_L7))
    .merge(prep(l8, BANDS_L8))
    .filter(ee.Filter.lte('CLOUD_COVER', cloud_cover));

  if (opts.sortByCloudCover) {
    processed = processed.sort('CLOUD_COVER');
  }
  if (opts.useCloudScore) {
    var thr = opts.cloudScoreThresh;
    processed = processed.map(function(img) { return cloudScore(img, thr); });
  }

  return processed;
};

exports.csf = function(image) {
  var CSF = image.expression(
    '(shade - (gv + npv + soil))  / (shade + gv + npv + soil)', {
      gv: image.select('gv'),
      npv: image.select('npv'),
      soil: image.select('soil'),
      shade: image.select('shade')
    }
  ).rename('csf');
  return image.addBands(CSF);
};
