To create the binary file:

    wat2wasm -o dist/lz4-block-codec.wasm src/lz4-block-codec.wat 
    wasm-opt dist/lz4-block-codec.wasm -O4 -o dist/lz4-block-codec.wasm


`wat2wasm`: available at <https://github.com/WebAssembly/wabt>.

`wasm-opt`: available at <https://github.com/WebAssembly/binaryen>.
