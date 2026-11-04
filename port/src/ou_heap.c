/* Original XPL free-list insertion / HB allocator release, with exact 32-bit
 * links, block coalescing, released-memory poison and allocation counters.
 * Foreign allocators and diagnostic paths retain the original ARM routines. */
#include <stdint.h>
#include <unicorn/unicorn.h>
typedef struct {uc_engine *engine;int error;} Memory;
static uint32_t rd(Memory *m,uint32_t p){uint32_t v=0;if(!m->error)m->error=uc_mem_read(m->engine,p,&v,4);return v;}
static void wr(Memory *m,uint32_t p,uint32_t v){if(!m->error)m->error=uc_mem_write(m->engine,p,&v,4);}
static uint32_t tag(Memory *m,uint32_t p){if(!p)return 0;uint16_t offset=0;if(!m->error)m->error=uc_mem_read(m->engine,p-2,&offset,2);return p-offset;}
static void poison(Memory *m,uint32_t p,uint32_t words){uint32_t values[256];for(uint32_t i=0;i<256;i++)values[i]=0xdeadbeef;while(words&&!m->error){uint32_t n=words>256?256:words;m->error=uc_mem_write(m->engine,p,values,n*4);words-=n;p+=n*4;}}
static int ordinary(Memory *m,uint32_t heap,uint32_t block,uint32_t size){return rd(m,heap+0x34)==0&&size>=16&&!(size&3)&&size<=0x10000000u&&rd(m,heap+0x24)<=block&&block+size>=block&&block+size<=rd(m,heap+0x28);}
static void remove_chunk(Memory *m,uint32_t heap,uint32_t p){uint32_t next=rd(m,p),previous=rd(m,p+4);wr(m,previous?previous:heap+0x14,next);wr(m,next?next+4:heap+0x18,previous);}
static void insert(Memory *m,uint32_t heap,uint32_t block,uint32_t size){
 wr(m,block+8,size);wr(m,block+12,block+size);poison(m,block+16,(size-16)/4);uint32_t current=block,cursor=rd(m,heap+0x14);
 for(uint32_t steps=0;steps<1048576&&!m->error;steps++){
  if(!cursor){uint32_t tail=rd(m,heap+0x18);wr(m,current+4,tail);wr(m,tail?tail:heap+0x14,current);wr(m,heap+0x18,current);wr(m,current,0);return;}
  if(current<cursor){
   uint32_t previous=rd(m,cursor+4);
   if(rd(m,current+12)==cursor){uint32_t next=rd(m,cursor);wr(m,current+12,rd(m,cursor+12));wr(m,current+8,rd(m,current+8)+rd(m,cursor+8));wr(m,current,next);wr(m,next?next+4:heap+0x18,current);wr(m,current+4,previous);wr(m,previous?previous:heap+0x14,current);poison(m,cursor,4);}
   else{wr(m,current,cursor);wr(m,current+4,previous);wr(m,previous?previous:heap+0x14,current);wr(m,cursor+4,current);}
   return;
  }
  if(rd(m,cursor+12)==current){uint32_t previous=rd(m,cursor+4);wr(m,cursor+12,rd(m,current+12));wr(m,cursor+8,rd(m,cursor+8)+rd(m,current+8));remove_chunk(m,heap,cursor);poison(m,current,4);current=cursor;cursor=previous;if(!cursor){cursor=rd(m,heap+0x14);continue;}}
  cursor=rd(m,cursor);
 }
 if(!m->error)m->error=UC_ERR_ARG;
}
int ou_guest_heap_insert(uc_engine *engine,uint32_t output,uint32_t heap,uint32_t block,uint32_t size,uint32_t *handled){Memory m={engine,0};*handled=0;if(!ordinary(&m,heap,block,size))return m.error;insert(&m,heap,block,size);if(!m.error){wr(&m,output,1);*handled=1;}return m.error;}
int ou_guest_heap_free(uc_engine *engine,uint32_t output,uint32_t manager,uint32_t pointer,uint32_t *handled){
 Memory m={engine,0};*handled=0;if(!pointer){wr(&m,output,1);*handled=1;return m.error;}
 uint32_t block=tag(&m,pointer),size=rd(&m,block),heap=rd(&m,manager+0x4c),steps=0;
 while(heap&&!(rd(&m,heap+0x24)<=block&&block<rd(&m,heap+0x28))&&!m.error){if(++steps>1048576)return UC_ERR_ARG;heap=rd(&m,heap+0xc);}
 if(m.error)return m.error;if(!heap||!ordinary(&m,heap,block,size))return m.error;
 uint32_t owner=rd(&m,block+4),handle=rd(&m,owner+4),next=rd(&m,handle+4);
 if(next){uint32_t next_tag=tag(&m,rd(&m,next));if(next_tag)wr(&m,next_tag+4,owner);}
 wr(&m,owner+4,next);
 uint32_t tail=rd(&m,manager+0x6c);if(tail)wr(&m,tail+4,handle);wr(&m,handle+4,0);wr(&m,handle,0);wr(&m,manager+0x6c,handle);if(!rd(&m,manager+0x68))wr(&m,manager+0x68,handle);wr(&m,manager+0x7c,rd(&m,manager+0x7c)-1);
 insert(&m,heap,block,size);if(m.error)return m.error;
 wr(&m,heap+0x44,rd(&m,heap+0x44)-size);wr(&m,heap+0x40,rd(&m,heap+0x40)-1);wr(&m,manager+0x14,rd(&m,manager+0x14)-size);wr(&m,manager+0x18,rd(&m,manager+0x18)-1);wr(&m,output,1);*handled=1;return m.error;
}

/* Original Heap::alloc, ordinary free-list path. Validate before mutating so
 * foreign allocators and unusual configurations can use the untouched body. */
int ou_guest_heap_alloc(uc_engine *engine,uint32_t heap,uint32_t size_ref,uint32_t flags,uint32_t *output,uint32_t *handled){
 Memory m={engine,0};*handled=0;*output=0;if(rd(&m,heap+0x34))return m.error;uint32_t manager=rd(&m,heap+8),alignment=1u<<((flags&0x3c0u)>>6),requested=rd(&m,size_ref);if(m.error)return m.error;if(!manager||manager==heap)return 0;if(alignment<4)alignment=4;uint16_t tag_size=0;m.error=uc_mem_read(engine,manager+0x30,&tag_size,2);if(m.error)return m.error;uint32_t minimum=rd(&m,manager+0x2c);if(m.error)return m.error;uint64_t total=(uint64_t)requested+tag_size+alignment-4+3;if(total>0xffffffffu||tag_size<8||(tag_size&3)||minimum<16)return 0;uint32_t wanted=(uint32_t)total&~3u;if(wanted<16||wanted>0x10000000u)return 0;
 uint32_t begin=rd(&m,heap+0x24),end=rd(&m,heap+0x28),back=!!(flags&0x10000u),node=rd(&m,heap+0x14),chunk_size=0,steps=0;if(m.error)return m.error;if(node&&back)node=rd(&m,heap+0x18);
 while(node&&!m.error){if(++steps>1048576)return UC_ERR_ARG;if(node<begin||node>end||end-node<16)return 0;chunk_size=rd(&m,node+8);if(m.error)return m.error;if(chunk_size<16||(chunk_size&3)||chunk_size>end-node)return 0;if(chunk_size>=wanted)break;node=rd(&m,node+(back?4:0));}
 if(m.error)return m.error;if(!node){*handled=1;return 0;}uint32_t residue=chunk_size-wanted,block=node;
 if(residue>minimum){if(back){wr(&m,node+8,residue);wr(&m,node+12,node+residue);block=node+residue;}else{uint32_t next=rd(&m,node),previous=rd(&m,node+4),old_end=rd(&m,node+12),replacement=node+wanted;wr(&m,replacement+12,old_end);wr(&m,replacement+8,residue);wr(&m,replacement+4,previous);wr(&m,previous?previous:heap+0x14,replacement);wr(&m,replacement,next);wr(&m,next?next+4:heap+0x18,replacement);}}
 else{wanted=chunk_size;remove_chunk(&m,heap,node);}if(m.error)return m.error;
 uint32_t pointer=block+tag_size;uint16_t padding=(uint16_t)pointer&((uint16_t)alignment-1);if(padding)padding=(uint16_t)alignment-padding;uint16_t offset=padding+tag_size;m.error=uc_mem_write(engine,pointer-2,&offset,2);if(m.error)return m.error;
 manager=rd(&m,heap+8);wr(&m,manager+0x14,rd(&m,manager+0x14)+wanted);wr(&m,manager+0x18,rd(&m,manager+0x18)+1);wr(&m,heap+0x44,rd(&m,heap+0x44)+wanted);wr(&m,heap+0x40,rd(&m,heap+0x40)+1);wr(&m,size_ref,wanted);if(!m.error){*output=pointer;*handled=1;}return m.error;
}
