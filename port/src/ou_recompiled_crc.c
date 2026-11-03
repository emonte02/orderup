/* GENERATED FILE. Do not edit by hand.
 *
 * Generator : tools/recompile_crc.py
 * Source    : analysis/game-apk/lib/armeabi-v7a/libOrderUp.so
 * SHA-256   : 9e3f2fe8c829b7bec803cf42140e39d3434c8726799395932eb1799c9aed0228
 * Symbol    : _ZN3Crc21GenerateCRCFromStringEPKcj
 * Demangled : Crc::GenerateCRCFromString(char const*, unsigned int)
 * Address   : 0x3a4770 (ELF virtual address), 80 bytes
 *
 * This file is a static recompilation of ONE A32 leaf routine. Each
 * reachable machine instruction became one C statement block. Registers
 * r0..r12 and flags n/z/c/v are local variables. Loads read the guest
 * memory buffer that the caller passes. Nothing here is a general ARM
 * translator and nothing here is a hand-written CRC.
 */
#include "ou_recompiled_crc.h"

/* Little-endian guest loads. `memory` is a flat image of the 32-bit
 * guest address space. Guest address 0 is memory[0]. */
static inline uint32_t ou_guest_ld8(const unsigned char *memory, uint32_t address)
{
    return (uint32_t)memory[address];
}

static inline uint32_t ou_guest_ld32(const unsigned char *memory, uint32_t address)
{
    return (uint32_t)memory[address]
        | ((uint32_t)memory[(uint32_t)(address + 1u)] << 8)
        | ((uint32_t)memory[(uint32_t)(address + 2u)] << 16)
        | ((uint32_t)memory[(uint32_t)(address + 3u)] << 24);
}

uint32_t ou_recompiled_crc(const unsigned char *memory, uint32_t string_address, uint32_t initial_crc)
{
    /* AAPCS: r0 = char const *string, r1 = unsigned int initial_crc. */
    uint32_t r0 = string_address;
    uint32_t r1 = initial_crc;
    uint32_t r2 = 0u;
    uint32_t r3 = 0u;
    uint32_t r12 = 0u;
    uint32_t z = 0u, c = 0u;

    /* 0x3a4770  e2503000  subs r3, r0, #0 */
    {
        const uint32_t a = r0;
        const uint32_t b = 0x0u;
        const uint32_t res = a - b;
        z = (res == 0u) ? 1u : 0u;
        c = (a >= b) ? 1u : 0u;
        r3 = res;
    }
    /* 0x3a4774  0a00000e  beq #0x3a47b4 */
    if (z) goto L_3a47b4;
    /* 0x3a4778  e5d32000  ldrb r2, [r3] */
    r2 = ou_guest_ld8(memory, r3);
    /* 0x3a477c  e3520000  cmp r2, #0 */
    {
        const uint32_t a = r2;
        const uint32_t b = 0x0u;
        const uint32_t res = a - b;
        z = (res == 0u) ? 1u : 0u;
        c = (a >= b) ? 1u : 0u;
    }
    /* 0x3a4780  0a00000b  beq #0x3a47b4 */
    if (z) goto L_3a47b4;
    /* 0x3a4784  e59fc030  ldr ip, [pc, #0x30]  (literal pool word at 0x3a47bc holds 0x0006bd74) */
    r12 = ou_guest_ld32(memory, 0x3a47bcu);
    /* 0x3a4788  e08fc00c  add ip, pc, ip  (pc = 0x3a4788 + 8) */
    r12 = 0x3a4790u + r12;
L_3a478c:
    /* 0x3a478c  e2420041  sub r0, r2, #0x41 */
    r0 = r2 - 0x41u;
    /* 0x3a4790  e3500019  cmp r0, #0x19 */
    {
        const uint32_t a = r0;
        const uint32_t b = 0x19u;
        const uint32_t res = a - b;
        z = (res == 0u) ? 1u : 0u;
        c = (a >= b) ? 1u : 0u;
    }
    /* 0x3a4794  92822020  addls r2, r2, #0x20 */
    if (!c || z) {
        r2 = r2 + 0x20u;
    }
    /* 0x3a4798  e0220001  eor r0, r2, r1 */
    r0 = r2 ^ r1;
    /* 0x3a479c  e5f32001  ldrb r2, [r3, #1]! */
    {
        const uint32_t address = r3 + 0x1u;
        r3 = address;
        r2 = ou_guest_ld8(memory, address);
    }
    /* 0x3a47a0  e6ef0070  uxtb r0, r0 */
    r0 = r0 & 0xffu;
    /* 0x3a47a4  e3520000  cmp r2, #0 */
    {
        const uint32_t a = r2;
        const uint32_t b = 0x0u;
        const uint32_t res = a - b;
        z = (res == 0u) ? 1u : 0u;
        c = (a >= b) ? 1u : 0u;
    }
    /* 0x3a47a8  e79c0100  ldr r0, [ip, r0, lsl #2] */
    r0 = ou_guest_ld32(memory, r12 + (r0 << 2));
    /* 0x3a47ac  e0201421  eor r1, r0, r1, lsr #8 */
    r1 = r0 ^ (r1 >> 8);
    /* 0x3a47b0  1afffff5  bne #0x3a478c */
    if (!z) goto L_3a478c;
L_3a47b4:
    /* 0x3a47b4  e1a00001  mov r0, r1 */
    r0 = r1;
    /* 0x3a47b8  e12fff1e  bx lr */
    return r0;
}
