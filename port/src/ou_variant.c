/* Original CVM Variant::operator==: raw identity first, then only int/float
 * cross-type numeric equality. Equal typed NaN bits compare true; differently
 * encoded typed zeros compare false. Preserve the original FP control modes. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static uint32_t int_float_bits(uint32_t value,uint32_t mode){uint32_t sign=value>>31,mag=sign?0u-value:value;if(!mag)return 0;uint32_t lead=31u-(uint32_t)__builtin_clz(mag),sig;if(lead<=23)sig=mag<<(23-lead);else{uint32_t shift=lead-23,mask=(1u<<shift)-1,rem=mag&mask;sig=mag>>shift;uint32_t half=1u<<(shift-1),round=mode==0?(rem>half||(rem==half&&(sig&1))):mode==1?(!sign&&rem):mode==2?(sign&&rem):0;if(round){sig++;if(sig==0x1000000u){sig>>=1;lead++;}}}return(sign<<31)|((lead+127)<<23)|(sig&0x7fffffu);}
int ou_guest_variant_equal(uc_engine *engine,uint32_t left,uint32_t right,uint32_t *result){uint32_t a[2],b[2];int e=uc_mem_read(engine,left,a,8);if(e)return e;if((e=uc_mem_read(engine,right,b,8)))return e;uint32_t ta=a[0]&31,tb=b[0]&31;*result=ta==tb&&a[1]==b[1];if(*result||!((ta==3&&tb==4)||(ta==4&&tb==3)))return 0;uint32_t control=0;if((e=uc_reg_read(engine,UC_ARM_REG_FPSCR,&control)))return e;uint32_t floating=ta==4?a[1]:b[1],integer=ta==3?a[1]:b[1];if((control&(1u<<24))&&!(floating&0x7f800000u)&&(floating&0x7fffffu))floating&=0x80000000u;uint32_t converted=int_float_bits(integer,(control>>22)&3);*result=floating==converted||(!(floating&0x7fffffffu)&&!converted);return 0;}
