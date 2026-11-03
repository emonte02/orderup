/* Reconstructed from original ARM routines, with differential reference fixtures.
 * DecodeMonoADPCMFrameMix ELF 0x38f5d4; Font::get_char_index ELF 0x365cac.
 * Preserve the original duplicated predictor byte, integer truncation and 16-bit wrap.
 */
#include "ou_hot.h"
static const uint16_t steps[89]={
7,8,9,10,11,12,13,14,16,17,19,21,23,25,28,31,34,37,41,45,50,55,60,66,73,80,88,97,107,118,130,143,157,173,190,209,230,253,279,307,337,371,408,449,494,544,598,658,724,796,876,963,1060,1166,1282,1411,1552,1707,1878,2066,2272,2499,2749,3024,3327,3660,4026,4428,4871,5358,5894,6484,7132,7845,8630,9493,10442,11487,12635,13899,15289,16818,18500,20350,22385,24623,27086,29794,32767};
static const int8_t index_delta[16]={-1,-1,-1,-1,2,4,6,8,-1,-1,-1,-1,2,4,6,8};
static int16_t decode(int *index,int16_t *previous,uint8_t nibble){
 const int step=steps[*index];int next=*index+index_delta[nibble&15];*index=next<0?0:next>88?88:next;
 int difference=step>>3;if(nibble&4)difference+=step;if(nibble&2)difference+=step>>1;if(nibble&1)difference+=step>>2;
 int result=*previous+((nibble&8)?-difference:difference);if(result<-32768)result=-32768;if(result>32767)result=32767;return *previous=(int16_t)result;
}
int ou_decode_mono_adpcm_mix(const uint8_t *input,int16_t *output,int32_t volume,int samples){
 if(samples<0||input[2]>88)return -1;
 int index=input[2];int16_t previous=(int16_t)((uint16_t)input[0]*257u);
 for(int i=0;i<(samples/2)*2;i++){
  const uint8_t byte=input[3+i/2];const int16_t sample=decode(&index,&previous,(i&1)?byte>>4:byte);
  const int32_t product=(int32_t)((uint32_t)volume*(uint32_t)(int32_t)sample);
  output[i]=(int16_t)((uint16_t)output[i]+(uint16_t)(product/100));
 }
 return 0;
}
uint32_t ou_font_char_index(const uint16_t *characters,uint16_t last,uint32_t character){
 for(int fallback=0;fallback<2;fallback++,character=95){
  int low=0,high=last;
  do{int middle=(low+high)>>1;const uint32_t value=characters[middle];if(value<character)low=middle+1;else{high=middle-1;if(value<=character)return (uint32_t)middle;}}while(low<=high);
 }
 return 0;
}
