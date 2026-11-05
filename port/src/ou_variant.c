/* Original CVM Variant::operator==: raw identity first, then only int/float
 * cross-type numeric equality. Equal typed NaN bits compare true; differently
 * encoded typed zeros compare false. Preserve the original FP control modes. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static uint32_t int_float_bits(uint32_t value,uint32_t mode){uint32_t sign=value>>31,mag=sign?0u-value:value;if(!mag)return 0;uint32_t lead=31u-(uint32_t)__builtin_clz(mag),sig;if(lead<=23)sig=mag<<(23-lead);else{uint32_t shift=lead-23,mask=(1u<<shift)-1,rem=mag&mask;sig=mag>>shift;uint32_t half=1u<<(shift-1),round=mode==0?(rem>half||(rem==half&&(sig&1))):mode==1?(!sign&&rem):mode==2?(sign&&rem):0;if(round){sig++;if(sig==0x1000000u){sig>>=1;lead++;}}}return(sign<<31)|((lead+127)<<23)|(sig&0x7fffffu);}
int ou_guest_variant_equal(uc_engine *engine,uint32_t left,uint32_t right,uint32_t *result){uint32_t a[2],b[2];int e=uc_mem_read(engine,left,a,8);if(e)return e;if((e=uc_mem_read(engine,right,b,8)))return e;uint32_t ta=a[0]&31,tb=b[0]&31;*result=ta==tb&&a[1]==b[1];if(*result||!((ta==3&&tb==4)||(ta==4&&tb==3)))return 0;uint32_t control=0;if((e=uc_reg_read(engine,UC_ARM_REG_FPSCR,&control)))return e;uint32_t floating=ta==4?a[1]:b[1],integer=ta==3?a[1]:b[1];if((control&(1u<<24))&&!(floating&0x7f800000u)&&(floating&0x7fffffu))floating&=0x80000000u;uint32_t converted=int_float_bits(integer,(control>>22)&3);*result=floating==converted||(!(floating&0x7fffffffu)&&!converted);return 0;}

/* Ordinary identifier-key GetCVMValue. Other key types and custom table
 * getters stay in ARM, including their validation/error callbacks. ItemGet
 * copies sequentially before Acquire; aliases and 16-bit reference wrap are
 * observable and deliberately retained. */
int ou_guest_assoc_value(uc_engine *e,const uint32_t args[4],const uint32_t getters[5],uint32_t *handled){
 *handled=0;uint32_t flags=0,count=0,key[2],vt=0,getter=0,table=0,offset=0,result=0;int error=uc_mem_read(e,args[1]+0x14,&flags,4);if(error)return error;
 if((error=uc_mem_read(e,args[1]+0x1c,&count,4)))return error;result=(flags&31)==2;
 if((int32_t)count<=0&&result){if((error=uc_mem_write(e,args[0],&result,4)))return error;*handled=1;return 0;}
 if((error=uc_mem_read(e,args[2],key,8)))return error;if((key[0]&31)!=6)return 0;
 if((int32_t)count>0){if(count>1048576)return 0;if((error=uc_mem_read(e,args[1],&vt,4)))return error;if((error=uc_mem_read(e,vt+0x70,&getter,4)))return error;for(unsigned i=0;i<5;i++)if(getter==getters[i]){offset=i==3?0x24:i==4?0x2c:0x20;break;}if(!offset)return 0;table=args[1]+offset;
  for(uint32_t i=0;i<count;i++){uint32_t entry[2];if((error=uc_mem_read(e,table+i*16,entry,8)))return error;if((entry[0]&31)!=6||entry[1]!=key[1])continue;
   uint32_t value=0,tag=0,object=0;if((error=uc_mem_read(e,table+i*16+8,&value,4)))return error;if((error=uc_mem_write(e,args[3],&value,4)))return error;if((error=uc_mem_read(e,table+i*16+12,&value,4)))return error;if((error=uc_mem_write(e,args[3]+4,&value,4)))return error;
   if((error=uc_mem_read(e,args[3],&tag,4)))return error;
   if(tag&0x600){if((error=uc_mem_read(e,args[3]+4,&object,4)))return error;if(tag&0x400){if((error=uc_mem_read(e,object,&value,4)))return error;object=value;}uint16_t refs=0;if((error=uc_mem_read(e,object+4,&refs,2)))return error;refs++;if((error=uc_mem_write(e,object+4,&refs,2)))return error;}
   result=1;break;
  }
 }
 if((error=uc_mem_write(e,args[0],&result,4)))return error;*handled=1;return 0;
}

/* Existing interned identifiers are read-only lookups. Missing identifiers,
 * allocation and custom string getters use the untouched original function. */
int ou_guest_ident_handle(uc_engine *e,uint32_t bank,uint32_t text,uint32_t text_getter,uint32_t *result,uint32_t *handled){
 extern int ou_guest_string_op(uc_engine *,uint32_t,uint32_t,uint32_t,uint32_t,uint32_t *);
 *handled=0;*result=0;uint32_t count=0,table=0,hash=0,node=0;int error=uc_mem_read(e,bank+4,&count,4);if(error)return error;
 if(!count||!text){*handled=1;return 0;}if(count>1048576)return 0;
 if((error=ou_guest_string_op(e,4,text,0xffffffffu,0,&hash)))return error;if((error=uc_mem_read(e,bank,&table,4)))return error;if((error=uc_mem_read(e,table+(hash%count)*4,&node,4)))return error;
 for(uint32_t i=0;node&&i<1048576;i++){
  uint32_t object=0,crc=0,handle=0,string=0,vt=0,target=0,equal=0;if((error=uc_mem_read(e,node,&object,4)))return error;if((error=uc_mem_read(e,object+0x10,&crc,4)))return error;
  if(crc==hash){if((error=uc_mem_read(e,object+8,&handle,4)))return error;if(handle){if((error=uc_mem_read(e,handle,&string,4)))return error;if(!string)return 0;if((error=uc_mem_read(e,string,&vt,4)))return error;if((error=uc_mem_read(e,vt+0xc,&target,4)))return error;if(target!=text_getter)return 0;if((error=ou_guest_string_op(e,1,string+0x1c,text,0,&equal)))return error;if(!equal){*result=node;*handled=1;return 0;}}}
  if((error=uc_mem_read(e,object+0x14,&node,4)))return error;
 }
 return 0;
}

/* Exact Variant Acquire/Release/Clear: these do not delete objects or invoke
 * virtual callbacks. The original uses wrapping 16-bit reference counts. */
int ou_guest_variant_reference(uc_engine *e,uint32_t variant,uint32_t mode,uint32_t *result){
 uint32_t tag=0,object=0;int error=uc_mem_read(e,variant,&tag,4);*result=variant;if(error)return error;
 if(tag&0x600){if((error=uc_mem_read(e,variant+4,&object,4)))return error;if(tag&0x400){uint32_t target=0;if((error=uc_mem_read(e,object,&target,4)))return error;object=target;}uint16_t refs=0;if((error=uc_mem_read(e,object+4,&refs,2)))return error;refs+=(mode==1)?1:-1;if((error=uc_mem_write(e,object+4,&refs,2)))return error;*result=object;}
 if(mode==2){uint32_t zero=0;if((error=uc_mem_write(e,variant,&zero,4)))return error;return uc_mem_write(e,variant+4,&zero,4);}return 0;
}

/* Original unoptimized xbool and Variant word helpers. Keep the two copy
 * orders distinct: overlapping source/destination words are observable. */
int ou_guest_value_helper(uc_engine *e,uint32_t kind,const uint32_t args[4],uint32_t *result){
 uint32_t value=0,word=0,destination=args[0],source=args[1];int error=0;*result=destination;
 if(kind==0)value=0;
 else if(kind==2||kind==3)value=source;
 else if(kind==4)value=source&255;
 else if(kind==7){uint8_t byte=0;if((error=uc_mem_read(e,source,&byte,1)))return error;value=byte;}
 else if(kind==1||kind==5||kind==6||kind==8||kind==9){if((error=uc_mem_read(e,kind==8?destination:source,&value,4)))return error;if(kind==8){*result=!!value;return 0;}if(kind==9)value=!value;}
 else if(kind==10||kind==11||kind==16){unsigned first=kind==10?4:0,second=4-first;if((error=uc_mem_read(e,source+first,&value,4)))return error;if(kind==16)value=(value&0xfffdb6dfu)|(args[2]&0x4960u);if((error=uc_mem_write(e,destination+first,&value,4)))return error;if((error=uc_mem_read(e,source+second,&value,4)))return error;return uc_mem_write(e,destination+second,&value,4);}
 else if(kind==12){if((error=uc_mem_read(e,destination,&value,4)))return error;value|=0x100;}
 else if(kind==13){if((error=uc_mem_read(e,source,&value,4)))return error;value&=0x100;}
 else if(kind==14){if((error=uc_mem_read(e,source,&word,4)))return error;if(word&0x1000){if((error=uc_mem_read(e,source+4,&word,4)))return error;if((error=uc_mem_read(e,word,&word,4)))return error;if((error=uc_mem_read(e,word+0x14,&value,4)))return error;value=!!(value&0x40);}}
 else if(kind==15){if((error=uc_mem_read(e,source+0x14,&value,4)))return error;value&=0x40;}
 else return UC_ERR_ARG;
 return uc_mem_write(e,destination,&value,4);
}

/* Batch the original ArrayObject::CopyCVM loop's scalar/identity entries.
 * Allocation, recursive copies, error callbacks and HB lifetime remain in
 * the original function. The live stack locals are advanced exactly as its
 * loop does, so unsupported entries continue at the original condition. */
#include <unicorn/arm.h>
static int copy_overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
int ou_guest_array_copy_loop(uc_engine *e,uint32_t *finished,uint32_t *items){
 *finished=0;*items=0;uint32_t sp=0,frame[0x48/4];int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;if((error=uc_mem_read(e,sp,frame,sizeof(frame))))return error;
 uint32_t index=frame[0x28/4],count=frame[0x40/4],source=frame[0x30/4],destination=frame[0x2c/4];if((int32_t)index<0||(int32_t)count<0||count>4096||index>count)return 0;uint32_t bytes=(count-index)*8;
 if(copy_overlap(source,bytes,sp,0x50)||copy_overlap(destination,bytes,sp,0x50))return 0;
 for(unsigned i=0;i<2;i++){uint32_t handle=frame[(i?0x38:0x34)/4];if(copy_overlap(destination,bytes,handle,4)||copy_overlap(source,bytes,handle,4))return 0;}
 while(index<count){
  uint32_t flags=0,is_const=0;if((error=uc_mem_read(e,source,&flags,4)))return error;
  if(flags&0x1000){uint32_t handle=0,object=0,tag=0;if((error=uc_mem_read(e,source+4,&handle,4)))return error;if((error=uc_mem_read(e,handle,&object,4)))return error;if((error=uc_mem_read(e,object+0x14,&tag,4)))return error;is_const=!!(tag&0x40);}
  uint32_t literal=!is_const&&(flags&0x100),type=flags&31;
  if(literal&&((flags&0x600)||type==8||type==9||type==10||type==12))break;
  uint32_t not_const=!is_const;if((error=uc_mem_write(e,sp+0x24,&is_const,4)))return error;if((error=uc_mem_write(e,sp+0x20,&not_const,4)))return error;if(not_const){uint32_t raw_literal=flags&0x100;if((error=uc_mem_write(e,sp+0x1c,&raw_literal,4)))return error;}
  if(literal){uint32_t value=0,one=1,zero=0;uint32_t empty[2]={0};if((error=uc_mem_write(e,sp+0xc,empty,8)))return error;
   if((error=uc_mem_read(e,source+4,&value,4)))return error;if((error=uc_mem_write(e,sp+0x10,&value,4)))return error;if((error=uc_mem_read(e,source,&value,4)))return error;if((error=uc_mem_write(e,sp+0xc,&value,4)))return error;
   if((error=uc_mem_write(e,sp+0x18,&one,4)))return error;if((error=uc_mem_write(e,sp+0x14,&zero,4)))return error;
   for(unsigned i=0;i<2;i++){uint32_t handle=0,object=0;if((error=uc_mem_read(e,sp+(i?0x34:0x38),&handle,4)))return error;if((error=uc_mem_read(e,handle,&object,4)))return error;uint32_t pointer=object+0x20+index*8;if((error=uc_mem_write(e,sp+(i?0x2c:0x30),&pointer,4)))return error;if(i)destination=pointer;else source=pointer;}
   if((error=uc_mem_read(e,sp+0xc,&value,4)))return error;if((error=uc_mem_write(e,destination,&value,4)))return error;if((error=uc_mem_read(e,sp+0x10,&value,4)))return error;if((error=uc_mem_write(e,destination+4,&value,4)))return error;
   if((error=uc_mem_read(e,destination,&value,4)))return error;value|=0x100;if((error=uc_mem_write(e,destination,&value,4)))return error;
  }else{uint32_t value=0;if((error=uc_mem_read(e,source,&value,4)))return error;if((error=uc_mem_write(e,destination,&value,4)))return error;if((error=uc_mem_read(e,source+4,&value,4)))return error;if((error=uc_mem_write(e,destination+4,&value,4)))return error;}
  index++;source+=8;destination+=8;if((error=uc_mem_write(e,sp+0x28,&index,4)))return error;if((error=uc_mem_write(e,sp+0x30,&source,4)))return error;if((error=uc_mem_write(e,sp+0x2c,&destination,4)))return error;(*items)++;
 }
 *finished=index==count;if(*finished){uint32_t flags=0,zero=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&flags)))return error;flags=(flags&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&flags)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R2,&index)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R3,&zero)))return error;}return 0;
}


/* Ordinary identifier-key table assignment without resizing. The original
 * handles errors, const violations, removals, custom getters and allocation.
 * Do not change guest memory until every condition for this path is known. */
int ou_guest_assoc_set(uc_engine *e,const uint32_t args[4],const uint32_t getters[5],uint32_t *handled){
 *handled=0;uint32_t sp=0,flags=0,object=args[1],key=args[2],value=args[3],tag=0,count=0,capacity=0,vt=0,getter=0,offset=0,query[2],entry=0,result=1,condition=0;int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;
 if((object|key|value|args[0])&3)return 0;
 for(unsigned i=0;i<4;i++)if(copy_overlap(args[i],i?i==1?32:8:4,sp-0x60,0x60))return 0;
 if((error=uc_mem_read(e,sp,&flags,4)))return error;if((error=uc_mem_read(e,key,query,8)))return error;if((query[0]&31)!=6)return 0;
 if((error=uc_mem_read(e,object+0x14,&tag,4)))return error;if((error=uc_mem_read(e,object+0x1c,&count,4)))return error;if((int32_t)count<0||count>1048576)return 0;
 if((error=uc_mem_read(e,object,&vt,4)))return error;if((error=uc_mem_read(e,vt+0x70,&getter,4)))return error;for(unsigned i=0;i<5;i++)if(getter==getters[i]){offset=i==3?0x24:i==4?0x2c:0x20;break;}if(!offset)return 0;
 uint32_t table=object+offset;if(copy_overlap(table,count*16,sp-0x60,0x60))return 0;
 for(uint32_t i=0;i<count;i++){uint32_t candidate[2];if((error=uc_mem_read(e,table+i*16,candidate,8)))return error;if((candidate[0]&31)==6&&candidate[1]==query[1]){entry=table+i*16;break;}}
 if(entry){
  if(flags&2)condition=0x20000000u;
  else{
   uint32_t stored=0,input=0;if((error=uc_mem_read(e,entry+8,&stored,4)))return error;if(stored&0x20)return 0;if((error=uc_mem_read(e,value,&input,4)))return error;if((input&31)==0&&(tag&31)==2)return 0;
   uint32_t word=(input&0xfffdb6dfu)|(flags&0x4960u);if((error=uc_mem_write(e,entry+8,&word,4)))return error;if((error=uc_mem_read(e,value+4,&word,4)))return error;if((error=uc_mem_write(e,entry+12,&word,4)))return error;condition=0x60000000u;
  }
 }else{
  uint32_t input[2];if((error=uc_mem_read(e,value,input,8)))return error;uint32_t generic=(tag&31)==2,insert=(generic&&(input[0]&31)!=0)||(!generic&&!(flags&1));
  if(!insert){result=generic;condition=0x60000000u;}
  else{
   if((error=uc_mem_read(e,object+0x18,&capacity,4)))return error;if((int32_t)capacity<=(int32_t)count)return 0;
   uint16_t distance=0;uint32_t owner=0,handle=0,current=0;if((error=uc_mem_read(e,object-2,&distance,2)))return error;if((error=uc_mem_read(e,object-distance+4,&owner,4)))return error;if((error=uc_mem_read(e,owner+4,&handle,4)))return error;if((error=uc_mem_read(e,handle,&current,4)))return error;if(current!=object)return 0;
   entry=table+count*16;if(copy_overlap(entry,16,sp-0x60,0x60)||copy_overlap(entry,16,object,offset)||copy_overlap(entry,16,handle,4)||copy_overlap(entry,16,owner,8))return 0;
   uint32_t next=count+1;if((error=uc_mem_write(e,object+0x1c,&next,4)))return error;
   if((error=uc_mem_write(e,entry+4,query+1,4)))return error;if((error=uc_mem_write(e,entry,query,4)))return error;if((error=uc_mem_write(e,entry+12,input+1,4)))return error;if((error=uc_mem_write(e,entry+8,input,4)))return error;
   if((error=uc_mem_write(e,entry,query,4)))return error;input[0]=(input[0]&0xfffdb6dfu)|(flags&0x4960u);if((error=uc_mem_write(e,entry+8,input,4)))return error;condition=0x20000000u;
  }
 }
 if((error=uc_mem_write(e,args[0],&result,4)))return error;uint32_t cpsr=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|condition;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}

/* Batch only ordinary scalar entries of the live MergeCVM loop. Recursive
 * merges, copies of references, resizing and custom getters remain original.
 * Re-read both handles after every original callback can move the objects. */
static int merge_table(uc_engine *e,uint32_t object,const uint32_t getters[5],uint32_t *table){
 uint32_t vt=0,target=0;int error=uc_mem_read(e,object,&vt,4);if(error)return error;if((error=uc_mem_read(e,vt+0x70,&target,4)))return error;*table=0;for(unsigned i=0;i<5;i++)if(target==getters[i]){*table=object+(i==3?0x24:i==4?0x2c:0x20);break;}return 0;
}
int ou_guest_assoc_merge_loop(uc_engine *e,const uint32_t getters[5],uint32_t *items){
 *items=0;uint32_t sp=0,frame[0xa8/4];int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;if((error=uc_mem_read(e,sp,frame,sizeof(frame))))return error;
 uint32_t index=frame[0x7c/4],count=frame[0x80/4],source_handle=frame[0x10/4],dest_handle=frame[0x8c/4],overwrite_ptr=frame[0xc/4],recursive_ptr=frame[0xa0/4];if((int32_t)index<0||index>=count||count>4096||!source_handle||!dest_handle)return 0;
 uint32_t source=0,destination=0,source_table=0,dest_table=0,metadata[3],overwrite=0,recursive=0;if((error=uc_mem_read(e,source_handle,&source,4)))return error;if((error=uc_mem_read(e,dest_handle,&destination,4)))return error;
 if((source|destination|source_handle|dest_handle|overwrite_ptr|recursive_ptr)&3)return 0;
 if((error=merge_table(e,source,getters,&source_table)))return error;if((error=merge_table(e,destination,getters,&dest_table)))return error;if(!source_table||!dest_table)return 0;
 if((error=uc_mem_read(e,destination+0x14,metadata,12)))return error;uint32_t capacity=metadata[1],used=metadata[2];if(used>capacity||capacity>4096)return 0;
 if(copy_overlap(source_table,count*16,dest_table,capacity*16)||copy_overlap(source,32,dest_table,capacity*16)||copy_overlap(source_table,count*16,destination,32)||copy_overlap(source_table,count*16,sp,0xa8)||copy_overlap(dest_table,capacity*16,sp,0xa8))return 0;
 uint32_t pointers[4]={source_handle,dest_handle,overwrite_ptr,recursive_ptr};for(unsigned i=0;i<4;i++)if(copy_overlap(pointers[i],4,dest_table,capacity*16)||copy_overlap(pointers[i],4,destination+0x1c,4)||copy_overlap(pointers[i],4,sp,0xa8))return 0;
 if((error=uc_mem_read(e,overwrite_ptr,&overwrite,4)))return error;if((error=uc_mem_read(e,recursive_ptr,&recursive,4)))return error;uint32_t work=0;
 while(index<count&&*items<128){
  if(work+used>16384)break;work+=used;uint32_t source_entry=source_table+index*16,entry[4],found=0,found_index=0;if((error=uc_mem_read(e,source_entry,entry,16)))return error;if((entry[0]&31)!=6)break;
  for(uint32_t j=0;j<used;j++){uint32_t key[2];if((error=uc_mem_read(e,dest_table+j*16,key,8)))return error;if((key[0]&31)==6&&key[1]==entry[1]){found=dest_table+j*16;found_index=j;break;}}
  uint32_t dest_type=0;if(recursive&&found){if((error=uc_mem_read(e,found+8,&dest_type,4)))return error;dest_type&=31;if((dest_type==9||dest_type==10)&&dest_type==(entry[2]&31))break;}
  uint32_t skip=found&&!overwrite,flags=entry[2]&0x100;
  if(!skip){uint32_t type=entry[2]&31;if((entry[2]&0x1600)||!(type<=4||type==6))break;
   uint32_t insert=!found&&((metadata[0]&31)!=2||type!=0);if(insert){if(used>=capacity)break;uint16_t distance=0;uint32_t owner=0,handle=0,current=0;if((error=uc_mem_read(e,destination-2,&distance,2)))return error;if((error=uc_mem_read(e,destination-distance+4,&owner,4)))return error;if((error=uc_mem_read(e,owner+4,&handle,4)))return error;if(handle!=dest_handle)return 0;if((error=uc_mem_read(e,handle,&current,4)))return error;if(current!=destination)return 0;if(copy_overlap(dest_table+used*16,16,owner,8)||copy_overlap(dest_table+used*16,16,dest_handle,4))break;}
   if((error=uc_mem_write(e,sp+0x18,entry+2,8)))return error;if((error=uc_mem_write(e,sp+0x44,&flags,4)))return error;
   if(found){uint32_t value[2]={(entry[2]&0xfffdb6dfu)|(flags&0x4960u),entry[3]};if((error=uc_mem_write(e,found+8,value,8)))return error;}
   else if(insert){uint32_t value[4]={entry[0],entry[1],(entry[2]&0xfffdb6dfu)|(flags&0x4960u),entry[3]};used++;if((error=uc_mem_write(e,destination+0x1c,&used,4)))return error;if((error=uc_mem_write(e,dest_table+(used-1)*16,value,16)))return error;}
   uint32_t zero=0,one=1,not_const=1;if((error=uc_mem_write(e,sp+0x40,&zero,4)))return error;if((error=uc_mem_write(e,sp+0x3c,&not_const,4)))return error;if((error=uc_mem_write(e,sp+0x38,&flags,4)))return error;
   if(flags){if((error=uc_mem_write(e,sp+0x34,&one,4)))return error;if((error=uc_mem_write(e,sp+0x30,&zero,4)))return error;}
   if(!found){if((error=uc_mem_write(e,sp,&flags,4)))return error;if((error=uc_mem_write(e,sp+4,frame+0xa4/4,4)))return error;if((error=uc_mem_write(e,sp+0x2c,&one,4)))return error;if((error=uc_mem_write(e,sp+0x28,&zero,4)))return error;}
  }
  if((error=uc_mem_write(e,sp+0x88,&source,4)))return error;if((error=uc_mem_write(e,sp+0x84,&destination,4)))return error;if((error=uc_mem_write(e,sp+0x74,&source_entry,4)))return error;if((error=uc_mem_write(e,sp+0x70,&found,4)))return error;if(found&&((error=uc_mem_write(e,sp+0x78,&found_index,4))))return error;
  if(found){uint32_t no_overwrite=!overwrite;if((error=uc_mem_write(e,sp+0x48,&no_overwrite,4)))return error;if(recursive&&((error=uc_mem_write(e,sp+0x6c,&dest_type,4))))return error;}
  index++;if((error=uc_mem_write(e,sp+0x7c,&index,4)))return error;(*items)++;
 }
 return 0;
}
