/**
 * Per-grid mosaic PRESET + cloud cover (Collection 01).
 *
 * MapBiomas Chile — Chile Water.
 *
 * defaultPreset / presetByYear hold Module_mosaic_landsat PRESET names
 * (e.g. 'wet_FilterAllSnw', 'dry_FilterNo') — not legacy script paths.
 *
 * exports.getGridConfig(gridName, year) -> {
 *   cloudCover, mosaicPreset, assetActualBase
 * }
 */

var GRID_CONFIG = {
  "SJ-18-X": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SJ-19-V": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SJ-18-Z": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {
      "2021": "wet_FilterAllSnw",
      "2024": "wet_FilterAllSnw",
      "2025": "wet_FilterAllSnw"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SJ-19-Y": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SK-18-X": {
    "defaultPreset": "wet_ESN_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SK-19-V": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SK-18-Z": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SK-19-Y": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-18-V": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-18-X": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-19-V": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-18-Y": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-18-Z": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SL-19-Y": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SM-18-V": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SM-18-X": {
    "defaultPreset": "wet_ESN_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SM-18-Y": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SM-18-Z": {
    "defaultPreset": "wet_ESN_FilterAllSnw",
    "presetByYear": {
      "2010": "wet_ESN_FilterAllSnw",
      "2011": "wet_ESN_FilterAllSnw",
      "2012": "wet_ESN_FilterAllSnw",
      "2013": "wet_ESN_FilterAllSnw",
      "2014": "wet_ESN_FilterAllSnw",
      "2015": "wet_ESN_FilterAllSnw",
      "2016": "wet_ESN_FilterAllSnw",
      "2017": "wet_ESN_FilterAllSnw",
      "2018": "wet_ESN_FilterAllSnw",
      "2019": "wet_ESN_FilterAllSnw",
      "2020": "wet_ESN_FilterAllSnw",
      "2021": "wet_ESN_FilterAllSnw",
      "2022": "wet_ESN_FilterAllSnw",
      "2023": "wet_ESN_FilterAllSnw",
      "2024": "wet_ESN_FilterAllSnw",
      "2025": "wet_ESN_FilterAllSnw"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SM-19-Y": {
    "defaultPreset": "wet_FilterSC",
    "presetByYear": {
      "2011": "wet_FilterSC",
      "2012": "wet_FilterSC",
      "2013": "wet_FilterSC",
      "2014": "wet_FilterSC",
      "2015": "wet_FilterSC",
      "2016": "wet_FilterSC",
      "2017": "wet_FilterSC",
      "2018": "wet_FilterSC",
      "2019": "wet_FilterSC",
      "2020": "wet_FilterSC",
      "2021": "wet_FilterSC",
      "2022": "wet_FilterSC",
      "2023": "wet_FilterSC",
      "2024": "wet_FilterSC",
      "2025": "wet_FilterSC",
      "1998": "wet_FilterAllSnw",
      "1999": "wet_FilterAllSnw",
      "2000": "wet_FilterAllSnw",
      "2001": "wet_FilterAllSnw",
      "2002": "wet_FilterAllSnw",
      "2003": "wet_FilterAllSnw",
      "2004": "wet_FilterAllSnw",
      "2005": "wet_FilterAllSnw",
      "2006": "wet_FilterAllSnw",
      "2007": "wet_FilterAllSnw",
      "2008": "wet_FilterAllSnw",
      "2009": "wet_FilterAllSnw",
      "2010": "wet_FilterAllSnw"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-18-V": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-18-X": {
    "defaultPreset": "wet_ESN_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-19-V": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-19-X": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-18-Z": {
    "defaultPreset": "wet_ESN_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-19-Y": {
    "defaultPreset": "wet_ESN_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SN-19-Z": {
    "defaultPreset": "wet_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SE-19-V": {
    "defaultPreset": "dry_FilterNo",
    "presetByYear": {
      "2000": "dry_FilterAll",
      "2004": "dry_FilterAll"
    },
    "defaultCloudCover": 30,
    "cloudCoverByYear": {}
  },
  "SE-19-Y": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {
      "2023": "dry_FilterNo"
    },
    "defaultCloudCover": 30,
    "cloudCoverByYear": {}
  },
  "SE-19-Z": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 30,
    "cloudCoverByYear": {}
  },
  "SF-19-V": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 30,
    "cloudCoverByYear": {}
  },
  "SF-19-X": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SF-19-Y": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SF-19-Z": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SG-19-V": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SG-19-X": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SG-19-Y": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SG-19-Z": {
    "defaultPreset": "dry_FilterSC",
    "presetByYear": {
      "2023": "dry_FilterSC",
      "2024": "dry_FilterSC",
      "2025": "dry_FilterSC",
      "1998": "dry_FilterAll",
      "2002": "dry_FilterAll",
      "2006": "dry_FilterAll",
      "2007": "dry_FilterAll",
      "2008": "dry_FilterAll",
      "2009": "dry_FilterAll",
      "2010": "dry_FilterAll",
      "2011": "dry_FilterAll",
      "2013": "dry_FilterAll",
      "2015": "dry_FilterAll",
      "2016": "dry_FilterAll",
      "2017": "dry_FilterAll",
      "2018": "dry_FilterAll",
      "2019": "dry_FilterAll",
      "2020": "dry_FilterAll",
      "2021": "dry_FilterAll",
      "2022": "dry_FilterAll",
      "1999": "dry_FilterAllSnw",
      "2000": "dry_FilterAllSnw",
      "2001": "dry_FilterAllSnw",
      "2003": "dry_FilterAllSnw",
      "2004": "dry_FilterAllSnw",
      "2005": "dry_FilterAllSnw",
      "2012": "dry_FilterAllSnw",
      "2014": "dry_FilterAllSnw"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SH-19-V": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {
      "2003": "dry_FilterAllSnw"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SH-19-Y": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 80,
    "cloudCoverByYear": {}
  },
  "SI-19-V": {
    "defaultPreset": "dry_FilterAll",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SI-18-Z": {
    "defaultPreset": "wet_FilterAllSnw",
    "presetByYear": {
      "2022": "wet_FilterSC",
      "2023": "wet_FilterSC"
    },
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  },
  "SI-19-Y": {
    "defaultPreset": "dry_FilterAllSnw",
    "presetByYear": {},
    "defaultCloudCover": 90,
    "cloudCoverByYear": {}
  }
};

function resolveByYear(mapObj, year, fallbackValue) {
  var y = String(year);
  return mapObj && mapObj[y] !== undefined ? mapObj[y] : fallbackValue;
}

function firstValue(mapObj) {
  if (!mapObj) return null;
  var keys = Object.keys(mapObj);
  if (!keys.length) return null;
  return mapObj[keys[0]];
}

function resolveMosaicPreset(cfg, year) {
  var byYearModule = resolveByYear(cfg.presetByYear, year, null);
  if (byYearModule) return byYearModule;

  if (cfg.defaultPreset) return cfg.defaultPreset;

  // If default module is missing in config, assume the first
  // year-specific module is the base for remaining years.
  var firstYearModule = firstValue(cfg.presetByYear);
  if (firstYearModule) return firstYearModule;

  return 'wet_FilterAllSnw';
}

var ASSET_BASE_CLASS_01 = 'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-01/';
var ASSET_BASE_CLASS_02 = 'projects/mapbiomas-chile/assets/WATER/COLLECTION-1/01-CLASS/classification-02/';

var TRANSITION_CLASS_02 = {
  'SH-19-Y': true,
  'SI-19-V': true,
  'SI-19-Y': true
};

var SPECIAL_CLASS_01 = {
  'SI-18-Z': true
};

var SPECIAL_CLASS_02 = {
  'SN-19-V': true,
  'SN-19-X': true
};

function getAssetBaseByGrid(gridName) {
  // Aridas -> class-02
  if (gridName && (gridName.indexOf('SE-') === 0 || gridName.indexOf('SF-') === 0 || gridName.indexOf('SG-') === 0)) {
    return ASSET_BASE_CLASS_02;
  }

  // Transicion (regla explicita)
  if (SPECIAL_CLASS_01[gridName]) return ASSET_BASE_CLASS_01;
  if (TRANSITION_CLASS_02[gridName]) return ASSET_BASE_CLASS_02;

  // Templada: class-01, excepto SN-19-V y SN-19-X -> class-02
  if (SPECIAL_CLASS_02[gridName]) return ASSET_BASE_CLASS_02;
  return ASSET_BASE_CLASS_01;
}

exports.listGrids = function() {
  return Object.keys(GRID_CONFIG);
};

exports.getGridConfig = function(gridName, year) {
  var cfg = GRID_CONFIG[gridName];
  if (!cfg) {
    return {
      cloudCover: 30,
      mosaicPreset: 'wet_ESN_FilterAll'
    };
  }

  return {
    cloudCover: resolveByYear(cfg.cloudCoverByYear, year, cfg.defaultCloudCover),
    mosaicPreset: resolveMosaicPreset(cfg, year),
    assetActualBase: getAssetBaseByGrid(gridName)
  };
};
