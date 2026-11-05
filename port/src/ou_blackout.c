/* Exact original memory-range bookkeeping; no allocator or collector change. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
typedef struct {uc_engine *engine;int error;} Memory;
static uint32_t rd(Memory *m,uint32_t p){uint32_t v=0;if(!m->error)m->error=uc_mem_read(m->engine,p,&v,4);return v;}
static void wr(Memory *m,uint32_t p,uint32_t v){if(!m->error)m->error=uc_mem_write(m->engine,p,&v,4);}
int ou_guest_blackout(uc_engine *engine,uint32_t kind,uint32_t a[4],uint32_t *handled){
 Memory m={engine,0};*handled=0;uint32_t owner=a[0],sp=0,n=0,index=0;if(kind>1)return UC_ERR_ARG;if((m.error=uc_reg_read(engine,UC_ARM_REG_SP,&sp)))return m.error;
 uint32_t frame=kind?16:24;if((owner&3)||sp<frame||owner>0xffffc79bu||((uint64_t)owner<sp&&(uint64_t)sp-frame<(uint64_t)owner+0x3864))return 0;
 n=rd(&m,owner+0x3860);if(m.error)return m.error;if(n>(kind?1024u:1023u))return 0;
 int registers[6]={UC_ARM_REG_R4,UC_ARM_REG_R5,UC_ARM_REG_R6,UC_ARM_REG_R7,UC_ARM_REG_R8,UC_ARM_REG_R10};uint32_t saved[6];for(unsigned i=0;i<frame/4;i++)if((m.error=uc_reg_read(engine,registers[i],saved+i)))return m.error;if((m.error=uc_mem_write(engine,sp-frame,saved,frame)))return m.error;
 uint32_t base=owner+0x860;
 if(!kind){
  uint32_t start=a[1],size=a[2],flag=a[3];while(index<n&&rd(&m,base+index*12)<=start)index++;if(m.error)return m.error;
  for(uint32_t to=n;to>index;to--){uint32_t words[3];if((m.error=uc_mem_read(engine,base+(to-1)*12,words,12)))return m.error;if((m.error=uc_mem_write(engine,base+to*12,words,12)))return m.error;}
  uint32_t slot=base+index*12,count=rd(&m,owner+0x3860);uint16_t low=(uint16_t)flag,zero=0;if(!m.error)m.error=uc_mem_write(engine,slot+8,&low,2);wr(&m,slot+4,start+size-1);wr(&m,slot,start);if(!m.error)m.error=uc_mem_write(engine,slot+10,&zero,2);wr(&m,owner+0x3860,count+1);a[0]=count;a[1]=0x3860;a[2]=count+1;a[3]=owner+index*12;
 }else{
  a[0]=n;a[3]=0x3860;if(n){a[3]=base;a[2]=rd(&m,base);while(a[2]!=a[1]){if(++index==n)goto done;a[3]+=12;a[2]=rd(&m,a[3]);if(m.error)return m.error;}a[0]=n-1;wr(&m,owner+0x3860,n-1);
   for(uint32_t from=index+1;from<n;from++){uint32_t words[3];if((m.error=uc_mem_read(engine,base+from*12,words,12)))return m.error;if((m.error=uc_mem_write(engine,base+(from-1)*12,words,12)))return m.error;a[0]=words[0];a[1]=words[1];a[2]=words[2];a[3]=base+from*12;}
  }
 }
done:
 if(m.error)return m.error;uint32_t cpsr=0;if((m.error=uc_reg_read(engine,UC_ARM_REG_CPSR,&cpsr)))return m.error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;
 if((m.error=uc_reg_write(engine,UC_ARM_REG_R1,a+1)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_R2,a+2)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_R3,a+3)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_CPSR,&cpsr)))return m.error;*handled=1;return 0;
}
