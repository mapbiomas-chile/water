#!/usr/bin/env python3
"""Download FABDEM raster using bounds from one polygon in a GeoPackage."""

from __future__ import annotations

import argparse
from pathlib import Path

import fabdem
import geopandas as gpd


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read one polygon from a GeoPackage and download FABDEM "
            "for that polygon bounding box."
        )
    )
    parser.add_argument("input_gpkg", help="Input GeoPackage path (.gpkg)")
    parser.add_argument("output_tif", help="Output FABDEM raster path (.tif)")
    parser.add_argument(
        "--layer",
        default=None,
        help="Layer name in GeoPackage (default: first layer)",
    )
    parser.add_argument(
        "--feature-index",
        type=int,
        default=0,
        help="Feature index to use (default: 0)",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help="Optional cache directory for FABDEM tiles",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Disable progress output from fabdem",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_gpkg = Path(args.input_gpkg)
    output_tif = Path(args.output_tif)

    if not input_gpkg.exists():
        raise FileNotFoundError(f"Input file does not exist: {input_gpkg}")
    if input_gpkg.suffix.lower() != ".gpkg":
        raise ValueError(f"Input must be a .gpkg file: {input_gpkg}")

    gdf = gpd.read_file(input_gpkg, layer=args.layer)
    if gdf.empty:
        raise ValueError(f"No features found in {input_gpkg}")
    if args.feature_index < 0 or args.feature_index >= len(gdf):
        raise IndexError(
            f"feature-index {args.feature_index} out of range [0, {len(gdf) - 1}]"
        )
    if gdf.crs is None:
        raise ValueError("Input layer has no CRS; cannot compute EPSG:4326 bounds safely.")

    # FABDEM expects bounds in EPSG:4326 (west, south, east, north).
    gdf_4326 = gdf.to_crs(epsg=4326)
    geom = gdf_4326.geometry.iloc[args.feature_index]
    if geom is None or geom.is_empty:
        raise ValueError(f"Feature {args.feature_index} has empty geometry.")

    west, south, east, north = geom.bounds
    bounds = (west, south, east, north)

    output_tif.parent.mkdir(parents=True, exist_ok=True)
    fabdem.download(
        bounds=bounds,
        output_path=output_tif,
        show_progress=not args.quiet,
        cache=args.cache_dir,
    )

    print(f"Downloaded FABDEM to {output_tif}")
    print(f"Bounds used (EPSG:4326): {bounds}")


if __name__ == "__main__":
    main()
