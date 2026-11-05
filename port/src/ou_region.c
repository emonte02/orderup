/* Exact original Mem::Region block selection and CSL handle increments.
 * The same free-list nodes and link writes are retained. No host allocator
 * substitutes for the original region, and long searches use the ARM body. */
#include <stdint.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
typedef struct {uc_engine *e;int error;} Memory;
static uint32_t rd(Memory *m,uint32_t p){uint32_t v=0;if(!m->error)m->error=uc_mem_read(m->e,p,&v,4);return v;}
static void wr(Memory *m,uint32_t p,uint32_t v){if(!m->error)m->error=uc_mem_write(m->e,p,&v,4);}
static uint32_t cmp(uint32_t a,uint32_t b){uint32_t v=a-b;return(v&0x80000000u)|(v?0:0x40000000u)|(a>=b?0x20000000u:0)|(((a^b)&(a^v)&0x80000000u)>>3);}
int ou_guest_region(uc_engine *e,uint32_t kind,uint32_t args[4],uint32_t *handled){
 Memory m={e,0};*handled=0;
 if(kind){
  uint32_t sp=0;if((m.error=uc_reg_read(e,UC_ARM_REG_SP,&sp)))return m.error;
  wr(&m,sp-4,args[0]);uint32_t object=rd(&m,sp-4);uint16_t count=0;
  if(!m.error)m.error=uc_mem_read(e,object+4,&count,2);count=(uint16_t)(count+(kind==1?1:-1));
  args[2]=count;args[3]=rd(&m,sp-4);if(!m.error)m.error=uc_mem_write(e,args[3]+4,&count,2);
  if(!m.error)*handled=1;return m.error;
 }
 uint32_t region=args[0],flags=0,ip=0,steps=0;args[3]=region;
 if(!args[2])goto backward;
 args[0]=rd(&m,region+0x48);flags=cmp(args[0],0);if(!args[0])goto done;
 args[2]=rd(&m,args[0]+8);flags=cmp(args[1],args[2]);if(args[1]>args[2]){args[2]=args[0];goto scan_forward;}
 args[2]=args[0];goto remove_head;
scan_forward:
 if(++steps>4096)return 0;args[2]=rd(&m,args[2]+4);flags=cmp(args[2],0);if(!args[2]){args[0]=args[2];goto done;}
 ip=rd(&m,args[2]+8);flags=cmp(ip,args[1]);if(ip<args[1])goto scan_forward;
 flags=cmp(args[2],args[0]);if(args[2]==args[0])goto remove_head;args[1]=rd(&m,args[2]+4);goto unlink_forward;
remove_head:
 args[1]=rd(&m,args[2]+4);wr(&m,region+0x48,args[1]);
unlink_forward:
 args[0]=rd(&m,region+0x4c);flags=cmp(args[0],args[2]);if(args[0]==args[2]){args[0]=rd(&m,args[2]);wr(&m,region+0x4c,args[0]);}
 flags=cmp(args[1],0);if(args[1]){args[3]=rd(&m,args[2]);wr(&m,args[1],args[3]);}
 args[3]=rd(&m,args[2]);flags=cmp(args[3],0);if(!args[3]){args[0]=args[2];goto done;}
 args[1]=rd(&m,args[2]+4);args[0]=args[2];wr(&m,args[3]+4,args[1]);goto done;
backward:
 ip=rd(&m,region+0x4c);flags=cmp(ip,0);args[0]=ip;if(!ip)goto done;
 args[2]=rd(&m,ip+8);flags=cmp(args[1],args[2]);if(args[1]<=args[2])goto unlink_backward;
scan_backward:
 if(++steps>4096)return 0;args[0]=rd(&m,args[0]);flags=cmp(args[0],0);if(!args[0])goto done;
 args[2]=rd(&m,args[0]+8);flags=cmp(args[1],args[2]);if(args[1]>args[2])goto scan_backward;
unlink_backward:
 args[2]=rd(&m,region+0x48);flags=cmp(args[2],args[0]);if(args[2]==args[0]){args[2]=rd(&m,args[0]+4);wr(&m,region+0x48,args[2]);}
 flags=cmp(args[0],ip);if(args[0]==ip){args[2]=rd(&m,args[0]);wr(&m,region+0x4c,args[2]);}
 args[3]=rd(&m,args[0]+4);flags=cmp(args[3],0);if(args[3]){args[2]=rd(&m,args[0]);wr(&m,args[3],args[2]);}
 args[2]=rd(&m,args[0]);flags=cmp(args[2],0);if(args[2])wr(&m,args[2]+4,args[3]);
done:
 if(m.error)return m.error;uint32_t cpsr=0;if((m.error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return m.error;cpsr=(cpsr&0x0fffffffu)|flags;if((m.error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return m.error;
 if((m.error=uc_reg_write(e,UC_ARM_REG_R1,args+1)))return m.error;if((m.error=uc_reg_write(e,UC_ARM_REG_R2,args+2)))return m.error;if((m.error=uc_reg_write(e,UC_ARM_REG_R3,args+3)))return m.error;*handled=1;return 0;
}
