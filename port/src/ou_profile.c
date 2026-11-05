/* Optional diagnostic build only. Samples guest blocks in C rather than
 * crossing into JavaScript at every block. Never changes guest CPU state. */
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <unicorn/unicorn.h>
#define CAPACITY 16384u
#define SLOTS 32768u
typedef struct { uint32_t pc, bytes, hits; } Row;
typedef struct { uc_engine *engine; uc_hook hook; uint32_t enabled, period, tick, seen, sampled, used, dropped; uint32_t slots[SLOTS]; Row rows[CAPACITY]; } OUProfile;
static void sample(uc_engine *engine,uint64_t address,uint32_t size,void *opaque){
 (void)engine;OUProfile *p=opaque;if(!p->enabled)return;p->seen++;if(++p->tick%p->period)return;p->sampled++;
 uint32_t pc=(uint32_t)address,index=((pc>>1)*2654435761u)>>(32-15);
 for(unsigned attempts=0;attempts<SLOTS;attempts++,index=(index+1)&(SLOTS-1)){
  uint32_t slot=p->slots[index];if(!slot){if(p->used==CAPACITY){p->dropped++;return;}slot=++p->used;p->slots[index]=slot;p->rows[slot-1]=(Row){pc,0,0};}
  Row *r=p->rows+slot-1;if(r->pc==pc){r->bytes+=size;r->hits++;return;}
 }
 p->dropped++;
}
OUProfile *ou_profile_create(uc_engine *engine,uint32_t begin,uint32_t end,uint32_t period){
 if(!period||begin>end)return NULL;OUProfile *p=calloc(1,sizeof(*p));if(!p)return NULL;p->engine=engine;p->period=period;
 if(uc_hook_add(engine,&p->hook,UC_HOOK_BLOCK,sample,p,(uint64_t)begin,(uint64_t)end)!=UC_ERR_OK){free(p);return NULL;}return p;
}
void ou_profile_enable(OUProfile *p,uint32_t enabled){p->enabled=!!enabled;}
void ou_profile_clear(OUProfile *p){p->seen=p->sampled=p->used=p->dropped=0;memset(p->slots,0,sizeof(p->slots));}
uint32_t ou_profile_count(OUProfile *p,uint32_t field){return field==0?p->used:field==1?p->seen:field==2?p->sampled:p->dropped;}
const Row *ou_profile_data(OUProfile *p){return p->rows;}
void ou_profile_destroy(OUProfile *p){if(!p)return;p->enabled=0;uc_hook_del(p->engine,p->hook);free(p);}
