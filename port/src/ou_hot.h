#ifndef OU_HOT_H
#define OU_HOT_H
#include <stdint.h>
int ou_decode_mono_adpcm_mix(const uint8_t *input, int16_t *output, int32_t volume, int samples);
uint32_t ou_font_char_index(const uint16_t *characters, uint16_t last, uint32_t character);
#endif
