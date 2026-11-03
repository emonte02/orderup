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

OUBudget *ou_budget_create(uc_engine *engine) {
    OUBudget *budget = calloc(1, sizeof(*budget));
    if (!budget) return NULL;
    budget->engine = engine;
    budget->deadline = 1e300;
    if (uc_hook_add(engine, &budget->hook, UC_HOOK_BLOCK,
                    budget_callback, budget, 1, 0) != UC_ERR_OK) {
        free(budget);
        return NULL;
    }
    return budget;
}
void ou_budget_begin(OUBudget *budget, double milliseconds) {
    budget->deadline = emscripten_get_now() + milliseconds;
}
uint32_t ou_budget_blocks(OUBudget *budget) { return budget->blocks; }
uint32_t ou_budget_stops(OUBudget *budget) { return budget->stops; }
void ou_budget_destroy(OUBudget *budget) {
    uc_hook_del(budget->engine, budget->hook);
    free(budget);
}

#include "ou_hot.h"
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

/* The verified C ports return through an actual ARM BX LR stub as well. */
typedef struct {uc_engine *engine;uc_hook hook;uint32_t base,error,enabled,font_calls,audio_calls;} OUHotNative;
static void hot_native_callback(uc_engine *engine,uint64_t address,uint32_t instruction_size,void *opaque){
 OUHotNative *hot=opaque;(void)instruction_size;if(!hot->enabled)return;uint32_t values[4]={0};int registers[4]={UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3};void *outputs[4]={values,values+1,values+2,values+3};
 if(uc_reg_read_batch(engine,registers,outputs,4)!=UC_ERR_OK){hot->error=1;goto fail;}
 if((uint32_t)address==hot->base){int result=ou_guest_font_char_index(engine,values[0],values[1]);if(result<0){hot->error=(uint32_t)-result;goto fail;}values[0]=(uint32_t)result;hot->font_calls++;}
 else{int error=ou_guest_adpcm_mix(engine,values[0],values[1],(int32_t)values[2],(int32_t)values[3]);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=0;hot->audio_calls++;}
 uc_reg_write(engine,UC_ARM_REG_R0,values);return;
fail:uc_emu_stop(engine);
}
OUHotNative *ou_hot_native_create(uc_engine *engine,uint32_t base){
 OUHotNative *hot=calloc(1,sizeof(*hot));if(!hot)return NULL;hot->engine=engine;hot->base=base;hot->enabled=1;
 if(uc_hook_add(engine,&hot->hook,UC_HOOK_CODE,hot_native_callback,hot,base,base+7)!=UC_ERR_OK){free(hot);return NULL;}return hot;
}
uint32_t ou_hot_native_error(OUHotNative *hot){return hot->error;}
uint32_t ou_hot_native_count(OUHotNative *hot,uint32_t audio){return audio?hot->audio_calls:hot->font_calls;}
void ou_hot_native_enable(OUHotNative *hot,uint32_t enabled){hot->enabled=enabled;}
void ou_hot_native_destroy(OUHotNative *hot){uc_hook_del(hot->engine,hot->hook);free(hot);}
