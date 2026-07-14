/**
 * Fuzzy water-probability helpers (temperate / humid classification).
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Extracted from the former wet mosaic modules (setLimeares / p_*_func).
 * Use with Module_mosaic_landsat collections (bands gv, soil, shade, cloud,
 * snow optional).
 *
 * Exports:
 *   setLimeares, setParametroSMA, setParametroReducto, setZeroSnowProb
 *   p_img_month_func, p_year_func, p_month_func
 */

var first_year = 1985;
var last_year = 2025;

var shade_min = 85;
var shade_max = 92;
var gv_soil_min = 0;
var gv_soil_max = 10;
var cloud_desc_min = 21;
var cloud_desc_max = 31;
var cloud_asc_min = 2;
var cloud_asc_max = 7;

var AplicarSMA = false;
var ecuacionLineal = {
  shade: [0.8487, 14.947],
  gv_soil: [1.1097, 0.1702],
  cloud: [1.0093, 1.0273]
};
var reductor = 'median';

/** If true, force prob=0 where snow >= 80 (FilterAll / ESN behaviour). */
var zeroSnowProb = true;

exports.setLimeares = function(Limeares) {
  shade_min = Limeares.shade_min;
  shade_max = Limeares.shade_max;
  gv_soil_min = Limeares.gv_soil_min;
  gv_soil_max = Limeares.gv_soil_max;
  cloud_desc_min = Limeares.cloud_desc_min;
  cloud_desc_max = Limeares.cloud_desc_max;
  cloud_asc_min = Limeares.cloud_asc_min;
  cloud_asc_max = Limeares.cloud_asc_max;
};

exports.setParametroSMA = function(ApplySMAe) {
  AplicarSMA = ApplySMAe.Apply;
  ecuacionLineal.shade = ApplySMAe.shade;
  ecuacionLineal.gv_soil = ApplySMAe.gv_soil;
  ecuacionLineal.cloud = ApplySMAe.cloud;
};

exports.setParametroReducto = function(Reduc) {
  reductor = Reduc;
};

exports.setZeroSnowProb = function(flag) {
  zeroSnowProb = !!flag;
};

function sma_estimated(image) {
  var gv_soil = image.select('gv')
    .addBands(image.select('soil'))
    .reduce(ee.Reducer.sum());
  var shade_e;
  var gv_soil_e;
  var cloud_e;
  if (AplicarSMA) {
    shade_e = image.select('shade')
      .multiply(ecuacionLineal.shade[0]).add(ecuacionLineal.shade[1])
      .rename('shade_e');
    gv_soil_e = gv_soil
      .multiply(ecuacionLineal.gv_soil[0]).add(ecuacionLineal.gv_soil[1])
      .rename('gv_soil_e');
    cloud_e = image.select('cloud')
      .multiply(ecuacionLineal.cloud[0]).add(ecuacionLineal.cloud[1])
      .rename('cloud_e');
  } else {
    shade_e = image.select('shade').rename('shade_e');
    gv_soil_e = gv_soil.rename('gv_soil_e');
    cloud_e = image.select('cloud').rename('cloud_e');
  }
  return image.addBands(shade_e).addBands(gv_soil_e).addBands(cloud_e);
}

function fitDicts() {
  return {
    shade: ee.Dictionary(ee.List([[shade_min, 0], [shade_max, 1]])
      .reduce(ee.Reducer.linearFit())),
    gv_soil: ee.Dictionary(ee.List([[gv_soil_min, 1], [gv_soil_max, 0]])
      .reduce(ee.Reducer.linearFit())),
    cloud_asc: ee.Dictionary(ee.List([[cloud_asc_min, 0], [cloud_asc_max, 1]])
      .reduce(ee.Reducer.linearFit())),
    cloud_desc: ee.Dictionary(ee.List([[cloud_desc_min, 1], [cloud_desc_max, 0]])
      .reduce(ee.Reducer.linearFit()))
  };
}

function class_1_probs(image) {
  var fits = fitDicts();
  var cond_1 = image.select('shade_e')
    .multiply(fits.shade.getNumber('scale'))
    .add(fits.shade.getNumber('offset')).clamp(0, 1);
  var cond_2 = image.select('gv_soil_e')
    .multiply(ee.Number(fits.gv_soil.get('scale')))
    .add(ee.Number(fits.gv_soil.get('offset'))).clamp(0, 1);
  var cond_3 = image.select('cloud_e')
    .multiply(fits.cloud_desc.getNumber('scale'))
    .add(fits.cloud_desc.getNumber('offset')).clamp(0, 1)
    .addBands(
      image.select('cloud_e')
        .multiply(fits.cloud_asc.getNumber('scale'))
        .add(fits.cloud_asc.getNumber('offset')).clamp(0, 1)
    ).reduce(ee.Reducer.min());

  var image_prob = cond_1.addBands(cond_2).addBands(cond_3)
    .reduce(ee.Reducer.mean()).rename('prob');

  if (zeroSnowProb) {
    image_prob = ee.Image(ee.Algorithms.If(
      image.bandNames().contains('snow'),
      image_prob.where(image.select('snow').gte(80), 0),
      image_prob
    ));
  }
  return image_prob;
}

function class_2_probs(image) {
  var fits = fitDicts();
  var cond_1 = image.select('shade_e')
    .multiply(fits.shade.getNumber('scale'))
    .add(fits.shade.getNumber('offset')).clamp(0, 1);
  var cond_2 = image.select('gv_soil_e')
    .multiply(ee.Number(fits.gv_soil.get('scale')))
    .add(ee.Number(fits.gv_soil.get('offset'))).clamp(0, 1);
  var cond_3 = image.select('cloud_e')
    .multiply(fits.cloud_desc.getNumber('scale'))
    .add(fits.cloud_desc.getNumber('offset')).clamp(0, 1)
    .addBands(
      image.select('cloud_e')
        .multiply(fits.cloud_asc.getNumber('scale'))
        .add(fits.cloud_asc.getNumber('offset')).clamp(0, 1)
    ).reduce(ee.Reducer.min());
  return cond_1.rename('cond_1')
    .addBands(cond_2.rename('cond_2'))
    .addBands(cond_3.rename('cond_3'));
}

function reduceProbCollection(imgs_prob) {
  var empty = ee.Image(0).rename('p_water').selfMask();
  if (reductor === 'mean') {
    return ee.Image(ee.Algorithms.If(
      imgs_prob.size().gte(1), imgs_prob.mean(), empty));
  }
  if (reductor === 'min') {
    return ee.Image(ee.Algorithms.If(
      imgs_prob.size().gte(1), imgs_prob.min(), empty));
  }
  if (reductor === 'qualitymosaic') {
    return ee.Image(ee.Algorithms.If(
      imgs_prob.size().gte(1), imgs_prob.qualityMosaic('qualy'), empty));
  }
  // median (default)
  return ee.Image(ee.Algorithms.If(
    imgs_prob.size().gte(1), imgs_prob.median(), empty));
}

exports.p_img_month_func = function(year, moving_window, processed_col) {
  var start = ee.Date.fromYMD(year, moving_window, 1);
  var end = start.advance(1, 'month');

  var imgs_prob = processed_col.filterDate(start, end)
    .map(sma_estimated).map(class_1_probs);
  var imgs_prob2 = processed_col.filterDate(start, end)
    .map(sma_estimated).map(class_2_probs);

  imgs_prob2 = ee.Algorithms.If(
    imgs_prob2.size().gte(1),
    imgs_prob2.median(),
    ee.Image.constant([0, 0, 0]).selfMask()
  );

  var prob_class_1 = reduceProbCollection(imgs_prob);
  return [ee.Image(prob_class_1).rename('p_water'), ee.Image(imgs_prob2)];
};

exports.p_year_func = function(year, processed_col) {
  var water_year_month = function(ano, mes, collection) {
    var start = ee.Date.fromYMD(ano, mes, 1);
    var end = start.advance(1, 'month');
    var imgs_prob = collection.filterDate(start, end)
      .map(sma_estimated).map(class_1_probs);
    return reduceProbCollection(imgs_prob);
  };

  return water_year_month(year, 1, processed_col)
    .addBands(water_year_month(year, 2, processed_col))
    .addBands(water_year_month(year, 3, processed_col))
    .addBands(water_year_month(year, 4, processed_col))
    .addBands(water_year_month(year, 5, processed_col))
    .addBands(water_year_month(year, 6, processed_col))
    .addBands(water_year_month(year, 7, processed_col))
    .addBands(water_year_month(year, 8, processed_col))
    .addBands(water_year_month(year, 9, processed_col))
    .addBands(water_year_month(year, 10, processed_col))
    .addBands(water_year_month(year, 11, processed_col))
    .addBands(water_year_month(year, 12, processed_col))
    .reduce(ee.Reducer.mean())
    .rename('p_year');
};

exports.p_month_func = function(year, moving_window, processed_col) {
  var water_year_month = function(ano, mes) {
    var start = ee.Date.fromYMD(ano, mes, 1);
    var end = start.advance(1, 'month');
    var imgs_prob = processed_col.filterDate(start, end)
      .map(sma_estimated).map(class_1_probs);
    return ee.Image(ee.Algorithms.If(
      ee.Algorithms.IsEqual(imgs_prob.size().gte(1), 1),
      imgs_prob.median(),
      ee.Image(0).rename('prob').selfMask()
    ));
  };

  function clampYear(y, lo, hi) {
    y = ee.Number(y);
    return ee.Number(ee.Algorithms.If(y.gte(hi), hi,
      ee.Algorithms.If(y.lte(lo), lo, y)));
  }

  var y0 = ee.Number(year);
  var yearsWin = [
    clampYear(y0.subtract(5), first_year, last_year),
    clampYear(y0.subtract(4), first_year, last_year),
    clampYear(y0.subtract(3), first_year, last_year),
    clampYear(y0.subtract(2), first_year, last_year),
    clampYear(y0.subtract(1), first_year, last_year),
    clampYear(y0, first_year, last_year),
    clampYear(y0.add(1), first_year, last_year),
    clampYear(y0.add(2), first_year, last_year),
    clampYear(y0.add(3), first_year, last_year),
    clampYear(y0.add(4), first_year, last_year),
    clampYear(y0.add(5), first_year, last_year)
  ];

  var stack = water_year_month(yearsWin[0], moving_window);
  for (var i = 1; i < yearsWin.length; i++) {
    stack = stack.addBands(water_year_month(yearsWin[i], moving_window));
  }
  return stack.reduce(ee.Reducer.mean()).rename('p_month');
};
