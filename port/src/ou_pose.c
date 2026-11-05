/* Original Pose::ConvertToObjectSpaceFast, ordinary nonprocedural skeletons.
 * Use the pinned ARM SoftFloat operations and preserve per-operation rounding.
 * Procedural bones, aliases, unusual controls and NaNs retain original ARM. */
#include <stdint.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include "fpu/softfloat-types.h"
extern float32 float32_mul_arm(float32,float32,float_status *);
extern float32 float32_add_arm(float32,float32,float_status *);
extern float32 float32_sub_arm(float32,float32,float_status *);
extern float32 float32_div_arm(float32,float32,float_status *);
extern float32 float32_sqrt_arm(float32,float_status *);
static int overlaps(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
static uint32_t word(const uint8_t *p){uint32_t v;memcpy(&v,p,4);return v;}
static int finite(uint32_t v){return (v&0x7f800000u)!=0x7f800000u;}
static int positive(uint32_t v){return !(v&0x80000000u)&&(v&0x7fffffffu);}
#define ADD(a,b) float32_add_arm((a),(b),&status)
#define SUB(a,b) float32_sub_arm((a),(b),&status)
#define MUL(a,b) float32_mul_arm((a),(b),&status)
#define DIV(a,b) float32_div_arm((a),(b),&status)
int ou_guest_pose(uc_engine *e,uint32_t pose,uint32_t skeleton,uint32_t *result,uint32_t *handled,uint32_t *bones_done){
 *handled=0;*bones_done=0;*result=pose;uint8_t count=0;int error=uc_mem_read(e,skeleton+0x8c,&count,1);if(error)return error;uint32_t cpsr=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;
 if(count<=1){cpsr=(cpsr&0x0fffffffu)|(count?0x60000000u:0x80000000u);if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;}
 uint32_t base=0,fpscr=0;if((error=uc_mem_read(e,skeleton+0x88,&base,4)))return error;if((error=uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr)))return error;
 if(count>94||((pose|skeleton|base)&3)||(fpscr&((7u<<16)|(3u<<20)|0x1f00u))||overlaps(pose+0x11a0,count*64,skeleton,0x90)||overlaps(pose+0x11a0,count*64,base,count*0x140))return 0;
 uint32_t p[0x2924/4],matrix[94][16];uint8_t bones[94*0x140];if((error=uc_mem_read(e,pose,p,sizeof(p))))return error;if((error=uc_mem_read(e,base,bones,count*0x140)))return error;
 for(unsigned i=0;i<count;i++){
  if(word(bones+i*0x140+0x1c)&4)return 0;
  if(i){int16_t parent=0;memcpy(&parent,bones+i*0x140+0x130,2);if(parent<0||parent>=count)return 0;}
  for(unsigned k=0;k<4;k++)if(!finite(p[i*4+k]))return 0;
  for(unsigned k=0;k<3;k++)if(!finite(p[0x5e0/4+i*4+k])||!finite(word(bones+i*0x140+0x120+k*4))||(p[0x2920/4]&255&&!finite(p[0xbc0/4+i*4+k])))return 0;
 }
 float_status status={0};const signed char rounds[4]={0,2,1,3};status.float_detect_tininess=float_tininess_before_rounding;status.float_rounding_mode=rounds[(fpscr>>22)&3];status.flush_to_zero=status.flush_inputs_to_zero=(fpscr>>24)&1;status.default_nan_mode=(fpscr>>25)&1;
 for(unsigned i=0;i<count;i++){
  uint32_t x=p[i*4],y=p[i*4+1],z=p[i*4+2],w=p[i*4+3],xx=ADD(x,x),yy=ADD(y,y),zz=ADD(z,z),y2=MUL(yy,y),neg_z2=MUL(zz,z)^0x80000000u,x2=MUL(xx,x),zw=MUL(zz,w),zx=MUL(zz,x),yx=MUL(yy,x),zy=MUL(zz,y),xw=MUL(xx,w),yw=MUL(yy,w);uint32_t *m=matrix[i];
  m[0]=ADD(SUB(neg_z2,y2),0x3f800000u);m[1]=SUB(yx,zw);m[2]=ADD(yw,zx);m[3]=0;
  m[4]=ADD(zw,yx);m[5]=ADD(SUB(neg_z2,x2),0x3f800000u);m[6]=SUB(zy,xw);m[7]=0;
  m[8]=SUB(zx,yw);m[9]=ADD(xw,zy);m[10]=ADD(SUB(y2^0x80000000u,x2),0x3f800000u);m[11]=0;
  memcpy(m+12,p+0x5e0/4+i*4,12);m[15]=0x3f800000u;
 }
 uint32_t scales[3];for(unsigned k=0;k<3;k++){scales[k]=word(bones+0x120+k*4);if(p[0x2920/4]&255)scales[k]=MUL(scales[k],p[0xbc0/4+(k+1)%3]);for(unsigned j=0;j<3;j++)matrix[0][k*4+j]=MUL(scales[k],matrix[0][k*4+j]);}
 uint32_t compare_flags=0;
 for(unsigned i=1;i<count;i++){
  int16_t parent=0;memcpy(&parent,bones+i*0x140+0x130,2);uint32_t before[16],up[16];memcpy(before,matrix[i],64);memcpy(up,matrix[parent],64);
  for(unsigned k=0;k<3;k++){scales[k]=word(bones+i*0x140+0x120+k*4);if(p[0x2920/4]&255)scales[k]=MUL(scales[k],p[0xbc0/4+i*4+(k+1)%3]);}
  for(unsigned row=0;row<4;row++)for(unsigned col=0;col<4;col++){uint32_t v=MUL(up[col],before[row*4]);for(unsigned k=1;k<4;k++)v=ADD(v,MUL(up[k*4+col],before[row*4+k]));matrix[i][row*4+col]=v;}
  for(unsigned row=0;row<3;row++){
   uint32_t *v=matrix[i]+row*4,length=MUL(v[0],v[0]);length=ADD(length,MUL(v[1],v[1]));length=ADD(length,MUL(v[2],v[2]));if(!finite(length))return 0;compare_flags=positive(length)?0x20000000u:0x60000000u;
   if(positive(length)){uint32_t inverse=DIV(0x3f800000u,float32_sqrt_arm(length,&status));for(unsigned k=0;k<3;k++)v[k]=MUL(v[k],inverse);}
   for(unsigned k=0;k<3;k++)v[k]=MUL(v[k],scales[row]);
  }
  *result=pose+(uint32_t)parent*64+0x11cc;
 }
 for(unsigned i=0;i<count;i++)for(unsigned k=0;k<16;k++)if(!finite(matrix[i][k]))return 0;
 uint32_t flags=status.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1),control=(fpscr&0x0fffffffu)|compare_flags|raised;
 if((error=uc_mem_write(e,pose+0x11a0,matrix,count*64)))return error;if((error=uc_reg_write(e,UC_ARM_REG_FPSCR,&control)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;*bones_done=count;return 0;
}
