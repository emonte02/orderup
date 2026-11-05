/* Batch the original GLES2 DynamicMesh::FinalizeMeshes vertex loop. The
 * material query is accepted only for its original read-only getter. Other
 * callbacks, the packed legacy format, and aliases retain the Android loop. */
#include <stdint.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
static uint32_t word(const uint8_t *p){uint32_t v;memcpy(&v,p,4);return v;}
int ou_guest_dynamic_vertices(uc_engine *e,const uint32_t targets[3],uint32_t *handled,uint32_t *copied){
 *handled=0;*copied=0;uint32_t r[11],sp=0,cpsr=0;int error=0;
 for(unsigned i=0;i<11;i++)if((error=uc_reg_read(e,UC_ARM_REG_R0+i,r+i)))return error;
 if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;
 uint32_t count=r[9],mesh=r[5],dynamic=r[6],indices=r[4],vertices=r[7],output=r[0],flags=r[8];
 if(!count||count>8192||((mesh|dynamic|vertices|output|sp)&3)||(indices&1))return 0;
 uint32_t gles=0,handle=0,material=0,vt=0,getter=0,code[2],uv=0;
 if((error=uc_mem_read(e,targets[0],&gles,4)))return error;
 uint8_t enabled=0;if((error=uc_mem_read(e,gles,&enabled,1)))return error;if(!enabled)return 0;
 if((error=uc_mem_read(e,mesh+0x54,&handle,4)))return error;if(!handle)return 0;
 if((error=uc_mem_read(e,handle+8,&material,4)))return error;
 if((error=uc_mem_read(e,material,&vt,4)))return error;
 if((error=uc_mem_read(e,vt+0x38,&getter,4)))return error;if(getter!=targets[1])return 0;
 if((error=uc_mem_read(e,getter,code,8)))return error;if(code[0]!=0xe5900044u||code[1]!=0xe12fff1eu)return 0;
 if((error=uc_mem_read(e,material+0x44,&uv,4)))return error;if(uv>8)return 0;
 uint32_t stride=32+((flags&8)?16:0)+uv*8,bytes=count*stride;uint16_t index[8192];
 if((error=uc_mem_read(e,indices,index,count*2)))return error;
 uint32_t max=0;for(unsigned i=0;i<count;i++)if(index[i]>max)max=index[i];uint32_t source_bytes=(max+1)*64;
 uint32_t protected_ranges[][2]={{vertices,source_bytes},{indices,count*2},{dynamic,0x194},{mesh,0x160},{handle,12},{material,0x48},{vt+0x38,4},{gles,1},{targets[0],4},{sp-24,64}};
 for(unsigned i=0;i<sizeof(protected_ranges)/sizeof(protected_ranges[0]);i++)if(overlap(output,bytes,protected_ranges[i][0],protected_ranges[i][1]))return 0;
 for(unsigned i=0;i<sizeof(protected_ranges)/sizeof(protected_ranges[0])-1;i++)if(overlap(sp-24,24,protected_ranges[i][0],protected_ranges[i][1]))return 0;
 uint8_t v[64],out[112];uint32_t cursor=output,last_s14=0,last_s15=0;
 for(unsigned i=0;i<count;i++){
  if((error=uc_mem_read(e,vertices+(uint32_t)index[i]*64,v,64)))return error;
  memcpy(out,v,12);uint32_t one=0x3f800000u,zero=0;memcpy(out+12,&one,4);unsigned offset=16;last_s14=one;
  if(flags&8){memcpy(out+16,v+16,12);memcpy(out+28,&zero,4);offset+=16;last_s14=0;}
  memcpy(out+offset,v+32,16);offset+=16;last_s15=word(v+44);
  for(unsigned channel=0;channel<uv;channel++){memcpy(out+offset,v+48,8);offset+=8;last_s15=word(v+52);}
  if((error=uc_mem_write(e,cursor,out,stride)))return error;cursor+=stride;
 }
 /* The original nested call writes its six saved registers even though it
  * restores them. Retain that last call's stack bytes for subsequent callbacks. */
 uint32_t saved[6]={indices+count*2,mesh,dynamic,vertices,flags,targets[2]};if((error=uc_mem_write(e,sp-24,saved,24)))return error;
 uint32_t end=indices+count*2;if((error=uc_reg_write(e,UC_ARM_REG_R4,&end)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R10,&end)))return error;
 if((error=uc_reg_write(e,UC_ARM_REG_R0,&cursor)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R1,&uv)))return error;
 if((error=uc_reg_write(e,UC_ARM_REG_S14,&last_s14)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S15,&last_s15)))return error;
 if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;
 *handled=1;*copied=count;return 0;
}

#include "fpu/softfloat-types.h"
extern float32 float32_add_arm(float32,float32,float_status *);
/* The original dish cleanliness pass visits every vertex, marking each dirty
 * as GetVertex does. Keep its y-then-x float addition order and ARM FP status. */
int ou_guest_cleanup_vertices(uc_engine *e,const uint32_t targets[5],uint32_t *handled,uint32_t *copied){
 *handled=0;*copied=0;uint32_t grid=0,width=0,height=0,sp=0,fpscr=0,cpsr=0;int error=0;
 if((error=uc_reg_read(e,UC_ARM_REG_R7,&grid)))return error;if((error=uc_reg_read(e,UC_ARM_REG_R6,&width)))return error;if((error=uc_reg_read(e,UC_ARM_REG_R8,&height)))return error;if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;if((error=uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr)))return error;
 if(!width||width>256||!height||height>256||width*height>4096||((grid|sp)&3)||(fpscr&((7u<<16)|(3u<<20)|0x1f00u)))return 0;
 uint32_t prefix[2],data[0x194/4];if((error=uc_mem_read(e,targets[0],prefix,8)))return error;if(prefix[0]!=0xe1923001u||prefix[1]!=0xe92d4010u)return 0;if((error=uc_mem_read(e,targets[1],prefix,8)))return error;if(prefix[0]!=0xe5903180u||prefix[1]!=0xe3a0c001u)return 0;
 if((error=uc_mem_read(e,grid,data,sizeof(data))))return error;if(data[0x18c/4]!=width||data[0x190/4]!=height)return 0;uint32_t vertices=data[0x168/4],n=width*height,bytes=n*64,bit_bytes=(n+7)/8,bits[2]={data[0x180/4],data[0x184/4]},bitdata[2]={0};
 if(vertices&3)return 0;
 for(unsigned j=0;j<2;j++){if(j&&!bits[j])continue;if(!bits[j]||(bits[j]&3))return 0;if((error=uc_mem_read(e,bits[j]+8,bitdata+j,4)))return error;uint32_t ranges[][2]={{grid,0x194},{vertices,bytes},{bits[0],12},{bits[1],bits[1]?12:0},{sp-8,40}};for(unsigned k=0;k<5;k++)if(ranges[k][1]&&overlap(bitdata[j],bit_bytes,ranges[k][0],ranges[k][1]))return 0;}
 if(bitdata[1]&&bitdata[0]!=bitdata[1]&&overlap(bitdata[0],bit_bytes,bitdata[1],bit_bytes))return 0;
 if(overlap(sp-8,8,grid,0x194)||overlap(sp-8,8,vertices,bytes)||overlap(sp-8,8,bits[0],12)||(bits[1]&&overlap(sp-8,8,bits[1],12)))return 0;
 uint32_t v[4096*16];if((error=uc_mem_read(e,vertices,v,bytes)))return error;
 float_status status={0};const signed char rounds[4]={0,2,1,3};status.float_detect_tininess=float_tininess_before_rounding;status.float_rounding_mode=rounds[(fpscr>>22)&3];status.flush_to_zero=status.flush_inputs_to_zero=(fpscr>>24)&1;status.default_nan_mode=(fpscr>>25)&1;uint32_t sum=0,last=0;
 for(unsigned y=0;y<height;y++)for(unsigned x=0;x<width;x++){last=v[(height*x+y)*16+11];sum=float32_add_arm(sum,last,&status);}
 uint8_t marked[512];
 for(unsigned j=0;j<2;j++){if(j&&!bits[j])continue;if((error=uc_mem_read(e,bitdata[j],marked,bit_bytes)))return error;memset(marked,255,n/8);if(n&7)marked[n/8]|=(1u<<(n&7))-1;if((error=uc_mem_write(e,bitdata[j],marked,bit_bytes)))return error;}
 uint8_t one=1;if((error=uc_mem_write(e,grid+0x189,&one,1)))return error;if((error=uc_mem_write(e,grid+0x188,&one,1)))return error;
 uint32_t saved[2]={width,targets[4]};if((error=uc_mem_write(e,sp-8,saved,8)))return error;
 uint32_t flags=status.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1),control=fpscr|raised;
 if((error=uc_reg_write(e,UC_ARM_REG_FPSCR,&control)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S16,&sum)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S15,&last)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R4,&width)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R5,&height)))return error;
 if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;*copied=n;return 0;
}

/* Original active-vertex bounding scan. Its matrix, sphere and upload tail
 * remains Android code, including all callbacks and exceptional FP values. */
static int ordinary_position(uint32_t v){uint32_t exponent=v&0x7f800000u;return exponent!=0x7f800000u&&(exponent||(v&0x7fffffu)==0);}
static float as_float(uint32_t v){float f;memcpy(&f,&v,4);return f;}
int ou_guest_dynamic_bounds(uc_engine *e,uint32_t *handled,uint32_t *copied){
 *handled=0;*copied=0;uint32_t dynamic=0,sp=0,fpscr=0,mesh=0,vertices=0;uint16_t count=0;int error=0;
 if((error=uc_reg_read(e,UC_ARM_REG_R0,&dynamic)))return error;if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;if((error=uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr)))return error;
 if((dynamic&3)||(fpscr&((7u<<16)|(3u<<20)|0x1f00u)))return 0;
 if((error=uc_mem_read(e,dynamic+0x17a,&count,2)))return error;if(!count||count>4096)return 0;
 if((error=uc_mem_read(e,dynamic+0x170,&mesh,4)))return error;if((error=uc_mem_read(e,dynamic+0x168,&vertices,4)))return error;
 if((mesh|vertices)&3)return 0;if(overlap(mesh+0x14,32,dynamic,0x194)||overlap(mesh+0x14,32,vertices,count*64)||overlap(mesh+0x14,32,sp,80))return 0;
 uint32_t v[4096*16];if((error=uc_mem_read(e,vertices,v,count*64)))return error;
 for(unsigned i=0;i<count;i++)if(v[i*16+14]&1)for(unsigned k=0;k<3;k++)if(!ordinary_position(v[i*16+k]))return 0;
 uint32_t bounds[8]={0x7f7fffffu,0x7f7fffffu,0x7f7fffffu,0x3f800000u,0xff7fffffu,0xff7fffffu,0xff7fffffu,0x3f800000u};
 for(unsigned i=0;i<count;i++)if(v[i*16+14]&1)for(unsigned k=0;k<3;k++){uint32_t p=v[i*16+k];if(as_float(bounds[k+4])<as_float(p))bounds[k+4]=p;if(as_float(p)<as_float(bounds[k]))bounds[k]=p;}
 if((error=uc_mem_write(e,mesh+0x14,bounds,32)))return error;
 uint32_t last=vertices+((uint32_t)count-1)*64,n=count,flags=v[((uint32_t)count-1)*16+14];
 if((error=uc_reg_write(e,UC_ARM_REG_R0,&flags)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R1,&last)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R2,&mesh)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R3,&n)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S14,bounds)))return error;if((error=uc_reg_write(e,UC_ARM_REG_S15,bounds+4)))return error;
 *handled=1;*copied=count;return 0;
}
