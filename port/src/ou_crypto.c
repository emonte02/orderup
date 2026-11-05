/* Profile-guided ports of the original save cipher and random generator.
 * Only disjoint, ordinary cipher objects use the batched paths. Unknown table
 * layouts, modified initialization data and aliases retain the original ARM. */
#include <stdint.h>
#include <string.h>
#include <unicorn/unicorn.h>
#include <unicorn/arm.h>
static uint32_t word(const uint8_t *p){uint32_t v;memcpy(&v,p,4);return v;}
static void store(uint8_t *p,uint32_t v){memcpy(p,&v,4);}
static void reset(uint32_t state[5],uint32_t seed){state[0]=seed;for(unsigned i=1;i<5;i++)state[i]=state[i-1]*0x10dcdu+0x587c5u;}
static uint32_t number(uint32_t s[5],uint32_t limit){uint32_t t=s[0]^(s[0]>>7),v=s[4]^(s[4]<<6)^t^(t<<13),r=(s[2]*2u+1u)*v;s[0]=s[1];s[1]=s[2];s[2]=s[3];s[3]=s[4];s[4]=v;return limit==0xffffffffu?r:limit?r%limit:0;}
static uint32_t rotate(uint32_t v,unsigned n){n&=31;return n?(v>>n)|(v<<(32-n)):v;}
static int overlap(uint32_t a,uint32_t n,uint32_t b,uint32_t m){return (uint64_t)a+n>0x100000000ull||(uint64_t)b+m>0x100000000ull||((uint64_t)a<(uint64_t)b+m&&(uint64_t)b<(uint64_t)a+n);}
int ou_guest_crypto(uc_engine *e,uint32_t kind,const uint32_t args[4],uint32_t *result,uint32_t *handled){
 *handled=0;uint32_t object=args[0];if(object&3)return 0;int error;
 if(kind==0){uint32_t state[5];if((error=uc_mem_read(e,object,state,20)))return error;*result=number(state,args[1]);if((error=uc_mem_write(e,object,state,20)))return error;*handled=1;return 0;}
 uint8_t data[0x440];uint32_t size=kind==2||kind==8?0x33c:kind==1||kind==7?0x43c:kind==5||kind==11||kind==12?0x28:kind==6?0x18:0x440;
 if((error=uc_mem_read(e,object,data,size)))return error;
 if(kind<=4){
  uint32_t bins=kind==4?64:256,table=word(data+0x128),bytes=bins*16;
  if(word(data+0x130)!=bins||word(data+0x134)!=bins||word(data+0x12c)!=table+bins*8||(table&3)||overlap(object,size,table,bytes))return 0;
  uint32_t nodes[1024];if((error=uc_mem_read(e,table,nodes,bytes)))return error;
  for(uint32_t i=0;i<bins*2;i++)if(nodes[i*2]||nodes[i*2+1]!=((i==bins-1||i==bins*2-1)?0:table+(i+1)*8))return 0;
  for(uint32_t i=0;i<bins;i++)if(kind==4?word(data+0x28+i*4)!=i:data[0x28+i]!=i)return 0;
  uint32_t state[5];reset(state,args[1]);int head[256],next[256];for(unsigned i=0;i<bins;i++)head[i]=-1;
  for(uint32_t i=0;i<bins;i+=4){uint32_t random=number(state,0xffffffffu);for(unsigned j=0;j<4;j++){uint32_t bucket=(random>>(j*8))&(bins-1),index=i+j;next[index]=head[bucket];head[bucket]=(int)index;}}
  unsigned index=0;for(unsigned bucket=0;bucket<bins;bucket++)for(int i=head[bucket];i>=0;i=next[i]){if(kind==4){store(data+0x13c+index*4,(uint32_t)i);store(data+0x23c+(unsigned)i*4,index);}else{data[0x13c+index]=(uint8_t)i;data[0x23c+(unsigned)i]=(uint8_t)index;}index++;}
  store(data+0x138,0);*result=object+0x128;
  if(kind==3){*result=number(state,254)+1;data[0x43c]=(uint8_t)*result;}
  if(kind==4){uint32_t mask=0;for(unsigned i=0;i<8;i++){*result=number(state,14)+1;mask=(mask<<4)|*result;}store(data+0x43c,mask);}
  memcpy(data+0x14,state,20);if((error=uc_mem_write(e,object,data,size)))return error;
 }else{
  uint32_t target=args[1];if(overlap(object,size,target,256))return 0;
  uint8_t block[256];if((error=uc_mem_read(e,target,block,256)))return error;uint32_t state[5]={0};if(size>=0x28)memcpy(state,data+0x14,20);
  if(kind==5||kind==6||kind==11||kind==12){uint32_t key=word(data+0x14);for(unsigned i=0;i<64;i++){uint32_t value=word(block+i*4),n;if(kind==6){key=rotate(key,1);n=key;}else n=number(state,kind==12?31:0xffffffffu);if(kind==11)value^=n;else if(kind==12)value=rotate(value,args[2]==1?31-n:n+1);else value=args[2]==1?value+n:value-n;store(block+i*4,value);}if(kind!=6)memcpy(data+0x14,state,20);}
  else if(kind==8){uint32_t start=args[2]==1?0x13c:0x23c;for(unsigned i=0;i<256;i++)block[i]=data[start+block[i]];}
  else if(kind==7||kind==9){uint32_t start=args[2]==1?0x13c:0x23c;uint8_t mask=kind==7?255:data[0x43c];for(unsigned i=0;i<256;i++)data[0x33c+i]=block[data[start+i]]&mask;for(unsigned i=0;i<256;i++)block[i]=(block[i]&(uint8_t)~mask)|data[0x33c+i];}
  else if(kind==10){uint32_t start=args[2]==1?0x13c:0x23c,mask=word(data+0x43c);for(unsigned i=0;i<64;i++){uint32_t index=word(data+start+i*4);if(index>=64)return 0;store(data+0x33c+i*4,word(block+index*4)&mask);}for(unsigned i=0;i<64;i++)store(block+i*4,(word(block+i*4)&~mask)|word(data+0x33c+i*4));}
  else return UC_ERR_ARG;
  if((error=uc_mem_write(e,object,data,size)))return error;if((error=uc_mem_write(e,target,block,256)))return error;*result=1;
 }
 *handled=1;return 0;
}

/* The save digest is eight consecutive groups of eight XOR words. Preserve
 * its intermediate stores: the original also accepts overlapping buffers. */
int ou_guest_save_digest(uc_engine *e,uint32_t block,uint32_t output,uint32_t *result,uint32_t *handled){
 *handled=0;uint32_t sp=0;int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;if(overlap(block,256,sp-8,8)||overlap(output,32,sp-8,8))return 0;for(unsigned group=0;group<8;group++){
  uint32_t value=0;if((error=uc_mem_write(e,output+group*4,&value,4)))return error;
  for(unsigned word_index=0;word_index<8;word_index++){uint32_t input=0;if((error=uc_mem_read(e,block+group*32+word_index*4,&input,4)))return error;value^=input;if((error=uc_mem_write(e,output+group*4,&value,4)))return error;}
 }
 uint32_t flags=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&flags)))return error;flags=(flags&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&flags)))return error;*result=block+256;*handled=1;return 0;
}

/* Canonical eight-cipher SVS block processing. Preflight every virtual target,
 * list, table and alias before changing guest state. Nonstandard ciphers and
 * observable callbacks continue through the complete original function. */
int ou_guest_cipher_chain(uc_engine *e,uint32_t object,uint32_t block,const uint32_t bindings[16],uint32_t *handled){
 *handled=0;uint32_t data[0x348/4],sp=0;int error=uc_reg_read(e,UC_ARM_REG_SP,&sp);if(error)return error;if((object|block)&3)return 0;if(overlap(object,sizeof(data),sp-0x1000,0x1000)||overlap(block,256,sp-0x1000,0x1000))return 0;
 if(overlap(object,sizeof(data),block,256)&&!((uint64_t)block>=object+0x90ull&&(uint64_t)block+256<=object+0x290ull))return 0;
 if((error=uc_mem_read(e,object,data,sizeof(data))))return error;if(data[0x324/4]!=8||data[0x32c/4]!=1)return 0;
 uint32_t objects[8],sizes[8],types[8],tables[8]={0},table_bytes[8]={0},vtables[8],nodes[8][4],seen=0,head=object+0x328;
 for(unsigned i=0;i<8;i++){
  objects[i]=data[0x2a4/4+i];uint32_t vt=0,pair[2];if(objects[i]&3)return 0;if((error=uc_mem_read(e,objects[i],&vt,4)))return error;vtables[i]=vt;if((error=uc_mem_read(e,vt+8,pair,8)))return error;unsigned kind=8;for(unsigned j=0;j<8;j++)if(pair[0]==bindings[j]&&pair[1]==bindings[8+j]){kind=j;break;}if(kind==8)return 0;types[i]=kind;sizes[i]=kind==3?0x33c:kind==2?0x43c:kind==4||kind==5?0x440:kind==1?0x18:0x28;
  if(overlap(objects[i],sizes[i],object,sizeof(data))||overlap(objects[i],sizes[i],block,256)||overlap(objects[i],sizes[i],sp-0x1000,0x1000))return 0;for(unsigned j=0;j<i;j++)if(overlap(objects[i],sizes[i],objects[j],sizes[j]))return 0;
  if((error=uc_mem_read(e,objects[i]+4,nodes[i],16)))return error;if(nodes[i][1]!=objects[i])return 0;
  if(kind>=2&&kind<=5){uint8_t bytes[0x440];if((error=uc_mem_read(e,objects[i],bytes,sizes[i])))return error;uint32_t bins=kind==5?64:256,table=word(bytes+0x128);tables[i]=table;table_bytes[i]=bins*16;
   if((table&3)||word(bytes+0x130)!=bins||word(bytes+0x134)!=bins||word(bytes+0x12c)!=table+bins*8)return 0;
   uint32_t list[1024];if((error=uc_mem_read(e,table,list,bins*16)))return error;for(uint32_t j=0;j<bins*2;j++)if(list[j*2]||list[j*2+1]!=((j==bins-1||j==bins*2-1)?0:table+(j+1)*8))return 0;
   for(uint32_t j=0;j<bins;j++)if(kind==5?word(bytes+0x28+j*4)!=j:bytes[0x28+j]!=j)return 0;
  }
 }
 uint32_t node=data[0x328/4],previous=head,priority=0xffffffffu;
 for(unsigned n=0;node!=head;n++){
  if(n>=8)return 0;unsigned i=0;while(i<8&&objects[i]+4!=node)i++;if(i==8||(seen&(1u<<i))||nodes[i][2]!=previous||nodes[i][3]>priority)return 0;seen|=1u<<i;priority=nodes[i][3];previous=node;node=nodes[i][0];
 }
 if(data[0x330/4]!=previous||(seen!=0&&seen!=255))return 0;if(!seen)for(unsigned i=0;i<8;i++)if(nodes[i][0]!=objects[i]+4||nodes[i][2]!=objects[i]+4)return 0;
 for(unsigned i=0;i<8;i++){
  if(table_bytes[i]&&(overlap(tables[i],table_bytes[i],object,sizeof(data))||overlap(tables[i],table_bytes[i],block,256)||overlap(tables[i],table_bytes[i],sp-0x1000,0x1000)))return 0;
  for(unsigned j=0;j<8;j++){
   if(table_bytes[i]&&overlap(tables[i],table_bytes[i],objects[j],sizes[j]))return 0;
   if(table_bytes[i]&&j<i&&table_bytes[j]&&overlap(tables[i],table_bytes[i],tables[j],table_bytes[j]))return 0;
   if(overlap(vtables[i],16,objects[j],sizes[j])||(table_bytes[j]&&overlap(vtables[i],16,tables[j],table_bytes[j])))return 0;
  }
  if(overlap(vtables[i],16,object,sizeof(data))||overlap(vtables[i],16,block,256))return 0;
 }
 uint32_t state[5],priorities[8],order[8];reset(state,data[0x4c/4]);
 for(unsigned i=0;i<8;i++){priorities[i]=number(state,0xffffffffu);unsigned position=0;while(position<i&&priorities[i]<priorities[order[position]])position++;for(unsigned j=i;j>position;j--)order[j]=order[j-1];order[position]=i;}
 if((error=uc_mem_write(e,object+0x334,state,20)))return error;uint32_t first=objects[order[0]]+4,last=objects[order[7]]+4;if((error=uc_mem_write(e,object+0x328,&first,4)))return error;if((error=uc_mem_write(e,object+0x330,&last,4)))return error;
 for(unsigned position=0;position<8;position++){unsigned i=order[position];uint32_t links[4]={position<7?objects[order[position+1]]+4:head,objects[i],position?objects[order[position-1]]+4:head,priorities[i]};if((error=uc_mem_write(e,objects[i]+4,links,16)))return error;}
 for(unsigned position=0;position<8;position++){
  unsigned i=order[position],kind=types[i];uint32_t seed=data[0x2c/4+position],args[4]={objects[i],seed,0,0},result=0,accepted=0;
  if(kind==1){if((error=uc_mem_write(e,objects[i]+0x14,&seed,4)))return error;}
  else if(kind==0||kind==6||kind==7){uint32_t generator[5];reset(generator,seed);if((error=uc_mem_write(e,objects[i]+0x14,generator,20)))return error;}
  else {if((error=ou_guest_crypto(e,kind-1,args,&result,&accepted)))return error;if(!accepted)return UC_ERR_ARG;}
 }
 for(unsigned position=0;position<8;position++){unsigned i=order[data[0xc/4]==1?position:7-position];uint32_t args[4]={objects[i],block,data[0xc/4],0},result=0,accepted=0;if((error=ou_guest_crypto(e,types[i]+5,args,&result,&accepted)))return error;if(!accepted||result!=1)return UC_ERR_ARG;}
 uint32_t cpsr=0;if((error=uc_reg_read(e,UC_ARM_REG_CPSR,&cpsr)))return error;cpsr=(cpsr&0x0fffffffu)|0x60000000u;if((error=uc_reg_write(e,UC_ARM_REG_CPSR,&cpsr)))return error;*handled=1;return 0;
}
