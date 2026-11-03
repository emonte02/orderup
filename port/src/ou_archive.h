#ifndef OU_ARCHIVE_H
#define OU_ARCHIVE_H
#include <stddef.h>
#include <stdint.h>
/* Recovered WAD v4 interface. Input memory stays owned by the caller. */
typedef struct ou_wad ou_wad;
uint32_t ou_crc(const char *name);
ou_wad *ou_wad_open(const void *data, size_t length);
void ou_wad_close(ou_wad *wad);
uint32_t ou_wad_count(const ou_wad *wad);
uint32_t ou_wad_mode(const ou_wad *wad);
uint32_t ou_wad_hash(const ou_wad *wad, uint32_t sorted_index);
uint32_t ou_wad_size(const ou_wad *wad, uint32_t sorted_index);
int ou_wad_find(const ou_wad *wad, uint32_t hash);
/* Returns the number of bytes copied or -1 on corrupt data/insufficient space. */
int ou_wad_read(const ou_wad *wad, uint32_t sorted_index, void *out, size_t capacity);
#endif
