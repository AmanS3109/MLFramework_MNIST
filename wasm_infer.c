// wasm_infer.c
//
// WASM entry points for MNIST inference
// This file reuses the existing implementation in main.c
// without refactoring the whole project yet.
//
// Build target: WebAssembly (Emscripten)

#define WASM_BUILD 1

#include <string.h>

#include "base.h"
#include "arena.h"
#include "prng.h"

/*
 IMPORTANT:
 We include main.c so that ALL existing symbols
 (matrix, model, training code, etc.) are visible
 to this translation unit.

 This is intentional for the WASM prototype.
*/
#include "main.c"

/* --------------------------------------------------
   Global WASM state
-------------------------------------------------- */

static mem_arena*     g_arena = NULL;
static model_context* g_model = NULL;

/* --------------------------------------------------
   WASM exported functions
-------------------------------------------------- */

/*
 Initialize the model once.
 This should be called exactly once from JavaScript.
*/
__attribute__((used))
void wasm_init(void) {
    if (g_arena != NULL) {
        return; // already initialized
    }

    g_arena = arena_create(MiB(16), MiB(1));
    g_model = model_create(g_arena);

    create_mnist_model(g_arena, g_model);
    model_compile(g_arena, g_model);
}

/*
 Load pre-trained weights from a buffer.
 data must point to the raw bytes of mnist_weights.bin.
 This should be called after wasm_init and before wasm_predict.
*/
__attribute__((used))
void wasm_load_weights(const u8* data, u32 size) {
    if (g_model == NULL) return;
    model_load_weights_from_buffer(g_model, data, size);
}

/*
 Run inference on a single 28x28 image.
 input784 must point to 784 floats normalized to [0,1].

 Returns:
   digit [0..9]
*/
__attribute__((used))
u32 wasm_predict(const f32* input784) {
    // Copy input into model input tensor
    memcpy(
        g_model->input->val->data,
        input784,
        sizeof(f32) * 784
    );

    // Forward pass
    model_feedforward(g_model);

    // Return predicted digit
    return mat_argmax(g_model->output->val);
}

/*
 Get the confidence score for a specific digit (0-9).
 Must be called after wasm_predict.
 Returns the softmax probability for the given digit.
*/
__attribute__((used))
f32 wasm_get_confidence(u32 digit) {
    if (digit >= 10 || g_model == NULL) return 0.0f;
    return g_model->output->val->data[digit];
}
