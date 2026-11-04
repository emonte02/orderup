/* Original XPL byte-string comparisons and raw seeded CRC32. Comparisons use
 * signed char differences; CRCs consume unsigned bytes with no final XOR. */
#include <stdint.h>
#include <unicorn/unicorn.h>
static uint32_t crc_table[256];
static int crc_ready;
static int32_t lower(uint32_t value){int32_t c=(int8_t)(uint8_t)value;return c>64&&c<=90?c+32:c;}
int ou_guest_string_op(uc_engine *engine,uint32_t kind,uint32_t a,uint32_t b,uint32_t n,uint32_t *out){
 if(kind==0){*out=(uint32_t)lower(a);return UC_ERR_OK;}
 if(kind==1||kind==2){
  if(kind==2&&!n){*out=0;return UC_ERR_OK;}
  for(;;){uint8_t x=0,y=0;int error=uc_mem_read(engine,a++,&x,1);if(error)return error;if((error=uc_mem_read(engine,b++,&y,1)))return error;int32_t cx=lower(x),cy=lower(y),delta=cx-cy;if(delta||!cx||(kind==2&&!--n)){*out=(uint32_t)delta;return UC_ERR_OK;}}
 }
 if(kind!=3&&kind!=4)return UC_ERR_ARG;
 uint32_t crc=b;if(!a){*out=crc;return UC_ERR_OK;}
 if(!crc_ready){for(uint32_t i=0;i<256;i++){uint32_t c=i;for(uint32_t k=0;k<8;k++)c=(c>>1)^((c&1)?0xedb88320u:0);crc_table[i]=c;}crc_ready=1;}
 for(;;){uint8_t c=0;int error=uc_mem_read(engine,a++,&c,1);if(error)return error;if(!c)break;if(kind==4&&c>64&&c<=90)c+=32;crc=crc_table[(crc^c)&255]^(crc>>8);}
 *out=crc;return UC_ERR_OK;
}
