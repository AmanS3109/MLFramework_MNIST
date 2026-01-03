#include "arena.h"

#include <unistd.h>
#include <sys/mman.h>
#include <errno.h>

#ifndef MADV_DONTNEED
#define MADV_DONTNEED 4
#endif


#define ARENA_ASSERT(x) do { if (!(x)) __builtin_trap(); } while(0)

/* ============================================================
   Arena core
   ============================================================ */

mem_arena* arena_create(u64 reserve_size, u64 commit_size)
{
    u32 pagesize = plat_get_pagesize();

    reserve_size = ALIGN_UP_POW2(reserve_size, pagesize);

    u64 min_commit = ALIGN_UP_POW2(sizeof(mem_arena), pagesize);
    commit_size = MAX(commit_size, min_commit);
    commit_size = ALIGN_UP_POW2(commit_size, pagesize);

    mem_arena* arena = plat_mem_reserve(reserve_size);
    if (!arena) return NULL;

    if (!plat_mem_commit(arena, commit_size)) {
        plat_mem_release(arena, reserve_size);
        return NULL;
    }

    arena->reserve_size = reserve_size;
    arena->commit_size  = commit_size;
    arena->pos          = ARENA_BASE_POS;
    arena->commit_pos   = commit_size;

    return arena;
}

void arena_destroy(mem_arena* arena)
{
    if (!arena) return;
    plat_mem_release(arena, arena->reserve_size);
}

void* arena_push(mem_arena* arena, u64 size, b32 zero_init)
{
    u64 pos_aligned = ALIGN_UP_POW2(arena->pos, ARENA_ALIGN);

    if (pos_aligned > arena->reserve_size - size) {
        return NULL;
    }

    u64 new_pos = pos_aligned + size;

    if (new_pos > arena->commit_pos) {
        u64 new_commit = ALIGN_UP_POW2(new_pos, arena->commit_size);
        new_commit = MIN(new_commit, arena->reserve_size);

        u8* commit_ptr = (u8*)arena + arena->commit_pos;
        u64 commit_sz  = new_commit - arena->commit_pos;

        if (!plat_mem_commit(commit_ptr, commit_sz)) {
            return NULL;
        }

        arena->commit_pos = new_commit;
    }

    arena->pos = new_pos;

    u8* out = (u8*)arena + pos_aligned;
    if (zero_init) memset(out, 0, size);

    ARENA_ASSERT(arena->pos <= arena->reserve_size);
    return out;
}

void arena_pop(mem_arena* arena, u64 size)
{
    if (arena->pos <= ARENA_BASE_POS) return;
    size = MIN(size, arena->pos - ARENA_BASE_POS);
    arena->pos -= size;
}

void arena_pop_to(mem_arena* arena, u64 pos)
{
    if (pos < ARENA_BASE_POS) pos = ARENA_BASE_POS;
    if (pos < arena->pos) arena->pos = pos;
}

void arena_clear(mem_arena* arena)
{
    arena->pos = ARENA_BASE_POS;
}

mem_arena_temp arena_temp_begin(mem_arena* arena)
{
    return (mem_arena_temp){ arena, arena->pos };
}

void arena_temp_end(mem_arena_temp temp)
{
    arena_pop_to(temp.arena, temp.start_pos);
}

/* ============================================================
   Scratch arenas (TLS)
   ============================================================ */

static _Thread_local mem_arena* _scratch_arenas[2];

mem_arena_temp arena_scratch_get(mem_arena** conflicts, u32 num_conflicts)
{
    for (i32 i = 0; i < 2; i++) {
        b32 conflict = false;
        for (u32 j = 0; j < num_conflicts; j++) {
            if (_scratch_arenas[i] == conflicts[j]) {
                conflict = true;
                break;
            }
        }
        if (!conflict) {
            if (!_scratch_arenas[i]) {
                _scratch_arenas[i] = arena_create(MiB(64), MiB(1));
            }
            return arena_temp_begin(_scratch_arenas[i]);
        }
    }
    return (mem_arena_temp){0};
}

void arena_scratch_release(mem_arena_temp scratch)
{
    arena_temp_end(scratch);
}

void arena_scratch_destroy_all(void)
{
    for (i32 i = 0; i < 2; i++) {
        if (_scratch_arenas[i]) {
            arena_destroy(_scratch_arenas[i]);
            _scratch_arenas[i] = NULL;
        }
    }
}

/* ============================================================
   Platform layer
   ============================================================ */

#if defined(_WIN32)

#include <windows.h>

u32 plat_get_pagesize(void)
{
    SYSTEM_INFO info;
    GetSystemInfo(&info);
    return info.dwPageSize;
}

void* plat_mem_reserve(u64 size)
{
    return VirtualAlloc(NULL, size, MEM_RESERVE, PAGE_READWRITE);
}

b32 plat_mem_commit(void* ptr, u64 size)
{
    return VirtualAlloc(ptr, size, MEM_COMMIT, PAGE_READWRITE) != NULL;
}

b32 plat_mem_decommit(void* ptr, u64 size)
{
    return VirtualFree(ptr, size, MEM_DECOMMIT);
}

b32 plat_mem_release(void* ptr, u64 size)
{
    (void)size;
    return VirtualFree(ptr, 0, MEM_RELEASE);
}

#elif defined(__linux__)

u32 plat_get_pagesize(void)
{
    return (u32)sysconf(_SC_PAGESIZE);
}

void* plat_mem_reserve(u64 size)
{
    void* p = mmap(NULL, size, PROT_NONE,
                   MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    return (p == MAP_FAILED) ? NULL : p;
}

b32 plat_mem_commit(void* ptr, u64 size)
{
    return mprotect(ptr, size, PROT_READ | PROT_WRITE) == 0;
}

b32 plat_mem_decommit(void* ptr, u64 size)
{
    madvise(ptr, size, MADV_DONTNEED);
    return mprotect(ptr, size, PROT_NONE) == 0;
}

b32 plat_mem_release(void* ptr, u64 size)
{
    return munmap(ptr, size) == 0;
}

#endif

