/* Host helpers and compatibility guards for the pinned Unicorn WASM engine. */
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <stdlib.h>
#include "ou_font.h"
#include "ou_gl_batch.h"

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
/* Guard unusual/aliased calls before any output mutation; execute their ARM
 * entry trampoline. These frame decoders operate on ordinary guest RAM. */
static int ou_guest_adpcm_frame(uc_engine *engine,const uint32_t args[5],uint32_t mode,uint32_t *handled){
 *handled=0;const int samples=(int32_t)args[mode==0?2:mode==1?3:4];if(samples<0||samples>1048576)return 0;
 const size_t input_size=(unsigned)samples/2+3,output_size=((unsigned)samples/2)*(mode==2?8:4);
 const uint64_t input_end=(uint64_t)args[0]+input_size,output_end=(uint64_t)args[1]+output_size;
 if(input_end>0x100000000ull||output_end>0x100000000ull||(output_size&&(uint64_t)args[0]<output_end&&(uint64_t)args[1]<input_end))return 0;
 uint8_t header[3];int error=uc_mem_read(engine,args[0],header,3);if(error)return error;if(header[2]>88)return 0;
 uint8_t *input=malloc(input_size);int16_t *output=malloc(output_size?output_size:2);if(!input||!output){free(input);free(output);return UC_ERR_NOMEM;}
 error=uc_mem_read(engine,args[0],input,input_size);if(!error&&mode==2&&output_size)error=uc_mem_read(engine,args[1],output,output_size);
 if(!error&&ou_decode_mono_adpcm_frame(input,output,(int32_t)args[2],(int32_t)args[3],samples,mode))error=UC_ERR_ARG;
 if(!error&&output_size)error=uc_mem_write(engine,args[1],output,output_size);free(input);free(output);if(!error)*handled=1;return error;
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
struct OUGLBatch {
 uc_engine *engine;uc_hook hook;uint8_t *bytes;uint32_t used,error,enabled,base,calls;
 OUGLBinding bindings[256];
};
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

int ou_gl_batch_attribute_plan(OUGLBatch *b,const uint32_t targets[3],uint32_t ids[3],uint32_t count){
 if(!b||!b->enabled||b->error||count>(OU_GL_CAPACITY-b->used)/44)return 0;
 for(unsigned i=0;i<3;i++){if(targets[i]<b->base||(targets[i]-b->base)%4)return 0;uint32_t id=(targets[i]-b->base)/4;if(id>=256)return 0;OUGLBinding v=b->bindings[id];if(!v.valid||v.argc!=(i==2?6:1)||v.bytes_per_count||v.pointer_arg)return 0;ids[i]=id;}return 1;
}
int ou_gl_batch_append_void(OUGLBatch *b,uint32_t id,const uint32_t args[6]){if(!b||!b->enabled||id>=256||!b->bindings[id].valid||b->bindings[id].bytes_per_count||b->used>OU_GL_CAPACITY-44)return UC_ERR_ARG;uint32_t *record=(uint32_t *)(b->bytes+b->used);record[0]=id;record[1]=b->bindings[id].argc;record[2]=record[3]=record[4]=0;memcpy(record+5,args,24);b->used+=44;b->calls++;return 0;}

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

/* Preserve the parser's write-before-read order, including aliased length
 * outputs. Wide markup accepts a-f colors; narrow markup accepts digits. */
static int font_unit(uc_engine *engine,uint32_t address,uint32_t wide,uint32_t *out){
 *out=0;return uc_mem_read(engine,address,out,wide?4:1);
}
static int ou_guest_font_kind(uc_engine *engine,uint32_t text,uint32_t length,uint32_t wide,uint32_t *result){
 uint32_t zero=0,a=0,b=0,c=0,d=0,n=0;int error=uc_mem_write(engine,length,&zero,4);*result=0;if(error)return error;
 if((error=font_unit(engine,text,wide,&a)))return error;
 if(a==10||a==13){n=1;*result=3;return uc_mem_write(engine,length,&n,4);}
 if(!a)return 0;if((error=font_unit(engine,text+(wide?4:1),wide,&b)))return error;
 if(!b||a!=47)return 0;
 if(b!=99&&b!=98)return 0;if((error=font_unit(engine,text+(wide?8:2),wide,&c)))return error;
 uint32_t digit=wide?c-48:(uint8_t)(c-48);
 if(b==99){if(digit<10||(wide&&c-97<6)){n=3;*result=2;return uc_mem_write(engine,length,&n,4);}return 0;}
 if(digit>=10)return 0;if((error=font_unit(engine,text+(wide?12:3),wide,&d)))return error;
 n=(wide?d-48:(uint8_t)(d-48))<10?4:3;*result=1;return uc_mem_write(engine,length,&n,4);
}
static int ou_guest_font_kern(uc_engine *engine,uint32_t font,uint32_t first,uint32_t second,uint32_t *result){
 uint16_t last=0;uint32_t table=0;int8_t value=0;int error=uc_mem_read(engine,font+24,&last,2);*result=0;if(error)return error;
 if(second<last){if((error=uc_mem_read(engine,font+0x11c,&table,4)))return error;if(table){if((error=uc_mem_read(engine,table+second,&value,1)))return error;*result=(uint32_t)(int32_t)value;}}
 if(first<last){if((error=uc_mem_read(engine,font+0x118,&table,4)))return error;if(table){if((error=uc_mem_read(engine,table+first,&value,1)))return error;*result+=(uint32_t)(int32_t)value;}}return 0;
}

/* The verified C ports return through an actual ARM BX LR stub as well. */
typedef struct {uc_engine *engine;uc_hook hook;OUGC *gc;OUGfxConstants *gfx;uint32_t base,error,enabled,font_calls,audio_calls,animation_calls,camera_calls,variant_calls,function_mark,module_mark,thread_mark,sweep_fallback,clear_bindings[6],clear_calls,heap_fallback[2],heap_calls,string_calls,menu_calls,menu_find_calls,heap_alloc_fallback,heap_alloc_calls,variant_eq_calls,assoc_find_calls,audio_frame_fallback[3],audio_frame_calls;uint32_t font_glyph_enabled,font_glyph_resume,font_glyph_fallback,font_glyph_calls,font_text_calls,font_layout_targets[5],font_layout_calls,script_lookup[8],script_value_calls,ident_calls,gesture_crc_calls,variant_ref_calls,crypto_fallback[13],crypto_calls,memmanager_fallback,memmanager_calls,value_helper_calls,array_copy_resume,array_copy_fallback,array_copy_calls,array_copy_items,pose_fallback,pose_calls,pose_bones,bbox_fallback,bbox_calls,digest_calls,digest_fallback,assoc_set_fallback,assoc_set_calls,bone_matrix_resume,bone_matrix_fallback,bone_matrix_calls,bone_matrix_copies,mesh_cache_slot,mesh_targets[3],mesh_fallback,mesh_calls,cipher_chain_targets[17],cipher_chain_calls,assoc_merge_fallback,assoc_merge_calls,assoc_merge_items,dynamic_vertex_targets[5],dynamic_vertex_calls,dynamic_vertices,cleanup_targets[5],cleanup_calls,cleanup_vertices,dynamic_bounds_resume,dynamic_bounds_fallback,dynamic_bounds_calls,dynamic_bounds_vertices,animation_targets[6],animation_calls_native[4],region_targets[3],region_calls[3],bytecode_targets[5],bytecode_calls,material_targets[7],material_calls,material_iterations,math_targets[8],math_calls[8],asset_targets[6],asset_calls[5],blackout_targets[2],blackout_calls[2],hash_index_fallback,hash_index_calls;OUGLBatch *mesh_batch;} OUHotNative;
static void font_glyph_vertices(uc_engine *,OUHotNative *);
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
 else if((uint32_t)address>=hot->base+156&&(uint32_t)address<=hot->base+164){uint32_t mode=((uint32_t)address-hot->base-156)/4,args[5]={values[0],values[1],values[2],values[3],0},handled=0,target=0;int error=0;if(mode==2){uint32_t stack=0;error=uc_reg_read(engine,UC_ARM_REG_SP,&stack);if(!error)error=uc_mem_read(engine,stack,args+4,4);}if(!error)error=ou_guest_adpcm_frame(engine,args,mode,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=0;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}}else target=hot->audio_frame_fallback[mode];if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}hot->audio_frame_calls++;}
 else if((uint32_t)address==hot->base+168){int error=ou_gfx_matrix_enter(hot->gfx,values);if(error){hot->error=(uint32_t)error;goto fail;}return;}
 else if((uint32_t)address==hot->base+172){uint32_t target=0;int error=ou_gfx_matrix_value(hot->gfx,values[0],values[1]);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_read(engine,UC_ARM_REG_LR,&target)!=UC_ERR_OK||uc_reg_write(engine,UC_ARM_REG_R12,&target)!=UC_ERR_OK){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address>=hot->base+176&&(uint32_t)address<=hot->base+184){uint32_t target=0,result=0,index=((uint32_t)address-hot->base-176)/4;int error=index==2?ou_guest_font_kern(engine,values[0],values[1],values[2],&result):ou_guest_font_kind(engine,values[1],values[2],index,&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->font_text_calls++;}
 else if((uint32_t)address==hot->base+188){font_glyph_vertices(engine,hot);return;}
 else if((uint32_t)address==hot->base+192){uint32_t handled=0,target=hot->font_layout_targets[4];int error=hot->font_glyph_enabled?ou_font_layout(engine,hot->font_layout_targets,&handled):0;if(error){hot->error=(uint32_t)error;goto fail;}if(handled){target=hot->font_layout_targets[3];hot->font_layout_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}return;}
 else if((uint32_t)address==hot->base+196||(uint32_t)address==hot->base+200){extern int ou_guest_assoc_value(uc_engine *,const uint32_t[4],const uint32_t[5],uint32_t *);extern int ou_guest_ident_handle(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t *,uint32_t *);uint32_t index=(uint32_t)address==hot->base+200,handled=0,result=values[0],target=hot->script_lookup[index];int error=index?ou_guest_ident_handle(engine,values[0],values[1],hot->script_lookup[2],&result,&handled):ou_guest_assoc_value(engine,values,hot->script_lookup+3,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(index)hot->ident_calls++;else hot->script_value_calls++;}
 else if((uint32_t)address==hot->base+204){extern int ou_guest_string_op(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t *);uint32_t result=0,target=0;int error=ou_guest_string_op(engine,4,values[0],values[1],0,&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->gesture_crc_calls++;}
 else if((uint32_t)address>=hot->base+208&&(uint32_t)address<=hot->base+216){extern int ou_guest_variant_reference(uc_engine *,uint32_t,uint32_t,uint32_t *);uint32_t mode=((uint32_t)address-hot->base-208)/4,result=0,target=0;int error=ou_guest_variant_reference(engine,values[0],mode,&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->variant_ref_calls++;}
 else if((uint32_t)address>=hot->base+220&&(uint32_t)address<=hot->base+268){extern int ou_guest_crypto(uc_engine *,uint32_t,const uint32_t[4],uint32_t *,uint32_t *);uint32_t kind=((uint32_t)address-hot->base-220)/4,result=0,handled=0,target=hot->crypto_fallback[kind];int error=ou_guest_crypto(engine,kind,values,&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->crypto_calls++;}if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+272){extern int ou_guest_memmanager_alloc(uc_engine *,const uint32_t[4],uint32_t *,uint32_t *);uint32_t result=0,handled=0,target=hot->memmanager_fallback;int error=ou_guest_memmanager_alloc(engine,values,&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->memmanager_calls++;}if(!target||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+276){extern int ou_guest_memory_tag(uc_engine *,uint32_t,uint32_t *);uint32_t result=0,target=0;int error=ou_guest_memory_tag(engine,values[0],&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->memmanager_calls++;}
 else if((uint32_t)address>=hot->base+280&&(uint32_t)address<=hot->base+344){extern int ou_guest_value_helper(uc_engine *,uint32_t,const uint32_t[4],uint32_t *);uint32_t result=0,target=0;int error=ou_guest_value_helper(engine,((uint32_t)address-hot->base-280)/4,values,&result);if(error){hot->error=(uint32_t)error;goto fail;}values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)||uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->value_helper_calls++;}
 else if((uint32_t)address==hot->base+348){extern int ou_guest_array_copy_loop(uc_engine *,uint32_t *,uint32_t *);uint32_t finished=0,items=0,target=0;int error=ou_guest_array_copy_loop(engine,&finished,&items);if(error){hot->error=(uint32_t)error;goto fail;}target=finished?hot->array_copy_resume:hot->array_copy_fallback;if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(items){hot->array_copy_calls++;hot->array_copy_items+=items;}return;}
 else if((uint32_t)address==hot->base+352){extern int ou_guest_pose(uc_engine *,uint32_t,uint32_t,uint32_t *,uint32_t *,uint32_t *);uint32_t result=0,handled=0,bones=0,target=hot->pose_fallback;int error=ou_guest_pose(engine,values[0],values[1],&result,&handled,&bones);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->pose_calls++;hot->pose_bones+=bones;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+356){extern int ou_guest_bbox(uc_engine *,const uint32_t[4],uint32_t *);uint32_t handled=0,target=hot->bbox_fallback;int error=ou_guest_bbox(engine,values,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->bbox_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+360){extern int ou_guest_save_digest(uc_engine *,uint32_t,uint32_t,uint32_t *,uint32_t *);uint32_t result=0,handled=0,target=hot->digest_fallback;int error=ou_guest_save_digest(engine,values[0],values[1],&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->digest_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+364){extern int ou_guest_assoc_set(uc_engine *,const uint32_t[4],const uint32_t[5],uint32_t *);uint32_t handled=0,target=hot->assoc_set_fallback;int error=ou_guest_assoc_set(engine,values,hot->script_lookup+3,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->assoc_set_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+368){extern int ou_guest_bone_matrices(uc_engine *,const uint32_t[4],uint32_t *,uint32_t *);uint32_t handled=0,copied=0,target=0;int error=ou_guest_bone_matrices(engine,values,&handled,&copied);if(error){hot->error=(uint32_t)error;goto fail;}target=handled?hot->bone_matrix_resume:hot->bone_matrix_fallback;if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(handled){hot->bone_matrix_calls++;hot->bone_matrix_copies+=copied;}return;}
 else if((uint32_t)address==hot->base+372){extern int ou_guest_mesh_buffers(uc_engine *,OUGLBatch *,uint32_t,uint32_t,const uint32_t[3],uint32_t *);uint32_t handled=0,target=hot->mesh_fallback;int error=ou_guest_mesh_buffers(engine,hot->mesh_batch,values[0],hot->mesh_cache_slot,hot->mesh_targets,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=0;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->mesh_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+376){extern int ou_guest_cipher_chain(uc_engine *,uint32_t,uint32_t,const uint32_t[16],uint32_t *);uint32_t handled=0,target=hot->cipher_chain_targets[16];int error=ou_guest_cipher_chain(engine,values[0],values[1],hot->cipher_chain_targets,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=1;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->cipher_chain_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+380){extern int ou_guest_assoc_merge_loop(uc_engine *,const uint32_t[5],uint32_t *);uint32_t items=0,target=hot->assoc_merge_fallback;int error=ou_guest_assoc_merge_loop(engine,hot->script_lookup+3,&items);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(items){hot->assoc_merge_calls++;hot->assoc_merge_items+=items;}return;}
 else if((uint32_t)address==hot->base+384){extern int ou_guest_dynamic_vertices(uc_engine *,const uint32_t[3],uint32_t *,uint32_t *);uint32_t handled=0,copied=0,target=hot->dynamic_vertex_targets[4];int error=ou_guest_dynamic_vertices(engine,hot->dynamic_vertex_targets,&handled,&copied);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){target=hot->dynamic_vertex_targets[3];hot->dynamic_vertex_calls++;hot->dynamic_vertices+=copied;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}return;}
 else if((uint32_t)address==hot->base+388){extern int ou_guest_cleanup_vertices(uc_engine *,const uint32_t[5],uint32_t *,uint32_t *);uint32_t handled=0,copied=0,target=hot->cleanup_targets[3];int error=ou_guest_cleanup_vertices(engine,hot->cleanup_targets,&handled,&copied);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){target=hot->cleanup_targets[2];hot->cleanup_calls++;hot->cleanup_vertices+=copied;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}return;}
 else if((uint32_t)address==hot->base+392){extern int ou_guest_dynamic_bounds(uc_engine *,uint32_t *,uint32_t *);uint32_t handled=0,copied=0,target=hot->dynamic_bounds_fallback;int error=ou_guest_dynamic_bounds(engine,&handled,&copied);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){target=hot->dynamic_bounds_resume;hot->dynamic_bounds_calls++;hot->dynamic_bounds_vertices+=copied;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}return;}
 else if((uint32_t)address>=hot->base+396&&(uint32_t)address<=hot->base+408){extern int ou_guest_animation(uc_engine *,uint32_t,const uint32_t[4],const uint32_t[6],uint32_t *,uint32_t *);uint32_t kind=((uint32_t)address-hot->base-396)/4,result=0,handled=0,target=hot->animation_targets[kind];int error=ou_guest_animation(engine,kind,values,hot->animation_targets,&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->animation_calls_native[kind]++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address>=hot->base+412&&(uint32_t)address<=hot->base+420){extern int ou_guest_region(uc_engine *,uint32_t,uint32_t[4],uint32_t *);uint32_t kind=((uint32_t)address-hot->base-412)/4,handled=0,target=hot->region_targets[kind],working[4];memcpy(working,values,16);int error=ou_guest_region(engine,kind,working,&handled);if(handled)memcpy(values,working,16);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}if(kind&&(uc_reg_write(engine,UC_ARM_REG_R2,values+2)||uc_reg_write(engine,UC_ARM_REG_R3,values+3))){hot->error=UC_ERR_ARG;goto fail;}hot->region_calls[kind]++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+424){extern int ou_guest_bytecode_decode(uc_engine *,uint32_t[4],const uint32_t[5],uint32_t *,uint32_t *);uint32_t handled=0,target=hot->bytecode_targets[0];int error=ou_guest_bytecode_decode(engine,values,hot->bytecode_targets,&target,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(handled)hot->bytecode_calls++;return;}
 else if((uint32_t)address==hot->base+428){extern int ou_guest_material_zero_textures(uc_engine *,const uint32_t[7],uint32_t *,uint32_t *);uint32_t target=hot->material_targets[5],skipped=0;int error=ou_guest_material_zero_textures(engine,hot->material_targets,&target,&skipped);if(error){hot->error=(uint32_t)error;goto fail;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}if(skipped){hot->material_calls++;hot->material_iterations+=skipped;}return;}
 else if((uint32_t)address>=hot->base+432&&(uint32_t)address<=hot->base+460){extern int ou_guest_math(uint32_t,uint32_t,uint32_t *,uint32_t *);uint32_t kind=((uint32_t)address-hot->base-432)/4,result=0,handled=0,target=hot->math_targets[kind];int error=ou_guest_math(kind,values[0],&result,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){values[0]=result;if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->math_calls[kind]++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address>=hot->base+464&&(uint32_t)address<=hot->base+480){extern int ou_guest_asset_lookup(uc_engine *,uint32_t,uint32_t[4],uint32_t,uint32_t *);uint32_t kind=((uint32_t)address-hot->base-464)/4,handled=0,target=hot->asset_targets[kind],working[4],caller=0;memcpy(working,values,16);if(uc_reg_read(engine,UC_ARM_REG_LR,&caller)){hot->error=UC_ERR_ARG;goto fail;}int error=ou_guest_asset_lookup(engine,kind,working,hot->asset_targets[5],&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){memcpy(values,working,16);target=caller;hot->asset_calls[kind]++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address>=hot->base+484&&(uint32_t)address<=hot->base+488){extern int ou_guest_blackout(uc_engine *,uint32_t,uint32_t[4],uint32_t *);uint32_t kind=((uint32_t)address-hot->base-484)/4,handled=0,target=hot->blackout_targets[kind],working[4];memcpy(working,values,16);int error=ou_guest_blackout(engine,kind,working,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){memcpy(values,working,16);if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->blackout_calls[kind]++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
 else if((uint32_t)address==hot->base+492){extern int ou_guest_hash_index(uc_engine *,uint32_t[4],uint32_t *);uint32_t handled=0,target=hot->hash_index_fallback,working[4];memcpy(working,values,16);int error=ou_guest_hash_index(engine,working,&handled);if(error){hot->error=(uint32_t)error;goto fail;}if(handled){memcpy(values,working,16);if(uc_reg_read(engine,UC_ARM_REG_LR,&target)){hot->error=UC_ERR_ARG;goto fail;}hot->hash_index_calls++;}if(uc_reg_write(engine,UC_ARM_REG_R12,&target)){hot->error=UC_ERR_ARG;goto fail;}}
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

void ou_hot_native_audio_frames_bind(OUHotNative *hot,const uint32_t fallbacks[3]){memcpy(hot->audio_frame_fallback,fallbacks,12);}
uint32_t ou_hot_native_audio_frames_count(OUHotNative *hot){return hot->audio_frame_calls;}

void ou_hot_native_matrix_bind(OUHotNative *hot,const uint32_t targets[3]){ou_gfx_matrix_bind(hot->gfx,targets);}


/* Batch the original six glyph vertices. This block only copies float bits;
 * all original VFP arithmetic remains in ARM. Aliases stay in the original
 * instruction stream, preserving its sequential read/write behavior. */
static int font_overlaps(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>(uint64_t)b&&(uint64_t)b+m>(uint64_t)a;}
static void font_glyph_vertices(uc_engine *engine,OUHotNative *hot){
 uint32_t fallback=hot->font_glyph_fallback;uc_reg_write(engine,UC_ARM_REG_R12,&fallback);if(!hot->enabled||!hot->font_glyph_enabled)return;
 uint32_t font=0,index=0,sp=0,out=0,state[67],uv[4],uvaddr[4],xy[4],v[48];
 if(uc_reg_read(engine,UC_ARM_REG_R5,&font)||uc_reg_read(engine,UC_ARM_REG_R4,&index)||uc_reg_read(engine,UC_ARM_REG_SP,&sp))return;
 if(font&3||uc_mem_read(engine,sp+0x20,&out,4)||out&3||(uint64_t)out+192>0x100000000ull)return;
 if(font_overlaps(out,192,font,sizeof(state))||font_overlaps(out,192,sp+0x20,4))return;
 if(uc_mem_read(engine,font,state,sizeof(state)))return;
 for(unsigned i=0;i<4;i++){uvaddr[i]=state[10+i]+index*4;if(uvaddr[i]&3||font_overlaps(out,192,uvaddr[i],4)||uc_mem_read(engine,uvaddr[i],uv+i,4))return;}
 int sr[4]={UC_ARM_REG_S17,UC_ARM_REG_S18,UC_ARM_REG_S19,UC_ARM_REG_S20};void *ps[4]={xy,xy+1,xy+2,xy+3};if(uc_reg_read_batch(engine,sr,ps,4))return;
 uint32_t probe[48];if(uc_mem_read(engine,out,probe,sizeof(probe)))return;
 const unsigned x[6]={0,0,3,0,3,3},y[6]={1,2,1,2,2,1},u[6]={0,0,1,0,1,1},t[6]={2,3,2,3,3,2};
 for(unsigned i=0;i<6;i++){uint32_t *q=v+i*8;q[0]=xy[x[i]];q[1]=xy[y[i]];q[2]=uv[u[i]];q[3]=uv[t[i]];memcpy(q+4,state+63,16);}
 if(uc_mem_write(engine,out,v,sizeof(v)))return;uint32_t next=out+192;if(uc_mem_write(engine,sp+0x20,&next,4))return;
 int ids[8]={UC_ARM_REG_R0,UC_ARM_REG_R1,UC_ARM_REG_R2,UC_ARM_REG_R3,UC_ARM_REG_R10,UC_ARM_REG_R12,UC_ARM_REG_LR,UC_ARM_REG_S15};
 uint32_t values[8]={font,uvaddr[1],out+96,out+128,uvaddr[2],hot->font_glyph_resume,uvaddr[3],uv[2]};void *p[8];for(unsigned i=0;i<8;i++)p[i]=values+i;uc_reg_write_batch(engine,ids,p,8);hot->font_glyph_calls++;
}
uint32_t ou_hot_native_font_version(void){return 3;}
void ou_hot_native_font_glyph_bind(OUHotNative *hot,uint32_t resume,uint32_t fallback){hot->font_glyph_resume=resume;hot->font_glyph_fallback=fallback;hot->font_glyph_enabled=1;}
void ou_hot_native_font_enable(OUHotNative *hot,uint32_t enabled){hot->font_glyph_enabled=enabled;}
uint32_t ou_hot_native_font_count(OUHotNative *hot,uint32_t glyph){return glyph==2?hot->font_layout_calls:glyph?hot->font_glyph_calls:hot->font_text_calls;}

void ou_hot_native_font_layout_bind(OUHotNative *hot,const uint32_t targets[5]){memcpy(hot->font_layout_targets,targets,20);}

void ou_hot_native_script_lookup_bind(OUHotNative *hot,const uint32_t targets[8]){memcpy(hot->script_lookup,targets,32);}
uint32_t ou_hot_native_script_lookup_count(OUHotNative *hot,uint32_t index){return index==0?hot->script_value_calls:index==1?hot->ident_calls:hot->gesture_crc_calls;}

uint32_t ou_hot_native_variant_refs_version(void){return 1;}
uint32_t ou_hot_native_variant_refs_count(OUHotNative *hot){return hot->variant_ref_calls;}

void ou_hot_native_crypto_bind(OUHotNative *hot,const uint32_t targets[13]){memcpy(hot->crypto_fallback,targets,52);}
uint32_t ou_hot_native_crypto_count(OUHotNative *hot){return hot->crypto_calls;}

void ou_hot_native_memmanager_bind(OUHotNative *hot,uint32_t fallback){hot->memmanager_fallback=fallback;}
uint32_t ou_hot_native_memmanager_count(OUHotNative *hot){return hot->memmanager_calls;}

uint32_t ou_hot_native_value_helpers_version(void){return 1;}
uint32_t ou_hot_native_value_helpers_count(OUHotNative *hot){return hot->value_helper_calls;}


void ou_hot_native_array_copy_bind(OUHotNative *hot,uint32_t resume,uint32_t fallback){hot->array_copy_resume=resume;hot->array_copy_fallback=fallback;}
uint32_t ou_hot_native_array_copy_count(OUHotNative *hot,uint32_t items){return items?hot->array_copy_items:hot->array_copy_calls;}

void ou_hot_native_pose_bind(OUHotNative *hot,uint32_t fallback){hot->pose_fallback=fallback;}
uint32_t ou_hot_native_pose_count(OUHotNative *hot,uint32_t bones){return bones?hot->pose_bones:hot->pose_calls;}

void ou_hot_native_bbox_bind(OUHotNative *hot,uint32_t fallback){hot->bbox_fallback=fallback;}
uint32_t ou_hot_native_bbox_count(OUHotNative *hot){return hot->bbox_calls;}

void ou_hot_native_digest_bind(OUHotNative *hot,uint32_t fallback){hot->digest_fallback=fallback;}
uint32_t ou_hot_native_digest_count(OUHotNative *hot){return hot->digest_calls;}

void ou_hot_native_assoc_set_bind(OUHotNative *hot,uint32_t fallback){hot->assoc_set_fallback=fallback;}
uint32_t ou_hot_native_assoc_set_count(OUHotNative *hot){return hot->assoc_set_calls;}

void ou_hot_native_bone_matrices_bind(OUHotNative *hot,uint32_t resume,uint32_t fallback){hot->bone_matrix_resume=resume;hot->bone_matrix_fallback=fallback;}
uint32_t ou_hot_native_bone_matrices_count(OUHotNative *hot,uint32_t copies){return copies?hot->bone_matrix_copies:hot->bone_matrix_calls;}

void ou_hot_native_mesh_buffers_bind(OUHotNative *hot,OUGLBatch *batch,const uint32_t targets[5]){hot->mesh_batch=batch;hot->mesh_cache_slot=targets[0];memcpy(hot->mesh_targets,targets+1,12);hot->mesh_fallback=targets[4];}
uint32_t ou_hot_native_mesh_buffers_count(OUHotNative *hot){return hot->mesh_calls;}

void ou_hot_native_cipher_chain_bind(OUHotNative *hot,const uint32_t targets[17]){memcpy(hot->cipher_chain_targets,targets,68);}
uint32_t ou_hot_native_cipher_chain_count(OUHotNative *hot){return hot->cipher_chain_calls;}

void ou_hot_native_assoc_merge_bind(OUHotNative *hot,uint32_t fallback){hot->assoc_merge_fallback=fallback;}
uint32_t ou_hot_native_assoc_merge_count(OUHotNative *hot,uint32_t items){return items?hot->assoc_merge_items:hot->assoc_merge_calls;}

void ou_hot_native_dynamic_vertices_bind(OUHotNative *hot,const uint32_t targets[5]){memcpy(hot->dynamic_vertex_targets,targets,20);}
uint32_t ou_hot_native_dynamic_vertices_count(OUHotNative *hot,uint32_t vertices){return vertices?hot->dynamic_vertices:hot->dynamic_vertex_calls;}

void ou_hot_native_cleanup_vertices_bind(OUHotNative *hot,const uint32_t targets[5]){memcpy(hot->cleanup_targets,targets,20);}
uint32_t ou_hot_native_cleanup_vertices_count(OUHotNative *hot,uint32_t vertices){return vertices?hot->cleanup_vertices:hot->cleanup_calls;}

void ou_hot_native_dynamic_bounds_bind(OUHotNative *hot,uint32_t resume,uint32_t fallback){hot->dynamic_bounds_resume=resume;hot->dynamic_bounds_fallback=fallback;}
uint32_t ou_hot_native_dynamic_bounds_count(OUHotNative *hot,uint32_t vertices){return vertices?hot->dynamic_bounds_vertices:hot->dynamic_bounds_calls;}

void ou_hot_native_animation_bind(OUHotNative *hot,const uint32_t targets[6]){memcpy(hot->animation_targets,targets,24);}
uint32_t ou_hot_native_animation_count(OUHotNative *hot,uint32_t kind){return kind<4?hot->animation_calls_native[kind]:0;}

void ou_hot_native_region_bind(OUHotNative *hot,const uint32_t targets[3]){memcpy(hot->region_targets,targets,12);}
uint32_t ou_hot_native_region_count(OUHotNative *hot,uint32_t kind){return kind<3?hot->region_calls[kind]:0;}

void ou_hot_native_bytecode_bind(OUHotNative *hot,const uint32_t targets[5]){memcpy(hot->bytecode_targets,targets,20);}
uint32_t ou_hot_native_bytecode_count(OUHotNative *hot){return hot->bytecode_calls;}

void ou_hot_native_material_bind(OUHotNative *hot,const uint32_t targets[7]){memcpy(hot->material_targets,targets,28);}
uint32_t ou_hot_native_material_count(OUHotNative *hot,uint32_t iterations){return iterations?hot->material_iterations:hot->material_calls;}

void ou_hot_native_math_bind(OUHotNative *hot,const uint32_t targets[8]){memcpy(hot->math_targets,targets,32);}
uint32_t ou_hot_native_math_count(OUHotNative *hot,uint32_t kind){return kind<8?hot->math_calls[kind]:0;}

void ou_hot_native_asset_lookup_bind(OUHotNative *hot,const uint32_t targets[6]){memcpy(hot->asset_targets,targets,24);}
uint32_t ou_hot_native_asset_lookup_count(OUHotNative *hot,uint32_t kind){return kind<5?hot->asset_calls[kind]:0;}

void ou_hot_native_blackout_bind(OUHotNative *hot,const uint32_t targets[2]){memcpy(hot->blackout_targets,targets,8);}
uint32_t ou_hot_native_blackout_count(OUHotNative *hot,uint32_t kind){return kind<2?hot->blackout_calls[kind]:0;}

void ou_hot_native_hash_index_bind(OUHotNative *hot,uint32_t fallback){hot->hash_index_fallback=fallback;}
uint32_t ou_hot_native_hash_index_count(OUHotNative *hot){return hot->hash_index_calls;}
