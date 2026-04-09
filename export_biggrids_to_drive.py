import ee

ee.Initialize(project="mapbiomas-chile")

fc = ee.FeatureCollection(
    "projects/mapbiomas-chile/assets/WATER/AUXILIARY_DATA/VECTOR/biggrids-chile"
)

task = ee.batch.Export.table.toDrive(
    collection=fc,
    description="export_biggrids_chile",
    folder="gee_exports",  # carpeta en tu Drive
    fileNamePrefix="biggrids_chile",
    fileFormat="SHP",  # o "GeoJSON"
)

task.start()
print("Task started:", task.id)
