import ModuleFactory from "./mnist_wasm.js";

console.log("mnist.js loaded");

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const predictBtn = document.getElementById("predictBtn");
const resultEl = document.getElementById("result");

// Init canvas
ctx.fillStyle = "black";
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Drawing
let drawing = false;
canvas.addEventListener("mousedown", () => drawing = true);
canvas.addEventListener("mouseup", () => drawing = false);
canvas.addEventListener("mousemove", e => {
    if (!drawing) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.fill();
});

let Module = null;
let wasmPredict = null;

console.log("Loading WASM…");

ModuleFactory().then(mod => {
    console.log("WASM loaded");

    Module = mod;
    Module.ccall("wasm_init");
    wasmPredict = Module.cwrap("wasm_predict", "number", ["number"]);

    console.log("WASM initialized");

    // 🔥 THIS IS THE KEY FIX
    predictBtn.addEventListener("click", predict);
});

function getMNISTInput() {
    const small = document.createElement("canvas");
    small.width = 28;
    small.height = 28;
    const sctx = small.getContext("2d");

    sctx.drawImage(canvas, 0, 0, 28, 28);
    const img = sctx.getImageData(0, 0, 28, 28).data;

    const input = new Float32Array(784);
    let sum = 0;

    for (let i = 0; i < 784; i++) {
        const r = img[i * 4];
        input[i] = r / 255.0;
        sum += input[i];
    }

    console.log("Pixel sum:", sum);
    return input;
}

function predict() {
    console.log("Predict clicked");
    const input = getMNISTInput();

    const ptr = Module._malloc(784 * 4);

    // 1. Find the WASM memory buffer safely
    // Modern Emscripten often puts it in 'wasmMemory', older versions in 'buffer'
    const memBuffer = Module.wasmMemory ? Module.wasmMemory.buffer : Module.buffer;

    if (!memBuffer) {
        console.error("CRITICAL: Could not find WASM memory buffer!");
        return;
    }

    // 2. Create a view into that buffer
    const heapF32 = new Float32Array(memBuffer);

    // 3. Write data (ptr >> 2 converts byte-offset to float-index)
    heapF32.set(input, ptr >> 2);

    const digit = wasmPredict(ptr);
    Module._free(ptr);

    console.log("Predicted:", digit);
    resultEl.innerText = `Prediction: ${digit}`;
}