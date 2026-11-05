/* Original Link::FindHashIndex bit folding, including flags and stack writes. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static uint32_t cmp(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
static uint32_t lsl(uint32_t word,uint32_t shift){return shift<32?word<<shift:0;}
static uint32_t lsr(uint32_t word,uint32_t shift){return shift<32?word>>shift:0;}
int ou_guest_hash_index(uc_engine *engine,uint32_t a[4],uint32_t *handled){
 *handled=0;if(a[0]>32)return 0;uint32_t sp=0,saved[2];int error=uc_reg_read(engine,UC_ARM_REG_SP,&sp);if(error)return error;if(sp<8||(sp&3))return 0;
 if((error=uc_reg_read(engine,UC_ARM_REG_R4,saved)))return error;if((error=uc_reg_read(engine,UC_ARM_REG_R5,saved+1)))return error;if((error=uc_mem_write(engine,sp-8,saved,8)))return error;
 uint32_t bits=a[0],ip=32-bits,flags=cmp(32,bits);a[3]=bits;
 if(ip){uint32_t width=32;for(;;){uint32_t half=width>>1,low=(lsl(1,half)-1)&a[1];a[2]=half;flags=cmp(half,ip);width=half;if(half>ip){a[2]=0xffffffffu;a[3]=a[1]&~lsl(0xffffffffu,bits);a[1]=a[3]^lsr(a[1],ip);break;}ip=half-bits;flags=cmp(half,bits);a[1]=low^lsr(a[1],half);if(!ip)break;}}
 a[0]=a[1];uint32_t cpsr=0;if((error=uc_reg_read(engine,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|flags;
 if((error=uc_reg_write(engine,UC_ARM_REG_R1,a+1)))return error;if((error=uc_reg_write(engine,UC_ARM_REG_R2,a+2)))return error;if((error=uc_reg_write(engine,UC_ARM_REG_R3,a+3)))return error;if((error=uc_reg_write(engine,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}
