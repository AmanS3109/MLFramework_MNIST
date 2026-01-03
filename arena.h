#pragma once
#include "base.h"

typedef struct {
    u64 reserve_size;
    u64 commit_size;
    u64 pos;
    u64 commit_pos;
} mem_arena;

typedef struct {
    mem_arena* arena;
    u64 start_pos;
} mem_arena_temp;

#define ARENA_BASE_POS (sizeof(mem_arena))
#define ARENA_ALIGN    (sizeof(void*))

mem_arena* arena_create(u64 reserve_size, u64 commit_size);
void arena_destroy(mem_arena* arena);

void* arena_push(mem_arena* arena, u64 size, b32 zero_init);
void arena_pop(mem_arena* arena, u64 size);
void arena_pop_to(mem_arena* arena, u64 pos);
void arena_clear(mem_arena* arena);

mem_arena_temp arena_temp_begin(mem_arena* arena);
void arena_temp_end(mem_arena_temp temp);

mem_arena_temp arena_scratch_get(mem_arena** conflicts, u32 num_conflicts);
void arena_scratch_release(mem_arena_temp scratch);
void arena_scratch_destroy_all(void);

/* helpers */
#define PUSH_STRUCT(a,T)      (T*)arena_push(a,sizeof(T),true)
#define PUSH_STRUCT_NZ(a,T)   (T*)arena_push(a,sizeof(T),false)
#define PUSH_ARRAY(a,T,n)     (T*)arena_push(a,sizeof(T)*(n),true)
#define PUSH_ARRAY_NZ(a,T,n)  (T*)arena_push(a,sizeof(T)*(n),false)

/* platform */
u32  plat_get_pagesize(void);
void* plat_mem_reserve(u64 size);
b32  plat_mem_commit(void* ptr, u64 size);
b32  plat_mem_decommit(void* ptr, u64 size);
b32  plat_mem_release(void* ptr, u64 size);
