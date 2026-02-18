import ModuleFactory from "./mnist_wasm.js";

// ============================================================
// DOM Elements
// ============================================================

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const predictBtn = document.getElementById("predictBtn");
const clearBtn = document.getElementById("clearBtn");
const resultDigit = document.getElementById("resultDigit");
const resultSection = document.getElementById("resultSection");
const confidenceGrid = document.getElementById("confidenceGrid");
const loadingOverlay = document.getElementById("loadingOverlay");
const loadingText = document.getElementById("loadingText");
const statusBar = document.getElementById("statusBar");
const statusText = document.getElementById("statusText");
const canvasWrapper = document.getElementById("canvasWrapper");

// ============================================================
// Build confidence bar UI
// ============================================================

for (let i = 0; i < 10; i++) {
    const row = document.createElement("div");
    row.className = "confidence-row";
    row.innerHTML = `
        <span class="confidence-digit" id="cd-${i}">${i}</span>
        <div class="confidence-track">
            <div class="confidence-fill" id="cf-${i}"></div>
        </div>
        <span class="confidence-pct" id="cp-${i}">—</span>
    `;
    confidenceGrid.appendChild(row);
}

// ============================================================
// Canvas setup
// ============================================================

ctx.fillStyle = "black";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.lineCap = "round";
ctx.lineJoin = "round";
ctx.strokeStyle = "white";
ctx.lineWidth = 36; // thicker stroke → better visibility at 28x28

let drawing = false;
let lastX = 0;
let lastY = 0;
let hasDrawn = false;

function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;

    if (e.touches) {
        return {
            x: (e.touches[0].clientX - r.left) * scaleX,
            y: (e.touches[0].clientY - r.top) * scaleY,
        };
    }
    return {
        x: (e.clientX - r.left) * scaleX,
        y: (e.clientY - r.top) * scaleY,
    };
}

function startDraw(e) {
    e.preventDefault();
    drawing = true;
    hasDrawn = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;

    // Draw a dot for single clicks
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();

    canvasWrapper.classList.add("drawing");
}

function moveDraw(e) {
    if (!drawing) return;
    e.preventDefault();
    const pos = getPos(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;
}

function stopDraw(e) {
    if (e) e.preventDefault();
    drawing = false;
    canvasWrapper.classList.remove("drawing");
}

// Mouse events
canvas.addEventListener("mousedown", startDraw);
canvas.addEventListener("mousemove", moveDraw);
canvas.addEventListener("mouseup", stopDraw);
canvas.addEventListener("mouseleave", stopDraw);

// Touch events
canvas.addEventListener("touchstart", startDraw, { passive: false });
canvas.addEventListener("touchmove", moveDraw, { passive: false });
canvas.addEventListener("touchend", stopDraw, { passive: false });
canvas.addEventListener("touchcancel", stopDraw, { passive: false });

// Clear button
clearBtn.addEventListener("click", () => {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
    resultDigit.textContent = "?";
    resultSection.classList.add("empty");

    for (let i = 0; i < 10; i++) {
        document.getElementById(`cf-${i}`).style.width = "0%";
        document.getElementById(`cf-${i}`).classList.remove("top");
        document.getElementById(`cp-${i}`).textContent = "—";
        document.getElementById(`cp-${i}`).classList.remove("active");
        document.getElementById(`cd-${i}`).classList.remove("active");
    }
});

// ============================================================
// WASM initialization
// ============================================================

let Module = null;
let wasmPredict = null;
let wasmLoadWeights = null;
let wasmGetConfidence = null;
let weightsLoaded = false;

async function init() {
    try {
        // 1. Load WASM module
        loadingText.textContent = "Loading neural network…";
        Module = await ModuleFactory();

        // 2. Initialize model
        loadingText.textContent = "Initializing model…";
        Module.ccall("wasm_init");

        wasmPredict = Module.cwrap("wasm_predict", "number", ["number"]);
        wasmLoadWeights = Module.cwrap("wasm_load_weights", null, ["number", "number"]);
        wasmGetConfidence = Module.cwrap("wasm_get_confidence", "number", ["number"]);

        // 3. Load pre-trained weights
        loadingText.textContent = "Loading trained weights…";
        try {
            const response = await fetch("mnist_weights.bin");
            if (response.ok) {
                const buffer = await response.arrayBuffer();
                const bytes = new Uint8Array(buffer);

                const ptr = Module._malloc(bytes.length);
                const heap = new Uint8Array(Module.wasmMemory.buffer);
                heap.set(bytes, ptr);

                wasmLoadWeights(ptr, bytes.length);
                Module._free(ptr);

                weightsLoaded = true;
                console.log(`Weights loaded: ${bytes.length} bytes`);
            } else {
                console.warn("No weights file found — model will use random weights");
            }
        } catch (e) {
            console.warn("Could not load weights:", e.message);
        }

        // 4. Ready!
        loadingOverlay.classList.add("hidden");
        predictBtn.disabled = false;
        predictBtn.addEventListener("click", predict);

        statusBar.style.display = "flex";
        if (weightsLoaded) {
            statusText.textContent = "Ready — trained model loaded";
        } else {
            statusBar.classList.add("error");
            statusText.textContent = "Warning — using untrained weights";
        }

    } catch (err) {
        console.error("WASM init failed:", err);
        loadingText.textContent = "Failed to load. Check console.";
        statusBar.style.display = "flex";
        statusBar.classList.add("error");
        statusText.textContent = "Error loading WASM module";
    }
}

init();

// ============================================================
// MNIST-style preprocessing
// ============================================================

function getMNISTInput() {
    // Step 1: Get the full-resolution grayscale image
    const srcData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const W = canvas.width;
    const H = canvas.height;

    // Step 2: Find bounding box of drawn content
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const val = srcData[(y * W + x) * 4]; // red channel
            if (val > 20) { // threshold to ignore noise
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }

    // Nothing drawn
    if (maxX <= minX || maxY <= minY) {
        return new Float32Array(784);
    }

    // Step 3: Crop to bounding box and resize to fit in 20x20
    // (MNIST standard: digits are fit into 20x20 box, centered in 28x28)
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // Create a temp canvas with just the cropped content
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = bw;
    cropCanvas.height = bh;
    const cropCtx = cropCanvas.getContext("2d");
    cropCtx.drawImage(canvas, minX, minY, bw, bh, 0, 0, bw, bh);

    // Resize to fit within 20x20 preserving aspect ratio
    const scale = 20 / Math.max(bw, bh);
    const newW = Math.max(1, Math.round(bw * scale));
    const newH = Math.max(1, Math.round(bh * scale));

    const resizedCanvas = document.createElement("canvas");
    resizedCanvas.width = newW;
    resizedCanvas.height = newH;
    const resizedCtx = resizedCanvas.getContext("2d");
    resizedCtx.imageSmoothingEnabled = true;
    resizedCtx.imageSmoothingQuality = "high";
    resizedCtx.drawImage(cropCanvas, 0, 0, newW, newH);

    const resizedData = resizedCtx.getImageData(0, 0, newW, newH).data;

    // Step 4: Compute center of mass of the resized image
    let totalMass = 0, comX = 0, comY = 0;
    for (let y = 0; y < newH; y++) {
        for (let x = 0; x < newW; x++) {
            const val = resizedData[(y * newW + x) * 4] / 255.0;
            totalMass += val;
            comX += x * val;
            comY += y * val;
        }
    }

    if (totalMass > 0) {
        comX /= totalMass;
        comY /= totalMass;
    } else {
        comX = newW / 2;
        comY = newH / 2;
    }

    // Step 5: Place into 28x28 canvas, centered by center of mass at (14, 14)
    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = 28;
    finalCanvas.height = 28;
    const finalCtx = finalCanvas.getContext("2d");

    // Black background
    finalCtx.fillStyle = "black";
    finalCtx.fillRect(0, 0, 28, 28);

    // Offset so that center of mass lands at pixel (13.5, 13.5)
    const offsetX = Math.round(14 - comX);
    const offsetY = Math.round(14 - comY);

    finalCtx.drawImage(resizedCanvas, offsetX, offsetY);

    const finalData = finalCtx.getImageData(0, 0, 28, 28).data;

    // Step 6: Convert to float array
    const input = new Float32Array(784);
    for (let i = 0; i < 784; i++) {
        input[i] = finalData[i * 4] / 255.0;
    }

    return input;
}

function predict() {
    if (!hasDrawn) return;

    const input = getMNISTInput();

    const ptr = Module._malloc(784 * 4);
    const heapF32 = new Float32Array(Module.wasmMemory.buffer);
    heapF32.set(input, ptr >> 2);

    const digit = wasmPredict(ptr);
    Module._free(ptr);

    // Get confidence scores
    const confidences = [];
    for (let i = 0; i < 10; i++) {
        confidences.push(wasmGetConfidence(i));
    }

    // Update UI
    resultDigit.textContent = digit;
    resultSection.classList.remove("empty");

    const maxConf = Math.max(...confidences);

    for (let i = 0; i < 10; i++) {
        const pct = (confidences[i] * 100);
        const fill = document.getElementById(`cf-${i}`);
        const label = document.getElementById(`cp-${i}`);
        const digitEl = document.getElementById(`cd-${i}`);

        fill.style.width = `${pct}%`;

        if (pct >= 1) {
            label.textContent = `${pct.toFixed(1)}%`;
        } else if (pct >= 0.1) {
            label.textContent = `${pct.toFixed(2)}%`;
        } else {
            label.textContent = "<0.1%";
        }

        const isTop = confidences[i] === maxConf;
        fill.classList.toggle("top", isTop);
        label.classList.toggle("active", isTop);
        digitEl.classList.toggle("active", isTop);
    }

    console.log(`Predicted: ${digit} (${(maxConf * 100).toFixed(1)}%)`);
}