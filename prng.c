#include "prng.h"

static _Thread_local prng_state s_prng_state = {
    0x853c49e6748fea9bULL,
    0xda3e39cb94b95bdbULL
};

void prng_seed_r(prng_state* rng, u64 initstate, u64 initseq)
{
    rng->state = 0;
    rng->inc   = (initseq << 1u) | 1u;
    prng_rand_r(rng);
    rng->state += initstate;
    prng_rand_r(rng);
}

void prng_seed(u64 initstate, u64 initseq)
{
    prng_seed_r(&s_prng_state, initstate, initseq);
}

u32 prng_rand_r(prng_state* rng)
{
    u64 old = rng->state;
    rng->state = old * 6364136223846793005ULL + rng->inc;
    u32 xorshifted = (u32)(((old >> 18u) ^ old) >> 27u);
u32 rot        = (u32)(old >> 59u);

    return (xorshifted >> rot) | (xorshifted << ((-rot) & 31));
}

u32 prng_rand(void)
{
    return prng_rand_r(&s_prng_state);
}

f32 prng_randf_r(prng_state* rng)
{
    return (f32)prng_rand_r(rng) / (f32)UINT32_MAX;
}

f32 prng_randf(void)
{
    return prng_randf_r(&s_prng_state);
}
