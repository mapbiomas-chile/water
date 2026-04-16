#!/usr/bin/env bash
set -euo pipefail

# Run FABDEM downloads in parallel for a range of feature indexes.
#
# Usage:
#   ./run_fabdem_parallel.sh <input_gpkg> <output_dir> [layer] [start_idx] [end_idx]
#
# Example:
#   ./run_fabdem_parallel.sh \
#     /home/ernesto/downloads/water/gee_exports/biggrids_chile.gpkg \
#     /home/ernesto/downloads/water/gee_exports \
#     biggrids_chile 0 42

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <input_gpkg> <output_dir> [layer] [start_idx] [end_idx]"
  exit 1
fi

INPUT_GPKG="$1"
OUTPUT_DIR="$2"
LAYER="${3:-biggrids_chile}"
START_IDX="${4:-0}"
END_IDX="${5:-42}"

PYTHON_BIN="${PYTHON_BIN:-/home/ecastillo/shared/conda-env/bin/python}"
SCRIPT_PATH="${SCRIPT_PATH:-/home/ecastillo/mapbiomas/water/download_fabdem_from_gpkg.py}"
PARALLELISM="${PARALLELISM:-24}"

if [[ ! -f "$INPUT_GPKG" ]]; then
  echo "Input GeoPackage not found: $INPUT_GPKG"
  exit 1
fi

if [[ ! -f "$SCRIPT_PATH" ]]; then
  echo "Python script not found: $SCRIPT_PATH"
  exit 1
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python executable not found in PATH: $PYTHON_BIN"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

echo "Starting FABDEM downloads"
echo "Input: $INPUT_GPKG"
echo "Layer: $LAYER"
echo "Range: $START_IDX..$END_IDX"
echo "Output dir: $OUTPUT_DIR"
echo "Parallelism: $PARALLELISM"

seq "$START_IDX" "$END_IDX" | xargs -I{} -P "$PARALLELISM" bash -lc '
  out="'"$OUTPUT_DIR"'/fabdem_biggrids_poly{}.tif"
  if [[ -f "$out" ]]; then
    echo "SKIP {} (exists)"
  else
    "'"$PYTHON_BIN"'" "'"$SCRIPT_PATH"'" "'"$INPUT_GPKG"'" "$out" \
      --layer "'"$LAYER"'" --feature-index {} --quiet \
      && echo "OK {}" \
      || echo "FAIL {}"
  fi
'

echo "Finished."
