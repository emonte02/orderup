/* Host helpers and compatibility guards for the pinned Unicorn WASM engine. */
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>

typedef struct {
    uc_engine *engine;
    uc_hook hook;
    double deadline;
    uint32_t blocks, stops;
} OUBudget;

#ifdef OU_TCI_INTEGRATED_BUDGET
extern void ou_tci_budget_begin(uc_engine *, double);
extern void ou_tci_budget_disable(uc_engine *);
extern uint32_t ou_tci_budget_blocks(uc_engine *);
extern uint32_t ou_tci_budget_stops(uc_engine *);
#else
static void budget_callback(uc_engine *engine, uint64_t address,
                            uint32_t size, void *opaque) {
    OUBudget *budget = opaque;
    (void)address;
    (void)size;
    if (((++budget->blocks) & 127) == 0 &&
        emscripten_get_now() >= budget->deadline) {
        budget->stops++;
        uc_emu_stop(engine);
    }
}

#endif

OUBudget *ou_budget_create(uc_engine *engine) {
    OUBudget *budget = calloc(1, sizeof(*budget));
    if (!budget) return NULL;
    budget->engine = engine;
    budget->deadline = 1e300;
#ifdef OU_TCI_INTEGRATED_BUDGET
    ou_tci_budget_begin(engine, budget->deadline);
#else
    if (uc_hook_add(engine, &budget->hook, UC_HOOK_BLOCK,
                    budget_callback, budget, 1, 0) != UC_ERR_OK) {
        free(budget);
        return NULL;
    }
#endif
    return budget;
}
void ou_budget_begin(OUBudget *budget, double milliseconds) {
    budget->deadline = emscripten_get_now() + milliseconds;
#ifdef OU_TCI_INTEGRATED_BUDGET
    ou_tci_budget_begin(budget->engine, budget->deadline);
#endif
}
uint32_t ou_budget_blocks(OUBudget *budget) {
#ifdef OU_TCI_INTEGRATED_BUDGET
    return ou_tci_budget_blocks(budget->engine);
#else
    return budget->blocks;
#endif
}
uint32_t ou_budget_stops(OUBudget *budget) {
#ifdef OU_TCI_INTEGRATED_BUDGET
    return ou_tci_budget_stops(budget->engine);
#else
    return budget->stops;
#endif
}
void ou_budget_destroy(OUBudget *budget) {
#ifdef OU_TCI_INTEGRATED_BUDGET
    ou_tci_budget_disable(budget->engine);
#else
    uc_hook_del(budget->engine, budget->hook);
#endif
    free(budget);
}

#include "ou_hot.h"
#include "ou_gc_mark.h"
#include "ou_gfx_constants.h"
int ou_guest_adpcm_mix(uc_engine *engine,uint32_t source,uint32_t destination,int32_t volume,int samples){
 if(samples<0||samples>1048576)return UC_ERR_ARG;
 const size_t input_size=(unsigned)samples/2+3,output_size=((unsigned)samples/2)*4;
 uint8_t *input=malloc(input_size);int16_t *output=malloc(output_size?output_size:2);int error=UC_ERR_NOMEM;
 if(!input||!output)goto done;
 error=uc_mem_read(engine,source,input,input_size);if(error)goto done;
 if(output_size){error=uc_mem_read(engine,destination,output,output_size);if(error)goto done;}
 if(ou_decode_mono_adpcm_mix(input,output,volume,samples)){error=UC_ERR_ARG;goto done;}
 if(output_size)error=uc_mem_write(engine,destination,output,output_size);
done:free(input);free(output);return error;
}
int ou_guest_font_char_index(uc_engine *engine,uint32_t font,uint32_t character){
 uint16_t last;uint32_t address;int error=uc_mem_read(engine,font+24,&last,2);if(error)return -1000-error;
 error=uc_mem_read(engine,font+60,&address,4);if(error)return -1000-error;
 const size_t size=((unsigned)last+1)*2;uint16_t *characters=malloc(size);if(!characters)return -1000-UC_ERR_NOMEM;
 error=uc_mem_read(engine,address,characters,size);int result=error?-1000-error:(int)ou_font_char_index(characters,last,character);free(characters);return result;
}

/* Original ARM 0x3423c8: preserve its preceding-slot return for later thresholds. */
int ou_guest_animation_index(uc_engine *engine,uint32_t object,uint32_t time,uint32_t *result){
 uint32_t fields[4];int error=uc_mem_read(engine,object+12,fields,sizeof(fields));if(error)return error;
 *result=0;int32_t count=(int32_t)fields[0];uint32_t period=fields[1];
 if(!period||count<=0)return UC_ERR_OK;if(count>1048576)return UC_ERR_ARG;
 uint32_t remainder=time%period,threshold=0;error=uc_mem_read(engine,fields[2],&threshold,4);if(error)return error;
 uint32_t index=0;if(remainder>=threshold){int32_t i;for(i=1;i<count;i++){error=uc_mem_read(engine,fields[2]+(uint32_t)i*4,&threshold,4);if(error)return error;if(remainder<threshold){index=(uint32_t)i-1;break;}}if(i==count)return UC_ERR_OK;}
 return uc_mem_read(engine,fields[3]+index*4,result,4);
}
/* Original ARM 0x35f0ac: stop immediately on a null list value. */
int ou_guest_find_camera(uc_engine *engine,uint32_t manager,uint32_t checksum,uint32_t *result){
 uint32_t head=manager+0x3fc,node=0;int error=uc_mem_read(engine,head,&node,4);if(error)return error;*result=0;
 for(uint32_t count=0;node!=head;count++){
  if(count>=1048576)return UC_ERR_ARG;uint32_t item=0,key=0;
  error=uc_mem_read(engine,node+4,&item,4);if(error)return error;if(!item)return UC_ERR_OK;
  error=uc_mem_read(engine,item+0x10,&key,4);if(error)return error;if(key==checksum){*result=item;return UC_ERR_OK;}
  error=uc_mem_read(engine,node,&node,4);if(error)return error;
 }return UC_ERR_OK;
}

/* Original Variant::Mark (ARM 0x3eaa04). Complex marks remain original guest
 * functions, reached through BX r12 with the original LR (a tail call).
 */
int ou_guest_variant_mark(uc_engine *engine,uint32_t variant,uint32_t function_mark,uint32_t module_mark,uint32_t thread_mark,uint32_t *out){
 uint32_t fields[2],object=0,handle=0,one=1;int error=uc_mem_read(engine,variant,fields,8);if(error)return error;
 uint32_t kind=fields[0]&31u;out[0]=variant;out[1]=0;
 if(kind==5||kind==6||kind==7){error=uc_mem_read(engine,fields[1],&object,4);if(error)return error;
  if(kind==7){out[0]=object;out[1]=function_mark;return UC_ERR_OK;}
  error=uc_mem_write(engine,object+0x18,&one,4);if(error)return error;
  if(kind==6){error=uc_mem_read(engine,object+8,&handle,4);if(error)return error;error=uc_mem_read(engine,handle,&object,4);if(error)return error;error=uc_mem_write(engine,object+0x18,&one,4);}
  return error;
 }
 if(kind==15||kind==16){out[0]=fields[1];out[1]=kind==15?module_mark:thread_mark;return UC_ERR_OK;}
 if((fields[0]&0x1000u)&&fields[1]){uint32_t vtable=0;error=uc_mem_read(engine,fields[1],&object,4);if(error)return error;error=uc_mem_read(engine,object,&vtable,4);if(error)return error;error=uc_mem_read(engine,vtable+0x10,&out[1],4);if(error)return error;out[0]=object;}
 return UC_ERR_OK;
}

/* Share a stable WASM allocation with Unicorn; the caller owns its lifetime. */
uint32_t ou_memory_map(uc_engine *engine,uint32_t address,uint32_t size){
 void *memory=calloc(1,size);if(!memory)return 0;
 if(uc_mem_map_ptr(engine,address,size,UC_PROT_ALL,memory)!=UC_ERR_OK){free(memory);return 0;}
 return (uint32_t)(uintptr_t)memory;
}

int ou_memory_sync_code(uc_engine *engine,uint32_t address,uint32_t size){
 return uc_ctl_remove_cache(engine,(uint64_t)address,(uint64_t)address+size);
}

/* The original timer reads before its duration array for ShutdownType::None (-1).
 * That reads the bits of 1.0f, overflows minutes*60, and becomes a positive
 * ~63-year countdown on present-day clocks. An open restaurant has no timer.
 * All real shutdown types continue through the untouched original ARM body.
 */
static void shutdown_guard(uc_engine *engine,uint64_t address,uint32_t size,void *opaque){
 (void)address;(void)size;(void)opaque;uint32_t type=0;
 if(uc_reg_read(engine,UC_ARM_REG_R2,&type)!=UC_ERR_OK||type!=UINT32_MAX)return;
 uint32_t link=0,flags=0,result=0;uc_reg_read(engine,UC_ARM_REG_LR,&link);uc_reg_read(engine,UC_ARM_REG_CPSR,&flags);
 uint32_t target=link&~1u;flags=(flags&~32u)|((link&1u)?32u:0u);
 uc_reg_write(engine,UC_ARM_REG_R0,&result);uc_reg_write(engine,UC_ARM_REG_PC,&target);uc_reg_write(engine,UC_ARM_REG_CPSR,&flags);uc_emu_stop(engine);
}
uint32_t ou_shutdown_guard_create(uc_engine *engine,uint32_t address){
 uc_hook hook=0;if(uc_hook_add(engine,&hook,UC_HOOK_CODE,shutdown_guard,NULL,address,address)!=UC_ERR_OK)return 0;
 return (uint32_t)hook;
}

/* Queue void GLES calls while the CPU executes ordinary BX LR import stubs.
 * Pointer arguments are copied before the original program can reuse them.
 * The browser drains the queue before every synchronous host call and yield.
 */
#include <string.h>
typedef struct { uint32_t valid,argc,pointer_arg,bytes_per_count; } OUGLBinding;
typedef struct {
 uc_engine *engine;uc_hook hook;uint8_t *bytes;uint32_t used,error,enabled,base,calls;
 OUGLBinding bindings[256];
} OUGLBatch;
#define OU_GL_CAPACITY (2u*1024u*1024u)
static void gl_batch_callback(uc_engine *engine,uint64_t address,uint32_t instruction_size,void *opaque){
 OUGLBatch *batch=opaque;(void)instruction_size;if(!batch->enabled)return;
 uint32_t id=((uint32_t)address-batch->base)/4;if(id>=256||!batch->bindings[id].valid){batch->error=1;goto fail;}
 OUGLBinding binding=batch->bindings[id];uint32_t values[6]={0},stack=0;
 int registers[5]={UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_SP};
 void *outputs[5]={values,values+1,values+2,values+3,&stack};
 if(uc_reg_read_batch(engine,registers,outputs,5)!=UC_ERR_OK){batch->error=2;goto fail;}
 if(binding.argc>4&&uc_mem_read(engine,stack,values+4,(binding.argc-4)*4)!=UC_ERR_OK){batch->error=3;goto fail;}
 uint64_t payload64=binding.bytes_per_count?(uint64_t)values[1]*binding.bytes_per_count:0;
 if(payload64>OU_GL_CAPACITY-44){batch->error=4;goto fail;}
 uint32_t payload=(uint32_t)payload64,size=44+((payload+3)&~3u);
 if(size>OU_GL_CAPACITY-batch->used){batch->error=5;goto fail;}
 uint32_t *record=(uint32_t *)(batch->bytes+batch->used);record[0]=id;record[1]=binding.argc;record[2]=binding.pointer_arg;record[3]=binding.bytes_per_count?values[binding.pointer_arg]:0;record[4]=payload;memcpy(record+5,values,24);
 if(payload&&uc_mem_read(engine,record[3],record+11,payload)!=UC_ERR_OK){batch->error=6;goto fail;}
 batch->used+=size;batch->calls++;values[0]=0;uc_reg_write(engine,UC_ARM_REG_R0,values);
 /* Do not change PC or stop the CPU: the original BX LR instruction returns. */
 return;
fail:uc_emu_stop(engine);
}
OUGLBatch *ou_gl_batch_create(uc_engine *engine,uint32_t base){
 OUGLBatch *batch=calloc(1,sizeof(*batch));if(!batch)return NULL;batch->bytes=malloc(OU_GL_CAPACITY);if(!batch->bytes){free(batch);return NULL;}
 batch->engine=engine;batch->base=base;batch->enabled=1;
 if(uc_hook_add(engine,&batch->hook,UC_HOOK_CODE,gl_batch_callback,batch,base,base+1023)!=UC_ERR_OK){free(batch->bytes);free(batch);return NULL;}return batch;
}
int ou_gl_batch_bind(OUGLBatch *batch,uint32_t id,uint32_t argc,uint32_t pointer_arg,uint32_t bytes_per_count){
 if(id>=256||argc>6||(bytes_per_count&&pointer_arg>=argc))return 1;batch->bindings[id]=(OUGLBinding){1,argc,pointer_arg,bytes_per_count};return 0;
}
uint32_t ou_gl_batch_buffer(OUGLBatch *batch){return (uint32_t)(uintptr_t)batch->bytes;}
int ou_gl_batch_size(OUGLBatch *batch){return batch->error?-(int)batch->error:(int)batch->used;}
void ou_gl_batch_clear(OUGLBatch *batch){batch->used=0;batch->error=0;}
void ou_gl_batch_enable(OUGLBatch *batch,uint32_t enabled){batch->enabled=enabled;}
uint32_t ou_gl_batch_calls(OUGLBatch *batch){return batch->calls;}
void ou_gl_batch_destroy(OUGLBatch *batch){uc_hook_del(batch->engine,batch->hook);free(batch->bytes);free(batch);}

/* Original ArrayObject/Assoc::ClearItem only zeros their Variant entries.
 * Preserve unknown virtual getters by returning to the original prologue. */
int ou_guest_clear_item(uc_engine *engine,uint32_t object,uint32_t array,const uint32_t getters[5],uint32_t *fallback){
 uint32_t count=0,table=object+0x20;int error;*fallback=0;
 if(!array){uint32_t vt=0,getter=0;if((error=uc_mem_read(engine,object,&vt,4)))return error;if((error=uc_mem_read(engine,vt+0x70,&getter,4)))return error;uint32_t offset=0;for(uint32_t i=0;i<5;i++)if(getter==getters[i]){offset=i==3?0x24:i==4?0x2c:0x20;break;}if(!offset){*fallback=1;return 0;}table=object+offset;}
 if((error=uc_mem_read(engine,object+(array?0x18:0x1c),&count,4)))return error;
 if((int32_t)count<=0)return 0;if(count>1048576)return UC_ERR_ARG;
 uint32_t bytes=count*(array?8:16);uint8_t zero[1024]={0};
 while(bytes){uint32_t size=bytes>sizeof(zero)?sizeof(zero):bytes;if((error=uc_mem_write(engine,table,zero,size)))return error;table+=size;bytes-=size;}return 0;
}

extern int ou_guest_heap_insert(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t *);
extern int ou_guest_heap_free(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t *);
/* The verified C ports return through an actual ARM BX LR stub as well. */
typedef struct {uc_engine *engine;uc_hook hook;OUGC *gc;OUGfxConstants *gfx;uint32_t base,error,enabled,font_calls,audio_calls,animation_calls,camera_calls,variant_calls,function_mark,module_mark,thread_mark,sweep_fallback,clear_bindings[6],clear_calls,heap_fallback[2],heap_calls,string_calls,menu_calls,menu_find_calls,heap_alloc_fallback,heap_alloc_calls,variant_eq_calls,assoc_find_calls;} OUHotNative;
static void hot_native_callback(uc_engine *engine,uint64_t address,uint32_t instruction_size,void *opaque){
 OUHotNative *hot=opaque;(void)instruction_size;if(!hot->enabled)return;uint32_t values[4]={0};int registers[4]={UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3};void *outputs[4]={values,values+1,values+2,values+3};
 if(uc_reg_read_batch(engine,registers,outputs,4)!=UC_ERR_OK){hot->error=1;goto fail;}
 if((uint32_t)address==hot->base){int result=ou_guest_font_char_index(engine,values[0],values[1]);if(result<0){hot->error=(uint32_t)-result;goto fail;}values[0]=(uint32_t)result;hot->font_calls++;}
 else if((uint32_t)address==hot->base+4){int error=ou_guest_adpcm_mix(engine,values[0],values[1],(int32_t)values[2],(int32_t)values[3]);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=0;hot->audio_calls++;}
 else if((uint32_t)address==hot->base+8){uint32_t result=0;int error=ou_guest_animation_index(engine,values[0],values[1],&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;hot->animation_calls++;}
 else if((uint32_t)address==hot->base+12){uint32_t result=0;int error=ou_guest_find_camera(engine,values[0],values[1],&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;hot->camera_calls++;}
 else if((uint32_t)address==hot->base+16){uint32_t out[2]={0},target=0;int error=ou_guest_variant_mark(engine,values[0],hot->function_mark,hot->module_mark,hot->thread_mark,out);if(error){hot->error=(uint32_t)error;goto fail;}if(out[1]){target=out[1];values[0]=out[0];}else if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->variant_calls++;}
 else if(((uint32_t)address>=hot->base+20&&(uint32_t)address<=hot->base+24)||(uint32_t)address==hot->base+0x3fc){int error=(uint32_t)address==hot->base+0x3fc?ou_gc_continue(hot->gc):ou_gc_enter(hot->gc,values[0],(uint32_t)address==hot->base+24?1:2);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+28||(uint32_t)address==hot->base+32){int error=ou_gc_enter(hot->gc,values[0],(uint32_t)address==hot->base+28?3:4);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+36){uint32_t flags=0,target=hot->sweep_fallback;int error=uc_mem_read(engine,values[1]+0x14,&flags,4);if(error){hot->error=(uint32_t)error;goto fail;}if(flags&0x820u){uint32_t zero=0;flags&=~0x20u;error=uc_mem_write(engine,values[1]+0x14,&flags,4);if(!error)error=uc_mem_write(engine,values[0],&zero,4);if(!error)error=uc_reg_read(engine,UC_ARM_REG_LR,&target);if(error){hot->error=(uint32_t)error;goto fail;}}if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}return;}
 else if((uint32_t)address==hot->base+40){int error=ou_gc_enter(hot->gc,values[0],5);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+44||(uint32_t)address==hot->base+0x3f8){int error=(uint32_t)address==hot->base+44?ou_gfx_constants_enter(hot->gfx,values[0]):ou_gfx_constants_continue(hot->gfx);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+48||(uint32_t)address==hot->base+52){uint32_t fallback=0,target=0;int error=ou_guest_clear_item(engine,values[0],(uint32_t)address==hot->base+48,hot->clear_bindings,&fallback);if(error){hot->error=(uint32_t)error;goto fail;}if(fallback)target=hot->clear_bindings[5];else if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->clear_calls++;return;}
 else if((uint32_t)address>=hot->base+56&&(uint32_t)address<=hot->base+72){uint32_t id=((uint32_t)address-hot->base-56)/4,kind=id<2?0:id-1,target=0;int error=ou_gfx_constants_pure(hot->gfx,kind,values);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+76||(uint32_t)address==hot->base+80){uint32_t handled=0,target=0,id=(uint32_t)address==hot->base+80;int error=id?ou_guest_heap_free(engine,values[0],values[1],values[2],&handled):ou_guest_heap_insert(engine,values[0],values[1],values[2],values[3],&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(!handled)target=hot->heap_fallback[id];else if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->heap_calls++;return;}
 else if((uint32_t)address>=hot->base+84&&(uint32_t)address<=hot->base+92){int error=ou_gc_enter(hot->gc,values[0],6+((uint32_t)address-hot->base-84)/4);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address>=hot->base+96&&(uint32_t)address<=hot->base+112){uint32_t result=0,target=0;extern int ou_guest_string_op(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t *);int error=ou_guest_string_op(engine,((uint32_t)address-hot->base-96)/4,values[0],values[1],values[2],&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->string_calls++;}
 else if((uint32_t)address==hot->base+116||(uint32_t)address==hot->base+120){int error=ou_gc_enter(hot->gc,values[0],(uint32_t)address==hot->base+116?9:10);if(error){hot->error=(uint32_t)error;goto fail;}hot->menu_calls++;return;}
 else if((uint32_t)address==hot->base+124||(uint32_t)address==hot->base+128){uint32_t target=0;int error=ou_gfx_constants_pure(hot->gfx,(uint32_t)address==hot->base+124?4:5,values);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+132){int error=ou_gfx_state_tail(hot->gfx,0,values);if(error){hot->error=(uint32_t)error;goto fail;}}
 else if((uint32_t)address==hot->base+136){int error=ou_gfx_state_texture(hot->gfx,values);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+140){int error=ou_menu_find(hot->gc,values[0],values[1],values[2]);if(error){hot->error=(uint32_t)error;goto fail;}hot->menu_find_calls++;return;}
 else if((uint32_t)address==hot->base+144){uint32_t result=0,handled=0,target=0;extern int ou_guest_heap_alloc(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t *,uint32_t *);int error=ou_guest_heap_alloc(engine,values[0],values[1],values[2],&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}}else target=hot->heap_alloc_fallback;if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->heap_alloc_calls++;}
 else if((uint32_t)address==hot->base+148){uint32_t result=0,target=0;extern int ou_guest_variant_equal(uc_engine *,uint32_t,uint32_t,uint32_t *);int error=ou_guest_variant_equal(engine,values[0],values[1],&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->variant_eq_calls++;}
 else if((uint32_t)address==hot->base+152){int error=ou_assoc_find(hot->gc,values[0],values[1],values[2]);if(error){hot->error=(uint32_t)error;goto fail;}hot->assoc_find_calls++;return;}
 else{hot->error=UC_ERR_ARG;goto fail;}
 uc_reg_write(engine,UC_ARM_REG_R0,values);return;
fail:uc_emu_stop(engine);
}
OUHotNative *ou_hot_native_create(uc_engine *engine,uint32_t base){
 OUHotNative *hot=calloc(1,sizeof(*hot));if(!hot)return NULL;hot->engine=engine;hot->base=base;hot->enabled=1;
 if(uc_hook_add(engine,&hot->hook,UC_HOOK_CODE,hot_native_callback,hot,base,base+0x3ff)!=UC_ERR_OK){free(hot);return NULL;}return hot;
}
uint32_t ou_hot_native_error(OUHotNative *hot){return hot->error;}
uint32_t ou_hot_native_count(OUHotNative *hot,uint32_t audio){return audio==0?hot->font_calls:audio==1?hot->audio_calls:audio==2?hot->animation_calls:audio==3?hot->camera_calls:hot->variant_calls;}
void ou_hot_native_enable(OUHotNative *hot,uint32_t enabled){hot->enabled=enabled;}
void ou_hot_native_destroy(OUHotNative *hot){ou_gc_destroy(hot->gc);ou_gfx_constants_destroy(hot->gfx);uc_hook_del(hot->engine,hot->hook);free(hot);}

void ou_hot_native_cvm(OUHotNative *hot,uint32_t function_mark,uint32_t module_mark,uint32_t thread_mark){hot->function_mark=function_mark;hot->module_mark=module_mark;hot->thread_mark=thread_mark;}

int ou_hot_native_gc_bind(OUHotNative *hot,const uint32_t *bindings){ou_gc_destroy(hot->gc);hot->gc=ou_gc_create(hot->engine,bindings,hot->base+0x3fc);return hot->gc?0:UC_ERR_NOMEM;}
uint32_t ou_hot_native_gc_count(OUHotNative *hot,uint32_t index){return ou_gc_count(hot->gc,index);}

uint32_t ou_hot_native_gc_version(void){return 2;}
void ou_hot_native_bank_bind(OUHotNative *hot,uint32_t fallback){hot->sweep_fallback=fallback;}

void ou_hot_native_machine_bind(OUHotNative *hot,const uint32_t callbacks[16]){ou_gc_bind_machine(hot->gc,callbacks);}

double ou_hot_native_gc_phase_ms(OUHotNative *hot,uint32_t index,uint32_t maximum){return ou_gc_phase_ms(hot->gc,index,maximum);}
void ou_hot_native_gc_phase_reset(OUHotNative *hot){ou_gc_phase_reset(hot->gc);}

int ou_hot_native_gfx_bind(OUHotNative *hot,const uint32_t bindings[6]){ou_gfx_constants_destroy(hot->gfx);hot->gfx=ou_gfx_constants_create(hot->engine,hot->base+0x3f8,bindings);return hot->gfx?0:UC_ERR_NOMEM;}
uint32_t ou_hot_native_gfx_count(OUHotNative *hot){return ou_gfx_constants_count(hot->gfx);}

void ou_hot_native_clear_bind(OUHotNative *hot,const uint32_t bindings[6]){memcpy(hot->clear_bindings,bindings,sizeof(hot->clear_bindings));}
uint32_t ou_hot_native_clear_count(OUHotNative *hot){return hot->clear_calls;}

uint32_t ou_hot_native_render_version(void){return 1;}

void ou_hot_native_heap_bind(OUHotNative *hot,uint32_t insert,uint32_t release){hot->heap_fallback[0]=insert;hot->heap_fallback[1]=release;}
uint32_t ou_hot_native_heap_count(OUHotNative *hot){return hot->heap_calls;}

void ou_hot_native_script_marks_bind(OUHotNative *hot,const uint32_t iterators[4]){ou_gc_bind_script_marks(hot->gc,iterators);}
void ou_hot_native_script_marks_enable(OUHotNative *hot,uint32_t enabled){ou_gc_script_marks_enable(hot->gc,enabled);}

uint32_t ou_hot_native_strings_version(void){return 1;}
uint32_t ou_hot_native_string_count(OUHotNative *hot){return hot->string_calls;}
void ou_hot_native_menu_bind(OUHotNative *hot,const uint32_t targets[2]){ou_gc_bind_menu_marks(hot->gc,targets);}

void ou_hot_native_render_state_bind(OUHotNative *hot,const uint32_t targets[5]){ou_gfx_state_bind(hot->gfx,targets);}
uint32_t ou_hot_native_render_state_count(OUHotNative *hot,uint32_t active){return ou_gfx_state_count(hot->gfx,active);}

void ou_hot_native_menu_find_bind(OUHotNative *hot,const uint32_t targets[2]){ou_gc_bind_menu_find(hot->gc,targets);}
uint32_t ou_hot_native_menu_find_count(OUHotNative *hot){return hot->menu_find_calls;}

void ou_hot_native_heap_alloc_bind(OUHotNative *hot,uint32_t target){hot->heap_alloc_fallback=target;}
uint32_t ou_hot_native_heap_alloc_count(OUHotNative *hot){return hot->heap_alloc_calls;}

uint32_t ou_hot_native_variant_eq_version(void){return 1;}
uint32_t ou_hot_native_variant_eq_count(OUHotNative *hot,uint32_t lookup){return lookup?hot->assoc_find_calls:hot->variant_eq_calls;}
