/**
 * Documents the default GEE Scripts root for this repository.
 *
 * MapBiomas Chile — Chile Water, Collection 01.
 *
 * Callers usually define the same string locally:
 *   var GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';
 * Edit that line (or this export) if you upload Scripts under another account.
 */

exports.GEE_MODULES = 'users/mapbiomas-chile/mapbiomas:WATER/MODULES';

exports.modulePath = function(name) {
  return exports.GEE_MODULES + '/' + name;
};
