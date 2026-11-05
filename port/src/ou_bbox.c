/* Original eight-corner Bbox transform, retaining its optimized arithmetic
 * order, ARM float32 operations, comparisons, flags, and output constants. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
#include "fpu/softfloat.h"
extern float32 float32_mul_arm(float32,float32,float_status *);
extern float32 float32_add_arm(float32,float32,float_status *);
extern float32 float32_sub_arm(float32,float32,float_status *);
extern int float32_compare_arm(float32,float32,float_status *);
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
static int finite_word(uint32_t v){return (v&0x7f800000u)!=0x7f800000u;}
#define ADD(a,b) float32_add_arm((a),(b),&status)
#define SUB(a,b) float32_sub_arm((a),(b),&status)
#define MUL(a,b) float32_mul_arm((a),(b),&status)
int ou_guest_bbox(uc_engine *e,const uint32_t args[4],uint32_t *handled){
 *handled=0;uint32_t fpscr=0,cpsr=0;int error=uc_reg_read(e,UC_ARM_REG_FPSCR,&fpscr);if(error)return error;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;
 if(((args[0]|args[1]|args[2])&3)||(fpscr&((7u<<16)|(3u<<20)|0x1f00u))||overlap(args[0],32,args[1],32)||overlap(args[0],32,args[2],64))return 0;
 uint32_t b[8],m[16],f[20]={0},t[32]={0},dx=0,dy=0,dz=0;if((error=uc_mem_read(e,args[1],b,32)))return error;if((error=uc_mem_read(e,args[2],m,64)))return error;
 for(unsigned i=0;i<8;i++)if(i!=3&&i!=7&&!finite_word(b[i]))return 0;for(unsigned i=0;i<16;i++)if(!finite_word(m[i]))return 0;
 float_status status={0};const signed char rounds[4]={0,2,1,3};status.float_detect_tininess=float_tininess_before_rounding;status.float_rounding_mode=rounds[(fpscr>>22)&3];status.flush_to_zero=status.flush_inputs_to_zero=(fpscr>>24)&1;status.default_nan_mode=(fpscr>>25)&1;
 f[4]=b[0];
 f[3]=b[2];
 f[17]=MUL(m[1],f[4]);
 f[10]=b[1];
 f[11]=b[4];
 f[9]=b[6];
 f[5]=b[5];
 f[7]=m[12];
 f[8]=m[13];
 f[6]=m[14];
 f[12]=m[15];
 f[14]=MUL(m[9],f[3]);
 f[16]=MUL(m[10],f[3]);
 f[19]=MUL(m[2],f[4]);
 t[14]=MUL(m[6],f[5]);
 f[15]=MUL(m[8],f[3]);
 t[17]=ADD(ADD(ADD(f[17],f[14]),f[8]),MUL(m[5],f[10]));
 t[0]=MUL(m[4],f[5]);
 t[13]=MUL(m[5],f[5]);
 f[3]=MUL(m[11],f[3]);
 f[18]=MUL(m[0],f[4]);
 f[4]=MUL(m[3],f[4]);
 f[5]=MUL(m[7],f[5]);
 t[16]=ADD(ADD(ADD(f[18],f[15]),f[7]),MUL(m[4],f[10]));
 t[6]=ADD(ADD(ADD(t[14],f[16]),f[6]),MUL(m[2],f[11]));
 t[4]=ADD(ADD(ADD(t[0],f[15]),f[7]),MUL(m[0],f[11]));
 t[5]=ADD(ADD(ADD(t[13],f[14]),f[8]),MUL(m[1],f[11]));
 t[18]=ADD(ADD(ADD(f[19],f[16]),f[6]),MUL(m[6],f[10]));
 t[14]=ADD(t[14],f[19]);
 t[2]=ADD(ADD(f[16],f[6]),t[14]);
 t[13]=ADD(t[13],f[17]);
 t[0]=ADD(t[0],f[18]);
 t[1]=ADD(ADD(f[14],f[8]),t[13]);
 t[12]=ADD(ADD(f[7],MUL(m[8],f[9])),t[0]);
 t[0]=ADD(ADD(f[15],f[7]),t[0]);
 t[13]=ADD(ADD(f[8],MUL(m[9],f[9])),t[13]);
 t[14]=ADD(ADD(f[6],MUL(m[10],f[9])),t[14]);
 t[31]=ADD(ADD(ADD(f[4],f[3]),f[12]),MUL(m[7],f[10]));
 t[11]=ADD(ADD(ADD(f[5],f[3]),f[12]),MUL(m[3],f[11]));
 dy=SUB(t[13],t[1]); /* Difference stays in a register; retain the corner. */
 t[7]=t[11];
 t[20]=SUB(ADD(t[16],t[4]),t[0]);
 t[21]=SUB(ADD(t[17],t[5]),t[1]);
 dx=SUB(t[12],t[0]); /* Difference stays in a register; retain the corner. */
 dz=SUB(t[14],t[2]); /* Difference stays in a register; retain the corner. */
 t[22]=ADD(SUB(t[6],t[2]),t[18]);
 f[5]=ADD(f[5],f[4]);
 t[15]=ADD(ADD(f[12],MUL(m[11],f[9])),f[5]);
 t[29]=ADD(dy,t[17]);
 t[30]=ADD(dz,t[18]);
 t[3]=ADD(ADD(f[3],f[12]),f[5]);
 t[28]=ADD(dx,t[16]);
 t[24]=ADD(t[20],dx);
 t[19]=t[31];
 t[23]=t[31];
 t[27]=t[31];
 t[26]=ADD(t[22],dz);
 t[25]=ADD(t[21],dy);
 t[8]=ADD(dx,t[4]);
 t[9]=ADD(dy,t[5]);
 t[10]=ADD(dz,t[6]);
 for(unsigned i=0;i<32;i++)if(!finite_word(t[i]))return 0;
 uint32_t out[8]={0x7f7fffff,0x7f7fffff,0x7f7fffff,0x3f800000,0xff7fffff,0xff7fffff,0xff7fffff,0x3f800000};int comparison=0;
 for(unsigned i=0;i<8;i++){
  uint32_t x=t[i*4],y=t[i*4+1],z=t[i*4+2];
  if(float32_compare_arm(x,out[4],&status)==float_relation_greater)out[4]=x;
  if(float32_compare_arm(y,out[5],&status)==float_relation_greater)out[5]=y;
  if(float32_compare_arm(z,out[6],&status)==float_relation_greater)out[6]=z;
  if(float32_compare_arm(x,out[0],&status)==float_relation_less)out[0]=x;
  if(float32_compare_arm(out[1],y,&status)==float_relation_greater)out[1]=y;
  comparison=float32_compare_arm(z,out[2],&status);if(comparison==float_relation_less)out[2]=z;
 }
 uint32_t compare_flags=comparison==float_relation_less?0x80000000u:comparison==float_relation_equal?0x60000000u:comparison==float_relation_greater?0x20000000u:0x30000000u,flags=status.float_exception_flags,raised=(flags&1)|((flags&4)>>1)|((flags&8)>>1)|((flags&(16|128))?8:0)|((flags&32)>>1)|((flags&64)<<1),control=(fpscr&0x0fffffffu)|compare_flags|raised;
 if((error=uc_mem_write(e,args[0],out,32)))return error;if((error=uc_reg_write(e,UC_ARM_REG_FPSCR,&control)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}
