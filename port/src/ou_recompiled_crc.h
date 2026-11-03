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
#ifndef OU_RECOMPILED_CRC_H
#define OU_RECOMPILED_CRC_H
#include <stdint.h>

#define OU_RECOMPILED_CRC_SOURCE_SHA256 "9e3f2fe8c829b7bec803cf42140e39d3434c8726799395932eb1799c9aed0228"
#define OU_RECOMPILED_CRC_ENTRY_ADDRESS 0x3a4770u
#define OU_RECOMPILED_CRC_ROUTINE_SIZE 80u
#define OU_RECOMPILED_CRC_LITERAL_ADDRESS 0x3a47bcu
#define OU_RECOMPILED_CRC_LITERAL_VALUE 0x6bd74u
/* Resolved statically: literal + (pc + 8) gives the table base. The
 * index register is zero-extended to 8 bits before the load. */
#define OU_RECOMPILED_CRC_TABLE_ADDRESS 0x410504u
#define OU_RECOMPILED_CRC_TABLE_ENTRIES 256u
#define OU_RECOMPILED_CRC_TABLE_SIZE 1024u
/* The guest image must cover at least this many bytes from address 0
 * so that the literal pool and the table are present. */
#define OU_RECOMPILED_CRC_MINIMUM_MEMORY_SIZE 0x410904u

/* Run the recompiled routine.
 *   memory         : flat little-endian guest image, guest address 0 at memory[0].
 *                    It must hold the ELF PT_LOAD segments at their virtual
 *                    addresses and the NUL-terminated string at string_address.
 *   string_address : guest address of the string (r0). 0 means NULL.
 *   initial_crc    : seed (r1).
 * Returns r0 at bx lr. The caller must keep every accessed guest address
 * inside the buffer; the routine performs no bounds checks, like the original. */
uint32_t ou_recompiled_crc(const unsigned char *memory, uint32_t string_address, uint32_t initial_crc);

#endif
