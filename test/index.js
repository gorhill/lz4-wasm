/* jshint esversion: 6, unused: true */

/******************************************************************************/

// Helpers for pierrec/node-lz4

let Buffer = require('buffer').Buffer;
let LZ4 = require('lz4');

function lz4Encode(input) {
    let inputBuffer = new Buffer(input);
    let outputBuffer = new Buffer(LZ4.encodeBound(inputBuffer.length));
    let lz4OutputSize = LZ4.encodeBlock(inputBuffer, outputBuffer);
    return outputBuffer.toArrayBuffer().slice(0, lz4OutputSize);
}

function lz4Decode(input) {
    let inputBuffer = new Buffer(input);
    let outputBuffer = new Buffer(gFileBuffer.byteLength);
    let lz4OutputSize = LZ4.decodeBlock(inputBuffer, outputBuffer);
    return outputBuffer.toArrayBuffer().slice(0, lz4OutputSize);
}

/******************************************************************************/

// Helpers for gorhill/lz4-wasm

// To potentially reduce needless overhead, the decompressor returns a
// view to its buffer. The caller is responsible for copying the content
// of buffer it intends to use across multiple calls to compress/decompress.

let LZ4WASM = (function() {
    let module;
    let instance;
    let memory;
    let memoryOrigin = 0;
    let lz4BlockEncodeBound;
    let lz4BlockEncode;
    let lz4BlockDecode;

    let readData = function(url, callback) {
        let xhr = new XMLHttpRequest();
        xhr.open('get', url, true);
        xhr.addEventListener('load', ev => {
            callback(ev.target.response);
        });
        xhr.responseType = 'arraybuffer';
        xhr.send();
    };

    let init = function(callback) {
        readData('../dist/lz4-block-codec.wasm', ab => {
            WebAssembly.compile(ab).then(result => {
                module = result;
                instance = new WebAssembly.Instance(module, {
                    //imports: {
                    //    log: (a, b, c) => {
                    //        console.log(a, b, c);
                    //    }
                    //}
                });
                memory = instance.exports.memory;
                memoryOrigin = instance.exports.getLinearMemoryOffset();
                lz4BlockEncodeBound = instance.exports.lz4BlockEncodeBound;
                lz4BlockEncode = instance.exports.lz4BlockEncode;
                lz4BlockDecode = instance.exports.lz4BlockDecode;
                callback();
            });
        });
    };

    return {
        init: init,
        reset: function() {
            module = undefined;
            instance = undefined;
            memory = undefined;
            lz4BlockEncodeBound = undefined;
            lz4BlockEncode = undefined;
            lz4BlockDecode = undefined;
        },
        growMemoryTo: function(byteLength) {
            let neededByteLength = memoryOrigin + byteLength;
            let pageCountBefore = memory.buffer.byteLength >>> 16;
            let pageCountAfter = (neededByteLength + 65535) >>> 16;
            if ( pageCountAfter > pageCountBefore ) {
                memory.grow(pageCountAfter - pageCountBefore);
            }
        },
        compress: function(input) {
            if ( module === undefined ) { return; }
            let inputByteOffset = 0;
            let inputByteLength = input.byteLength;
            if ( input instanceof ArrayBuffer === false ) {
                inputByteOffset = input.byteOffset;
                input = input.buffer;
            }
            let outputByteLength = lz4BlockEncodeBound(inputByteLength);
            this.growMemoryTo(262144 + inputByteLength + outputByteLength);
            let hashTableArea = new Int32Array(
                memory.buffer,
                memoryOrigin,
                65536
            );
            // Must be filled with -65536 or lower, to ensure uninitialized
            // entries are detected as such by the compressor code.
            hashTableArea.fill(-65536, 0, 65536);
            let inputArea = new Uint8Array(
                memory.buffer,
                memoryOrigin + hashTableArea.byteLength,
                inputByteLength
            );
            inputArea.set(new Uint8Array(input, inputByteOffset, inputByteLength));
            let outputSize = 0;
            try {
                outputSize = lz4BlockEncode(inputByteLength);
            } catch(ex) {
                console.error(ex);
            }
            return new Uint8Array(
                memory.buffer,
                memoryOrigin + hashTableArea.byteLength + inputByteLength,
                outputSize
            );
        },
        decompress: function(input, outputByteLength) {
            if ( module === undefined ) { return; }
            let inputByteOffset = 0;
            let inputByteLength = input.byteLength;
            if ( input instanceof ArrayBuffer === false ) {
                inputByteOffset = input.byteOffset;
                input = input.buffer;
            }
            this.growMemoryTo(inputByteLength + outputByteLength);
            let inputArea = new Uint8Array(
                memory.buffer,
                memoryOrigin,
                inputByteLength
            );
            inputArea.set(new Uint8Array(input, inputByteOffset, inputByteLength));
            let outputSize = lz4BlockDecode(inputByteLength);
            return new Uint8Array(
                memory.buffer,
                memoryOrigin + inputByteLength,
                outputSize
            );
        }
    };
})();

function lz4wasmEncode(input) {
    return LZ4WASM.compress(input);
}

function lz4wasmDecode(inputBuffer) {
    return LZ4WASM.decompress(inputBuffer, gFileBuffer.byteLength);
}

/******************************************************************************/

function validateCodec(a) {
    let b = gFileBuffer;
    if ( a.byteLength !== b.byteLength ) { return false; }
    let ab = a;
    if ( ab instanceof Uint8Array === false ) {
        ab = new Uint8Array(a);
    }
    let bb = new Uint8Array(b);
    for ( let i = 0, n = ab.byteLength; i < n; i++ ) {
        if ( ab[i] !== bb[i] ) { return false; }
    }
    return true;
}

/******************************************************************************/

let gFileBuffer;
let gBenchmarks = [];
let gWhich;

function stdout(which, text) {
    var r = document.querySelector('#results-' + which);
    if ( text === '' ) {
        r.innerHTML = '';
    } else {
        r.innerHTML += text;
    }
}

function prepareBenchmark() {
    gBenchmarks.push((function() {
        let bms = new Benchmark.Suite();
        bms
            .add('  -     pierrec/node-lz4', ( ) => {
                lz4Encode(gFileBuffer);
                })
            .add('  - zhipeng-jia/snappyjs', ( ) => {
                SnappyJS.compress(gFileBuffer);
                })
            .add('  -     gorhill/lz4-wasm', ( ) => {
                lz4wasmEncode(gFileBuffer);
                })
            .on('start', function() {
                stdout(gWhich + 2, 'Compress:\n');
                })
            .on('cycle', event => {
                stdout(gWhich + 2, String(event.target) + '\n');
                })
            .on('complete', ( ) => {
                nextBenchmark();
                });
        return bms;
    })());
    gBenchmarks.push((function() {
        let lz4Compressed;
        let snappyCompressed;
        let lz4wasmCompressed;
        let bms = new Benchmark.Suite();
        bms
            .add('  -     pierrec/node-lz4', ( ) => {
                lz4Decode(lz4Compressed);
                })
            .add('  - zhipeng-jia/snappyjs', ( ) => {
                SnappyJS.uncompress(snappyCompressed);
                })
            .add('  -     gorhill/lz4-wasm', ( ) => {
                lz4wasmDecode(lz4wasmCompressed);
                })
            .on('start', function() {
                lz4Compressed = lz4Encode(gFileBuffer);
                snappyCompressed = SnappyJS.compress(gFileBuffer);
                lz4wasmCompressed = new Uint8Array(lz4wasmEncode(gFileBuffer));
                stdout(gWhich + 2, 'Uncompress:\n');
                })
            .on('cycle', event => {
                stdout(gWhich + 2, String(event.target) + '\n');
                })
            .on('complete', ( ) => {
                nextBenchmark();
                });
        return bms;
    })());
}

/******************************************************************************/

function nextBenchmark() {
    stdout(gWhich + 2, '  Done.\n\n');
    gWhich += 1;
    var bms = gBenchmarks[gWhich];
    if ( bms ) {
        bms.run({ 'async': true });
    }
}

function doBenchmark() {
    stdout(1, '');
    stdout(1, 'Benchmarking, the higher ops/sec the better.\n');
    stdout(1, Benchmark.platform.toString() + '.');
    stdout(1, '\n\n');
    for ( let i = 0; i < gBenchmarks.length; i++ ) {
        stdout(i + 2, '');
    }
    gWhich = 0;
    gBenchmarks[gWhich].run({ 'async': true });
}

LZ4WASM.init(( ) => {
    prepareBenchmark();
    document.getElementById('runBenchmark').onclick = function() {
        doBenchmark();
    };
});

document.querySelector('input[type="file"]').addEventListener('change', ev => {
    let input = ev.target;
    if ( input.files.length === 0 ) { return; }
    let fr = new FileReader();
    fr.onload = ev => {
        stdout(0, '');
        gFileBuffer = ev.target.result;
        // Ensure valid encoders: encode/decode than compare result with
        // original.
        let ulen = gFileBuffer.byteLength, clen;
        let compressed;

        // Verify codecs are working as expected
        compressed = lz4Encode(gFileBuffer);
        if ( validateCodec(lz4Decode(compressed)) ) {
            stdout(0, '    pierrec/node-lz4: ');
            clen = compressed.byteLength;
            stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
            stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
            stdout(0, '\n');
        } else {
            stdout(0, '    pierrec/node-lz4: failed\n');
        }
        compressed = SnappyJS.compress(gFileBuffer);
        if ( validateCodec(SnappyJS.uncompress(compressed)) ) {
            stdout(0, 'zhipeng-jia/snappyjs: ');
            clen = compressed.byteLength;
            stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
            stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
            stdout(0, '\n');
        } else {
            stdout(0, 'zhipeng-jia/snappyjs: failed\n');
        }
        // For lz4-wasm, we also verify that its output is really
        // lz4-compatible -- node-lz4 is used as the reference codec.
        if ( validateCodec(lz4Decode(lz4wasmEncode(gFileBuffer))) === false ) {
            stdout(0, '    gorhill/lz4-wasm: failed to encode\n');
        } else if ( validateCodec(lz4wasmDecode(lz4Encode(gFileBuffer))) === false ) {
            stdout(0, '    gorhill/lz4-wasm: failed to decode\n');
        } else {
            compressed = lz4wasmEncode(gFileBuffer);
            if ( validateCodec(lz4wasmDecode(compressed)) === false ) {
                stdout(0, '    gorhill/lz4-wasm: failed to self-decode\n');
            } else {
                stdout(0, '    gorhill/lz4-wasm: ');
                clen = compressed.byteLength;
                stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
                stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
                stdout(0, '\n');
            }
        }

        let runbtn = document.querySelector('#runBenchmark');
        if ( gFileBuffer instanceof ArrayBuffer ) {
            runbtn.removeAttribute('disabled');
        } else {
            runbtn.setAttribute('disabled', '');
        }
    };
    fr.readAsArrayBuffer(input.files[0]);
});
