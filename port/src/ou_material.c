/* Original material texture loop, ARM 0x380954. Consecutive zero bindings
 * already present in the original cache have no callbacks or state changes.
 * Batch only those iterations. A changed binding or virtual function executes
 * the original loop immediately, including every original GL callback. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static uint32_t cmp(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
int ou_guest_material_zero_textures(uc_engine *e,const uint32_t targets[7],uint32_t *destination,uint32_t *skipped){
 *skipped=0;uint32_t index=0,slot=0,array=0,manager=0,vtable=0,callback=0,code[2],cache=0,maximum=0,flags=0,texture=0;int error=0;
 if((error=uc_reg_read(e,UC_ARM_REG_R7,&index)))return error;if(index>=10)return 0;if((error=uc_reg_read(e,UC_ARM_REG_R8,&slot)))return error;if((error=uc_reg_read(e,UC_ARM_REG_R10,&array)))return error;
 if((error=uc_mem_read(e,slot,&manager,4)))return error;if((error=uc_mem_read(e,manager,&vtable,4)))return error;if((error=uc_mem_read(e,vtable+0xec,&callback,4)))return error;if(callback!=targets[1])return 0;
 if((error=uc_mem_read(e,callback,code,8)))return error;if(!((code[0]==0xe92d41f0u&&code[1]==0xe59f404cu)||(code[0]==0xe51ff004u&&code[1]==targets[2])))return 0;
 if((error=uc_mem_read(e,targets[0],&cache,4)))return error;if((error=uc_mem_read(e,cache+0x114,&maximum,4)))return error;
 while(index<10){
  if((int32_t)maximum>(int32_t)index){uint32_t bound=0;if((error=uc_mem_read(e,cache+0x11c+index*4,&bound,4)))return error;if(bound){*destination=targets[5];break;}}
  ++*skipped;index++;if(index==10){*destination=targets[3];flags=cmp(index,10);break;}
  array+=4;if((error=uc_mem_read(e,array,&texture,4)))return error;flags=cmp(texture,0);if(texture){*destination=targets[4];break;}
 }
 if(!*skipped)return 0;uint32_t cpsr=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|flags;
 if((error=uc_reg_write(e,UC_ARM_REG_R7,&index)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R10,&array)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R3,&texture)))return error;if((error=uc_reg_write(e,UC_ARM_REG_LR,targets+6)))return error;return uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr);
}
