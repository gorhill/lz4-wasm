# lz4-wasm

LZ4 block codec: A WebAssembly implementation.

The current implementation encode/decode LZ4 block format as per [official documentation](https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md).

LZ4 frame format is not implemented at this time.

# Files

`./src/lz4-block-codec.wat`: the WebAssembly source code

`./dist/lz4-block-codec.wasm`: the compiled WebAssembly source code, generated using:

    wat2wasm ./lz4-block-codec.wat -o ./dist/lz4-block-codec.wasm
    wasm-opt ./lz4-block-codec.wasm -O4 -o ./dist/lz4-block-codec.wasm

You can get `wat2wasm` at <https://github.com/WebAssembly/wabt>, and `wasm-opt` at <https://github.com/WebAssembly/binaryen>.

# Test

Note: the test/benchmark page uses javascript implementation of other compression libraries solely for the sake of comparison with javascript-based solutions.

[Test & benchmark page](https://gorhill.github.io/lz4-wasm/test/index.html).
