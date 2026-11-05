/* Original CVM::Thread::interpret instruction decoder, ARM 0x3b5ef4.
 * Only decoding/dispatch is translated: opcode bodies, error checks and VM
 * deadline checks remain original ARM. R12 is dead here and in every handler
 * until its next definition; it carries the BX continuation for this port. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
static uint32_t cmp(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
int ou_guest_bytecode_decode(uc_engine *e,uint32_t args[4],const uint32_t targets[5],uint32_t *target,uint32_t *handled){
 *handled=0;uint32_t pc=0,sp=0,cpsr=0;int error=0;
 if((error=uc_reg_read(e,UC_ARM_REG_R5,&pc)))return error;if((error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return error;
 if(sp>0xfffffc7bu||overlap(pc,5,sp+0x360,4)||overlap(pc,5,sp+0x380,4)||overlap(pc,5,sp+0x198,4))return 0;
 uint8_t bytes[5];if((error=uc_mem_read(e,pc,bytes,1)))return error;
 uint32_t opcode=bytes[0],length=1,immediate=0,r2=args[2],r3=opcode-1,flags=cmp(r3,0x56),slot=targets[2];
 if(opcode&0x80u){
  length=2+!!(opcode&0x20u)+2*!!(opcode&0x40u);if((error=uc_mem_read(e,pc+1,bytes+1,length-1)))return error;
  immediate=(uint32_t)(int32_t)(int8_t)bytes[1];uint32_t index=2;
  if(opcode&0x20u){r2=immediate<<8;immediate=r2|bytes[index++];}
  if(opcode&0x40u){r2=immediate<<16;immediate=r2|((uint32_t)bytes[index++]<<8);r2=bytes[index];immediate|=r2;}
  r3=opcode&31u;flags=cmp(r3,0x1b);slot=r3<=0x1bu?targets[3]+r3*4:targets[4];
 }else if(r3<=0x56u)slot=targets[1]+r3*4;
 // A changed dispatch instruction or an alias with its ARM stack writes keeps
 // the complete original decoder. Nothing has been mutated before this guard.
 if(overlap(slot,4,sp+0x360,4)||overlap(slot,4,sp+0x380,4)||overlap(slot,4,sp+0x198,4))return 0;
 uint32_t branch=0;if((error=uc_mem_read(e,slot,&branch,4)))return error;if((branch&0xff000000u)!=0xea000000u)return 0;
 uint32_t destination=slot+8+(uint32_t)((int32_t)(branch<<8)>>6),stored_opcode=(opcode&0x80u)?r3:opcode,next_pc=pc+length;
 if((error=uc_mem_write(e,sp+0x360,&pc,4)))return error;if((error=uc_mem_write(e,sp+0x380,&stored_opcode,4)))return error;if((opcode&0x80u)&&(error=uc_mem_write(e,sp+0x198,&immediate,4)))return error;
 if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|flags;
 if((error=uc_reg_write(e,UC_ARM_REG_R2,&r2)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R3,&r3)))return error;if((error=uc_reg_write(e,UC_ARM_REG_R5,&next_pc)))return error;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;
 *target=destination;*handled=1;return 0;
}
