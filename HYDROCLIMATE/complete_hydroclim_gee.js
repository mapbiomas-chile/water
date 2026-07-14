/**
 * Complete hydroclimate tables in GEE (Collection 01).
 *
 * MapBiomas Chile — Chile Water.
 *
 * PC inputs (from prepare_hydroclim_all_pc.ipynb → export_for_gee/):
 *   1. grid_attributes_hydro.csv
 *   2. seasonal_climatology_flow.csv
 *   3. annual_anomaly_flow.csv
 *
 * This script:
 *   - Loads flow tables from Assets
 *   - Assigns macrozone from MZ_CHILE
 *   - Computes CR2MET climatology/anomaly for precip grids
 *   - Merges and exports tables used by step02 seasonal mask
 *
 * Outputs:
 *   seasonal_climatology_merged
 *   annual_anomaly_merged
 *   grid_attributes_hydro_merged_v2
 */

// -----------------------------------------------------------------------------
// Configuration — edit after uploading PC CSVs as Table assets
// -----------------------------------------------------------------------------
var CONFIG = {
  yearStart: 1998,
  yearEnd: 2025,

  gridsAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile',
  mzChileAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/MZ_CHILE',
  mzDefaultCod: 3,
  mzIntersectErr: 1,

  gridAttrsPc:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/grid_attributes_hydro',
  flowClimPc:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/seasonal_climatology_flow',
  flowAnomPc:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/annual_anomaly_flow',

  cr2metAsset:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/RASTER/CR2MET_pp',

  outFolder:
    'projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/TABLE/',
  outClimFinal: null,   // filled below
  outAnomFinal: null,
  outAttrsFinal: null,

  scaleCr2met: 5000,
  bandPrefix: 'b',
  useYearProperty: false,
  yearProperty: 'year',

  zW: 0.5,
  zD: -0.5,
  zP: 2.0
};

CONFIG.outClimFinal = CONFIG.outFolder + 'seasonal_climatology_merged';
CONFIG.outAnomFinal = CONFIG.outFolder + 'annual_anomaly_merged';
CONFIG.outAttrsFinal = CONFIG.outFolder + 'grid_attributes_hydro_merged_v2';

// Aliases (algorithm below)
var YEAR_START = CONFIG.yearStart;
var YEAR_END = CONFIG.yearEnd;
var GRIDS_ASSET = CONFIG.gridsAsset;
var MZ_CHILE_ASSET = CONFIG.mzChileAsset;
var MZ_DEFAULT_COD = CONFIG.mzDefaultCod;
var MZ_INTERSECT_ERR = CONFIG.mzIntersectErr;
var GRID_ATTRS_PC = CONFIG.gridAttrsPc;
var FLOW_CLIM_PC = CONFIG.flowClimPc;
var FLOW_ANOM_PC = CONFIG.flowAnomPc;
var CR2MET_ASSET = CONFIG.cr2metAsset;
var OUT_FOLDER = CONFIG.outFolder;
var OUT_CLIM_FINAL = CONFIG.outClimFinal;
var OUT_ANOM_FINAL = CONFIG.outAnomFinal;
var OUT_ATTRS_FINAL = CONFIG.outAttrsFinal;
var SCALE_CR2MET = CONFIG.scaleCr2met;
var BAND_PREFIX = CONFIG.bandPrefix;
var USE_YEAR_PROPERTY = CONFIG.useYearProperty;
var YEAR_PROPERTY = CONFIG.yearProperty;
var Z_W = CONFIG.zW;
var Z_D = CONFIG.zD;
var Z_P = CONFIG.zP;

// =================================================================
// Macrozone name helper
// =================================================================
var MZ_NAME_BY_COD = ee.Dictionary({
  '1': 'Norte',
  '2': 'Centro',
  '3': 'Sur',
  '4': 'Austral'
});

function macrozoneNameFromCod(cod) {
  return MZ_NAME_BY_COD.get(ee.Number(cod).format('%d'), 'Sur');
}

function methodNameFromCode(code) {
  code = ee.Number(code);
  return ee.Algorithms.If(code.eq(1), 'overlap',
    ee.Algorithms.If(code.eq(2), 'centroid', 'default'));
}

// =================================================================
// 1) CARGA: geometrias + atributos PC + tablas flow PC
// =================================================================
function normGridName(f) {
  f = ee.Feature(f);
  var props = f.propertyNames();
  var gn = ee.String(ee.Algorithms.If(
    props.contains('grid_name'), f.get('grid_name'),
    ee.Algorithms.If(
      props.contains('GRID_NAME'), f.get('GRID_NAME'),
      ee.Algorithms.If(props.contains('name'), f.get('name'), ''))));
  return f.set('grid_name', gn);
}

var grids = ee.FeatureCollection(GRIDS_ASSET).map(normGridName);
var attrsPc = ee.FeatureCollection(GRID_ATTRS_PC).map(normGridName);
var flowClimPc = ee.FeatureCollection(FLOW_CLIM_PC).map(normGridName);
var flowAnomPc = ee.FeatureCollection(FLOW_ANOM_PC).map(normGridName);

print('Cartas en grid_attributes (PC):', attrsPc.size());
print('Cartas flow (climatologia PC):', flowClimPc.size());
print('Filas anomalia flow (PC):', flowAnomPc.size());

// =================================================================
// 1b) MACROZONA desde MZ_CHILE
//     cod 1=Norte, 2=Centro, 3=Sur, 4=Austral (remap OBJECTID_1)
//
//     Regla principal: macrozona con MAYOR superficie (area) de solape
//     carta ∩ poligono MZ. Basta que la carta TOQUE el vector; el centroide
//     puede quedar mas abajo (mar/Sur) sin cambiar la asignacion.
//     Respaldo solo si no hay interseccion: centroide; luego MZ_DEFAULT_COD.
// =================================================================
var mzChileRaw = ee.FeatureCollection(MZ_CHILE_ASSET);
var macrozonaFc = mzChileRaw.map(function (f) {
  var oid = ee.Number(f.get('OBJECTID_1'));
  var cod = ee.Algorithms.If(oid.eq(2), 1,
    ee.Algorithms.If(oid.eq(3), 2,
    ee.Algorithms.If(oid.eq(1), 3,
    ee.Algorithms.If(oid.eq(4), 4, MZ_DEFAULT_COD))));
  return f.set({ macrozone: ee.Number(cod) });
});

// Solo macrozona (sin lookup attrs — evita .first() en coleccion vacia)
function assignMacrozoneOnly(grid) {
  var feat = ee.Feature(grid);
  var geom = feat.geometry();

  var hits = macrozonaFc.filter(ee.Filter.intersects('.geo', false, geom));
  var scored = hits.map(function (mz) {
    var inter = geom.intersection(mz.geometry(), MZ_INTERSECT_ERR);
    var area = inter.area(MZ_INTERSECT_ERR);
    return mz.set('inter_area', ee.Algorithms.If(area, area, 0));
  });
  var hasOverlap = scored.size().gt(0);

  var centroid = geom.centroid(1);
  var hitCent = macrozonaFc.filterBounds(centroid);
  var hasCent = hitCent.size().gt(0);

  var mzCod = ee.Number(ee.Algorithms.If(
    hasOverlap,
    scored.sort('inter_area', false).first().get('macrozone'),
    ee.Algorithms.If(
      hasCent,
      hitCent.first().get('macrozone'),
      MZ_DEFAULT_COD
    )
  ));

  var mzMethodCode = ee.Number(ee.Algorithms.If(
    hasOverlap, 1, ee.Algorithms.If(hasCent, 2, 3)));

  return feat.set({
    macrozone: mzCod,
    macrozone_name: macrozoneNameFromCod(mzCod),
    macrozone_method: methodNameFromCode(mzMethodCode)
  });
}

var gridsMz = grids.map(assignMacrozoneOnly);
var gridNamesNoAttrs = gridsMz.aggregate_array('grid_name')
  .removeAll(attrsPc.aggregate_array('grid_name'));

// Cartas CON fila PC: recorrer attrsPc (43) y buscar geometria en biggrids.
// gridList.map + flatten evita .first() en coleccion vacia (error ID=14).
var gridsAttrsWithPc = attrsPc.map(function (attr) {
  attr = ee.Feature(attr);
  var gName = attr.get('grid_name');
  return grids.filter(ee.Filter.eq('grid_name', gName)).map(function (grid) {
    var mz = assignMacrozoneOnly(grid);
    return ee.Feature(grid.geometry(), {
      grid_name: gName,
      macrozone: mz.get('macrozone'),
      macrozone_name: mz.get('macrozone_name'),
      macrozone_method: mz.get('macrozone_method'),
      forcing_type: attr.get('forcing_type'),
      forcing_source: attr.get('forcing_source'),
      position: attr.get('position'),
      bolivian_winter: ee.Number(attr.get('bolivian_winter')),
      lon_centroid: ee.Number(attr.get('lon_centroid')),
      lat_centroid: ee.Number(attr.get('lat_centroid')),
      notes: attr.get('notes')
    });
  });
}).flatten();

// Cartas SIN fila PC: solo macrozona (resto de biggrids)
var gridsAttrsNoPc = gridsMz.filter(
  ee.Filter.inList('grid_name', gridNamesNoAttrs)).map(function (f) {
  f = ee.Feature(f);
  return ee.Feature(f.geometry(), {
    grid_name: f.get('grid_name'),
    macrozone: f.get('macrozone'),
    macrozone_name: f.get('macrozone_name'),
    macrozone_method: f.get('macrozone_method'),
    forcing_type: null,
    forcing_source: null,
    position: null,
    bolivian_winter: 0,
    lon_centroid: null,
    lat_centroid: null,
    notes: null
  });
});

var gridsAttrs = gridsAttrsWithPc.merge(gridsAttrsNoPc);

print('Cartas con attrs PC + geometria biggrid:', gridsAttrsWithPc.size());
print('Cartas solo macrozona (sin fila PC):', gridsAttrsNoPc.size());
print('Total gridsAttrs:', gridsAttrs.size());

print('Macrozona MZ_CHILE (ejemplo SK-18-X):',
  gridsAttrs.filter(ee.Filter.eq('grid_name', 'SK-18-X'))
    .first().toDictionary().getInfo());

// QA: revisar carta costera — cambiar grid_name si hace falta
// var QA_GRID = 'TU-CARTA-COSTA';
// print('Macrozona QA:', gridsAttrs.filter(ee.Filter.eq('grid_name', QA_GRID))
//   .first().toDictionary().getInfo());

print('Cartas sin solape ni centroide (macrozone_method=default):',
  gridsAttrs.filter(ee.Filter.eq('macrozone_method', 'default')).size());

var nPrecip = gridsAttrs.filter(ee.Filter.eq('forcing_type', 'precip')).size();
var nFlow = gridsAttrs.filter(ee.Filter.eq('forcing_type', 'flow')).size();
print('Forzante precip (CR2MET aqui):', nPrecip);
print('Forzante flow (ya en PC):', nFlow);

// CSV subidos como Table no traen geometria; Export.table.toAsset la exige.
// Anomalia (~1169 filas): usar centroid() — el enmascaramiento solo lee atributos.
function attachGridGeometry(fc, useCentroid) {
  useCentroid = useCentroid || false;
  return fc.map(function (f) {
    var gridFc = grids.filter(ee.Filter.eq('grid_name', f.get('grid_name')));
    var hasGrid = gridFc.size().gt(0);
    var gridFeat = gridFc.first();
    var geom = ee.Algorithms.If(
      hasGrid,
      ee.Algorithms.If(
        useCentroid,
        ee.Feature(gridFeat).geometry().centroid(1),
        ee.Feature(gridFeat).geometry()
      ),
      f.geometry()
    );
    return ee.Feature(geom).copyProperties(f);
  });
}

// =================================================================
// 2) CR2MET helpers (solo cartas precip)
// =================================================================
var ppRaw = ee.ImageCollection(CR2MET_ASSET);

function parseYearFromImage(img) {
  return ee.Algorithms.If(
    USE_YEAR_PROPERTY,
    ee.Number(img.get(YEAR_PROPERTY)),
    ee.Number.parse(ee.String(img.get('system:index')).slice(-4))
  );
}

var ppYears = ppRaw.map(function (img) {
  return img.set('year', parseYearFromImage(img));
}).filter(ee.Filter.and(
  ee.Filter.gte('year', YEAR_START),
  ee.Filter.lte('year', YEAR_END)
));

function monthBandName(m) {
  m = ee.Number(m).int();
  return ee.String(BAND_PREFIX).cat(m.format('%d'));
}

function meanMonthlyPrOverYears(geom, m) {
  m = ee.Number(m).int();
  var band = monthBandName(m);
  var stack = ppYears.map(function (img) { return img.select(band); });
  var val = stack.mean().reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: SCALE_CR2MET,
    maxPixels: 1e10,
    tileScale: 4
  }).values().get(0);
  return ee.Number(ee.Algorithms.If(val, val, 0));
}

function annualPrForYear(geom, y) {
  y = ee.Number(y).int();
  var img = ppYears.filter(ee.Filter.eq('year', y)).first();
  var bands = ee.List([
    'b1', 'b2', 'b3', 'b4', 'b5', 'b6',
    'b7', 'b8', 'b9', 'b10', 'b11', 'b12'
  ]);
  var annualImg = ee.Image(
    ee.Algorithms.If(
      img,
      img.select(bands).reduce(ee.Reducer.sum()),
      ee.Image(0)
    )
  );
  var val = annualImg.reduceRegion({
    reducer: ee.Reducer.mean(),
    geometry: geom,
    scale: SCALE_CR2MET,
    maxPixels: 1e10,
    tileScale: 4
  }).values().get(0);
  return ee.Number(ee.Algorithms.If(val, val, 0));
}

// =================================================================
// 3) Climatologia y anomalia PRECIP (CR2MET)
// =================================================================
function climaPrecipForGrid(grid) {
  var geom = grid.geometry();
  var monthly = ee.List.sequence(1, 12).map(function (m) {
    return meanMonthlyPrOverYears(geom, m);
  });
  monthly = ee.List(monthly);
  var sorted = monthly.sort();
  var p33 = ee.Number(sorted.get(3));
  var p67 = ee.Number(sorted.get(8));
  var maxIdx = monthly.indexOf(monthly.reduce(ee.Reducer.max()));
  var maxMonth = ee.Number(maxIdx).add(1);
  var isBW = ee.Number(
    ee.Algorithms.If(maxMonth.gte(10).or(maxMonth.lte(3)), 1, 0));

  return ee.Feature(geom, {
    grid_name: grid.get('grid_name'),
    macrozone: grid.get('macrozone'),
    forcing_type: 'precip',
    forcing_source: 'CR2MET',
    m1: monthly.get(0), m2: monthly.get(1), m3: monthly.get(2),
    m4: monthly.get(3), m5: monthly.get(4), m6: monthly.get(5),
    m7: monthly.get(6), m8: monthly.get(7), m9: monthly.get(8),
    m10: monthly.get(9), m11: monthly.get(10), m12: monthly.get(11),
    p33: p33,
    p67: p67,
    max_month: maxMonth,
    bolivian_winter_detected: isBW
  });
}

function annualPrecipForGrid(grid) {
  var geom = grid.geometry();
  var geomOut = geom.centroid(1);
  var years = ee.List.sequence(YEAR_START, YEAR_END);
  var annual = years.map(function (y) {
    y = ee.Number(y);
    var pp = annualPrForYear(geom, y);
    return ee.Feature(geomOut, {
      grid_name: grid.get('grid_name'),
      year: y,
      annual_value: pp,
      annual_pp: pp
    });
  });
  annual = ee.FeatureCollection(annual);
  var stats = annual.aggregate_stats('annual_pp');
  var mu = ee.Number(stats.get('mean'));
  var sd = ee.Number(stats.get('total_sd'));

  annual = annual.map(function (f) {
    var p = ee.Number(f.get('annual_pp'));
    var z = ee.Number(ee.Algorithms.If(sd.gt(0), p.subtract(mu).divide(sd), 0));
    var state = ee.Algorithms.If(z.gte(Z_W), 'W',
      ee.Algorithms.If(z.lte(Z_D), 'D', 'N'));
    var prob = ee.Number(ee.Algorithms.If(z.abs().gte(Z_P), 1, 0));
    return f.set({
      z_grid: z,
      year_state: state,
      problem_flag: prob,
      macrozone: grid.get('macrozone'),
      forcing_type: 'precip',
      forcing_source: 'CR2MET'
    });
  });
  return annual;
}

var gridsPrecip = gridsAttrs.filter(ee.Filter.eq('forcing_type', 'precip'));
var climPrecip = gridsPrecip.map(climaPrecipForGrid);
var anomPrecip = gridsPrecip.map(annualPrecipForGrid).flatten();
// z_macro se calcula aqui (enmascaramiento no lo usa).

print('Climatologia precip (ejemplo):', climPrecip.limit(2));
print('Anomalia precip (ejemplo):', anomPrecip.limit(3));

// Sincroniza macrozone (GEE) en tablas flow exportadas desde PC
function syncMacrozoneFromGridsAttrs(fc) {
  return fc.map(function (f) {
    var refFc = gridsAttrs.filter(ee.Filter.eq('grid_name', f.get('grid_name')));
    var hasRef = refFc.size().gt(0);
    var mzCod = ee.Number(ee.Algorithms.If(
      hasRef, refFc.first().get('macrozone'), MZ_DEFAULT_COD));
    return f.set({
      macrozone: mzCod,
      macrozone_name: macrozoneNameFromCod(mzCod)
    });
  });
}

// =================================================================
// 4) FUSION precip (GEE) + flow (PC), con geometria de biggrids-chile
// =================================================================
var flowClimGeom = syncMacrozoneFromGridsAttrs(
  attachGridGeometry(flowClimPc, false));
var flowAnomGeom = syncMacrozoneFromGridsAttrs(
  attachGridGeometry(flowAnomPc, true));
var climFinal = flowClimGeom.merge(climPrecip);
var anomFinal = flowAnomGeom.merge(anomPrecip);

// z_macro: media de z_grid por macrozona + ano (diagnostico; no usa enmascaramiento)
var anomFinalZ = anomFinal.map(function (f) {
  var mz = f.get('macrozone');
  var yr = f.get('year');
  var zMacro = ee.Number(anomFinal.filter(ee.Filter.and(
    ee.Filter.eq('macrozone', mz),
    ee.Filter.eq('year', yr)
  )).aggregate_mean('z_grid'));
  return f.set('z_macro', zMacro);
});

print('Climatologia FINAL (cartas):', climFinal.size());
print('Anomalia FINAL (filas):', anomFinalZ.size());

// =================================================================
// 5) grid_attributes final (bw: CR2MET en precip, tabla flow en flow)
// =================================================================
var attrsFinal = gridsAttrs.map(function (g) {
  var gName = g.get('grid_name');
  var forcing = g.get('forcing_type');

  var bw = ee.Algorithms.If(
    ee.Algorithms.IsEqual(forcing, 'precip'),
    climPrecip.filter(ee.Filter.eq('grid_name', gName)).first()
      .get('bolivian_winter_detected'),
    flowClimPc.filter(ee.Filter.eq('grid_name', gName)).first()
      .get('bolivian_winter_detected')
  );

  return ee.Feature(g.geometry(), {
    grid_name: gName,
    macrozone: g.get('macrozone'),
    macrozone_name: g.get('macrozone_name'),
    macrozone_method: g.get('macrozone_method'),
    forcing_type: forcing,
    forcing_source: g.get('forcing_source'),
    position: g.get('position'),
    bolivian_winter: bw,
    lon_centroid: g.get('lon_centroid'),
    lat_centroid: g.get('lat_centroid'),
    station_codes: g.get('station_codes'),
    notes: g.get('notes')
  });
});

// =================================================================
// 6) EXPORTS FINALES (lanzar en Tasks solo las que necesites)
//     Macrozona para enmascaramiento: solo grid_attributes_hydro
// =================================================================
Export.table.toAsset({
  collection: climFinal,
  description: 'seasonal_climatology_merged',
  assetId: OUT_CLIM_FINAL
});

Export.table.toAsset({
  collection: anomFinalZ,
  description: 'annual_anomaly_merged',
  assetId: OUT_ANOM_FINAL
});

Export.table.toAsset({
  collection: attrsFinal,
  description: 'grid_attributes_hydro_merged_v2',
  assetId: OUT_ATTRS_FINAL
});
