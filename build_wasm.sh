#!/bin/bash
# Build WASM module for MNIST inference
# Requires: Emscripten SDK (emcc)
#
# Usage:
#   source /path/to/emsdk/emsdk_env.sh
#   bash build_wasm.sh

set -e

echo "Building WASM module..."

emcc wasm_infer.c arena.c prng.c \
  -O2 \
  -s EXPORTED_FUNCTIONS='["_wasm_init","_wasm_predict","_wasm_load_weights","_wasm_get_confidence","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","wasmMemory"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=33554432 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=Module \
  --no-entry \
  -o web/mnist_wasm.js

echo "Build complete! Output: web/mnist_wasm.js + web/mnist_wasm.wasm"
echo ""
echo "To test locally:"
echo "  cd web && python -m http.server 8080"
echo "  Open http://localhost:8080"
