/* Original first-match resource lists and unsigned WAD-index search.
 * No resource cache is added. Long lists, stack aliases and changed comparison
 * code retain the original ARM path before any registers or memory change. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
typedef struct {uc_engine *engine;int error;} Memory;
static uint32_t rd(Memory *m,uint32_t p){uint32_t v=0;if(!m->error)m->error=uc_mem_read(m->engine,p,&v,4);return v;}
static void wr(Memory *m,uint32_t p,uint32_t v){if(!m->error)m->error=uc_mem_write(m->engine,p,&v,4);}
static uint32_t cmp(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
static int overlap(uint32_t a,uint64_t n,uint32_t b,uint64_t m){return n&&m&&((uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n));}
int ou_guest_asset_lookup(uc_engine *engine,uint32_t kind,uint32_t a[4],uint32_t comparator,uint32_t *handled){
 Memory m={engine,0};uint32_t flags=0,steps=0;*handled=0;
 if(kind==0){
  a[3]=a[0]+4;a[2]=rd(&m,a[3]);flags=cmp(a[2],a[3]);if(a[2]==a[3]){a[0]=0;goto done;}
  for(;;){if(++steps>4096)return 0;a[0]=rd(&m,a[2]+4);flags=cmp(a[0],0);if(!a[0])goto done;uint32_t key=rd(&m,a[0]+0x18);flags=cmp(a[1],key);if(a[1]==key)goto done;a[2]=rd(&m,a[2]);flags=cmp(a[3],a[2]);if(a[3]==a[2]){a[0]=0;goto done;}if(m.error)return m.error;}
 }
 if(kind==1){
  a[3]=rd(&m,a[0]+0x14);flags=cmp(a[3],0);if(!a[3]){a[0]=0;goto done;}
  for(unsigned list=0;list<2;list++){
   if(list)a[3]+=12;a[2]=rd(&m,a[3]);flags=cmp(a[2],a[3]);if(a[2]==a[3])continue;
   for(;;){if(++steps>4096)return 0;a[0]=rd(&m,a[2]+4);flags=cmp(a[0],0);if(!a[0])break;uint32_t key=rd(&m,a[0]+0x18);flags=cmp(a[1],key);if(a[1]==key)goto done;a[2]=rd(&m,a[2]);flags=cmp(a[3],a[2]);if(a[3]==a[2])break;if(m.error)return m.error;}
  }
  a[0]=0;goto done;
 }
 if(kind==2){
  static const uint32_t original_compare[8]={0xe5903000u,0xe5912000u,0xe1530002u,0x83a00001u,0x812fff1eu,0x23a00000u,0x33e00000u,0xe12fff1eu};uint32_t sp=0,lr=0;
  if((m.error=uc_reg_read(engine,UC_ARM_REG_SP,&sp)))return m.error;if(sp<24||a[0]>0xfffffebfu||overlap(a[0]+0x13c,8,sp-24,24))return 0;
  if(rd(&m,0x391d30u)+0x391d0cu!=comparator)return m.error;
  for(unsigned i=0;i<8;i++){if(rd(&m,comparator+i*4)!=original_compare[i])return m.error;}
  uint32_t header=rd(&m,a[0]+0x13c);if(header>0xfffffff7u||overlap(header+8,4,sp-24,24))return m.error;
  uint32_t count=rd(&m,header+8),base=rd(&m,a[0]+0x140),key=a[1];uint64_t bytes=(uint64_t)count*8;
  if(count>1048576u||(uint64_t)base+bytes>0x100000000ull||overlap(base,bytes,sp-24,24))return m.error;
  uint32_t lo=0,hi=count,found=0;
  while(lo<hi){uint32_t mid=(lo+hi)>>1,p=base+mid*8,value=rd(&m,p);if(m.error)return m.error;if(key==value){found=p;break;}if(key<value)hi=mid;else lo=mid+1;}
  if((m.error=uc_reg_read(engine,UC_ARM_REG_LR,&lr)))return m.error;
  wr(&m,sp-4,lr);wr(&m,sp-16,key);wr(&m,sp-24,comparator);a[0]=found?rd(&m,found+4):0xffffffffu;a[1]=base;a[2]=count;a[3]=8;flags=cmp(found,0);
  // The original BL to imported bsearch leaves this dead return link in LR.
  uint32_t return_link=0x391d1cu;if(!m.error)m.error=uc_reg_write(engine,UC_ARM_REG_LR,&return_link);goto done;
 }
 if(kind==3||kind==4){
  uint32_t sp=0;if((m.error=uc_reg_read(engine,UC_ARM_REG_SP,&sp)))return m.error;if(sp<16)return 0;
  if(kind==3){
   uint32_t source=a[0],length=0;if(overlap(source,65536,sp-16,16))return 0;
   for(;length<65536;length++){uint8_t byte=0;if((m.error=uc_mem_read(engine,source+length,&byte,1)))return m.error;if(!byte)break;}if(length==65536)return 0;
   wr(&m,sp-12,source+length+1);wr(&m,sp-4,length);a[0]=length;a[2]=source+length+1;a[3]=length;
  }else{
   uint32_t destination=a[0],source=a[1],remaining=a[2],limit=a[2];if(remaining>65536||overlap(destination,remaining,sp-16,16)||overlap(source,remaining,sp-16,16))return 0;
   if(remaining){for(;;){if(!--remaining)break;uint8_t byte=0;if((m.error=uc_mem_read(engine,source,&byte,1)))return m.error;if((m.error=uc_mem_write(engine,destination,&byte,1)))return m.error;destination++;source++;if(!byte)break;}uint8_t zero=0;if((m.error=uc_mem_write(engine,destination,&zero,1)))return m.error;}
   wr(&m,sp-4,destination);wr(&m,sp-8,source);wr(&m,sp-12,remaining);a[2]=0;a[3]=limit?destination:0;
  }
  flags=0x60000000u;goto done;
 }
 return UC_ERR_ARG;
done:
 if(m.error)return m.error;uint32_t cpsr=0;if((m.error=uc_reg_read(engine,UC_ARM_REG_CPSR,&cpsr)))return m.error;cpsr=(cpsr&0x0fffffffu)|flags;
 if((m.error=uc_reg_write(engine,UC_ARM_REG_R1,a+1)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_R2,a+2)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_R3,a+3)))return m.error;if((m.error=uc_reg_write(engine,UC_ARM_REG_CPSR,&cpsr)))return m.error;*handled=1;return 0;
}
