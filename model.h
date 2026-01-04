#pragma once
#include "matrix.h"

/* forward declarations */
typedef struct model_var model_var;
typedef struct model_context model_context;

typedef struct {
    model_var** vars;
    u32 size;
} model_program;

typedef struct {
    matrix* train_images;
    matrix* train_labels;
    matrix* test_images;
    matrix* test_labels;
    u32 epochs;
    u32 batch_size;
    f32 learning_rate;
} model_training_desc;

/* model API */
model_context* model_create(mem_arena* arena);
void model_compile(mem_arena* arena, model_context* model);
void model_feedforward(model_context* model);
void model_train(model_context* model, const model_training_desc* desc);

/* graph construction */
model_var* mv_create(
    mem_arena* arena, model_context* model,
    u32 rows, u32 cols, u32 flags
);

model_var* mv_relu(mem_arena* arena, model_context* model, model_var* input, u32 flags);
model_var* mv_softmax(mem_arena* arena, model_context* model, model_var* input, u32 flags);
model_var* mv_add(mem_arena* arena, model_context* model, model_var* a, model_var* b, u32 flags);
model_var* mv_sub(mem_arena* arena, model_context* model, model_var* a, model_var* b, u32 flags);
model_var* mv_matmul(mem_arena* arena, model_context* model, model_var* a, model_var* b, u32 flags);
model_var* mv_cross_entropy(mem_arena* arena, model_context* model, model_var* p, model_var* q, u32 flags);

/* MNIST */
void create_mnist_model(mem_arena* arena, model_context* model);
