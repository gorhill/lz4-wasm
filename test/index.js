/* globals Benchmark, SnappyJS, lz4BlockCodec, require */

'use strict';

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

let lz4BlockJS;

function lz4BlockJSEncode(input) {
    return lz4BlockJS.encodeBlock(input, 0);
}

function lz4BlockJSDecode(input) {
    return lz4BlockJS.decodeBlock(input, 0, gFileBuffer.byteLength);
}

/******************************************************************************/

let lz4BlockWASM;

function lz4BlockWASMEncode(input) {
    return lz4BlockWASM.encodeBlock(input, 0);
}

function lz4BlockWASMDecode(input) {
    return lz4BlockWASM.decodeBlock(input, 0, gFileBuffer.byteLength);
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

function openFile(ev) {
    let input = ev.target;
    if ( input.files.length === 0 ) { return; }
    let fr = new FileReader();
    fr.onload = processFile;
    fr.readAsArrayBuffer(input.files[0]);
}

function processFile(ev) {
    stdout(0, '');
    gFileBuffer = ev.target.result;
    // Ensure valid encoders: encode/decode than compare result with
    // original.
    let ulen = gFileBuffer.byteLength, clen;
    let compressed;

    // Verify codecs are working as expected
    compressed = lz4Encode(gFileBuffer);
    if ( validateCodec(lz4Decode(compressed)) ) {
        stdout(0, '      pierrec/node-lz4: ');
        clen = compressed.byteLength;
        stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
        stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
        stdout(0, '\n');
    } else {
        stdout(0, '      pierrec/node-lz4: failed\n');
    }

    compressed = SnappyJS.compress(gFileBuffer);
    if ( validateCodec(SnappyJS.uncompress(compressed)) ) {
        stdout(0, '  zhipeng-jia/snappyjs: ');
        clen = compressed.byteLength;
        stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
        stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
        stdout(0, '\n');
    } else {
        stdout(0, '  zhipeng-jia/snappyjs: failed\n');
    }

    // For lz4-block.js, we also verify that its output is really
    // lz4-compatible -- node-lz4 is used as the reference codec.
    if ( validateCodec(lz4Decode(lz4BlockJSEncode(gFileBuffer))) === false ) {
        stdout(0, '  gorhill/lz4-block.js: failed to encode\n');
    } else if ( validateCodec(lz4BlockJSDecode(lz4Encode(gFileBuffer))) === false ) {
        stdout(0, '  gorhill/lz4-block.js: failed to decode\n');
    } else {
        compressed = lz4BlockJSEncode(gFileBuffer);
        if ( validateCodec(lz4BlockJSDecode(compressed)) ) {
            stdout(0, '  gorhill/lz4-block.js: ');
            clen = compressed.byteLength;
            stdout(0, clen.toLocaleString() + ' / ' + ulen.toLocaleString() + ' = ');
            stdout(0, (clen * 100 / ulen).toFixed(0) + '%');
            stdout(0, '\n');
        } else {
            stdout(0, '  gorhill/lz4-block.js: failed\n');
        }
    }

    // For lz4-block.wasm, we also verify that its output is really
    // lz4-compatible -- node-lz4 is used as the reference codec.
    if ( validateCodec(lz4Decode(lz4BlockWASMEncode(gFileBuffer))) === false ) {
        stdout(0, 'gorhill/lz4-block.wasm: failed to encode\n');
    } else if ( validateCodec(lz4BlockWASMDecode(lz4Encode(gFileBuffer))) === false ) {
        stdout(0, 'gorhill/lz4-block.wasm: failed to decode\n');
    } else {
        compressed = lz4BlockWASMEncode(gFileBuffer);
        if ( validateCodec(lz4BlockWASMDecode(compressed)) === false ) {
            stdout(0, 'gorhill/lz4-block.wasm: failed to self-decode\n');
        } else {
            stdout(0, 'gorhill/lz4-block.wasm: ');
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
            .add('  -   zhipeng-jia/snappyjs', ( ) => {
                SnappyJS.compress(gFileBuffer);
                })
            .add('  -       pierrec/node-lz4', ( ) => {
                lz4Encode(gFileBuffer);
                })
            .add('  -   gorhill/lz4-block.js', ( ) => {
                lz4BlockJSEncode(gFileBuffer);
                })
            .add('  - gorhill/lz4-block.wasm', ( ) => {
                lz4BlockWASMEncode(gFileBuffer);
                })
            .on('start', function() {
                stdout(gWhich + 2, 'Compress:\n');
                })
            .on('cycle', event => {
                let mbps = Math.floor(event.target.hz * gFileBuffer.byteLength >>> 20);
                stdout(gWhich + 2, String(event.target) + ': ' + mbps + ' MB/s\n');
                })
            .on('complete', ( ) => {
                nextBenchmark();
                });
        return bms;
    })());
    gBenchmarks.push((function() {
        let lz4Compressed;
        let lz4JSCompressed;
        let snappyCompressed;
        let lz4wasmCompressed;
        let bms = new Benchmark.Suite();
        bms
            .add('  -   zhipeng-jia/snappyjs', ( ) => {
                SnappyJS.uncompress(snappyCompressed);
                })
            .add('  -       pierrec/node-lz4', ( ) => {
                lz4Decode(lz4Compressed);
                })
            .add('  -   gorhill/lz4-block.js', ( ) => {
                lz4BlockJSDecode(lz4JSCompressed);
                })
            .add('  - gorhill/lz4-block.wasm', ( ) => {
                lz4BlockWASMDecode(lz4wasmCompressed);
                })
            .on('start', function() {
                lz4Compressed = lz4Encode(gFileBuffer);
                lz4JSCompressed = lz4BlockJSEncode(gFileBuffer);
                snappyCompressed = SnappyJS.compress(gFileBuffer);
                lz4wasmCompressed = new Uint8Array(lz4BlockWASMEncode(gFileBuffer));
                stdout(gWhich + 2, 'Uncompress:\n');
                })
            .on('cycle', event => {
                let mbps = Math.floor(event.target.hz * gFileBuffer.byteLength >>> 20);
                stdout(gWhich + 2, String(event.target) + ': ' + mbps + ' MB/s\n');
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

Promise.all([
    lz4BlockCodec.createInstance('js').then(instance => {
        lz4BlockJS = instance;
    }),
    lz4BlockCodec.createInstance('wasm').then(instance => {
        lz4BlockWASM = instance;
    })
]).then(( ) => {
    document.querySelector('input[type="file"]')
            .addEventListener('change', openFile);
    prepareBenchmark();
    document.getElementById('runBenchmark').onclick = function() {
        doBenchmark();
    };
});
