// Bounded architecture probe: this does not load/relocate or boot the game.
export function runARMProbe(uc, guest, crcCases, vfpCases, host = {}) {
 const engine = new uc.Unicorn(uc.ARCH_ARM, uc.MODE_ARM);
 const stop=0x7f0000, obj=0x700000;
 const bytes=hex=>Uint8Array.from(hex.match(/../g)||[],h=>parseInt(h,16));
 const hex=data=>Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
 const check=(actual,expected,label)=>{if(actual!==expected)throw Error(`${label}: ${actual} != ${expected}`);};
 let crcPassed=0, vfpPassed=0;
 try {
  engine.mem_map(0,guest.length,uc.PROT_ALL);engine.mem_write(0,guest);
  for(const c of crcCases){
   const input=bytes(c.hex);engine.mem_write(obj,Uint8Array.from([...input,0]));
   engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);
   engine.reg_write_i32(uc.ARM_REG_R0,c.address);engine.reg_write_i32(uc.ARM_REG_R1,c.seed);
   engine.reg_write_i32(uc.ARM_REG_LR,stop);engine.emu_start(0x3a4770,stop,0,1000000);
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,stop,'CRC return');
   check(engine.reg_read_i32(uc.ARM_REG_R0)>>>0,c.expected,'CRC result');crcPassed++;
  }
  engine.reg_write_i32(uc.ARM_REG_C1_C0_2,0x00f00000);
  engine.reg_write_i32(uc.ARM_REG_FPEXC,0x40000000);
  for(const c of vfpCases){
   engine.mem_write(obj,new Uint8Array(4096));
   engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);engine.reg_write_i32(uc.ARM_REG_FPSCR,0);
   for(const [i,r] of [uc.ARM_REG_R0,uc.ARM_REG_R1,uc.ARM_REG_R2,uc.ARM_REG_R3].entries())engine.reg_write_i32(r,c.args[i]||0);
   for(const w of c.writes)engine.mem_write(w.address,bytes(w.hex));
   engine.reg_write_i32(uc.ARM_REG_LR,stop);engine.emu_start(c.entry,stop,0,1000);
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,stop,c.name+' return');
   check(engine.reg_read_i32(uc.ARM_REG_R0)>>>0,c.expected_r0,c.name+' r0');
   for(const r of c.reads)check(hex(engine.mem_read(r.address,r.hex.length/2)),r.hex,c.name+' memory');vfpPassed++;
  }
  // A real game float wrapper branches through its original PLT, whose GOT
  // relocation slot is patched to one host trap. This is not a general loader.
  const trap=0x7e0000, slot=0x43a690, wrapper=0x339a7c;
  const word=value=>{const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,value,true);return b;};
  const floatBits=value=>{const b=new ArrayBuffer(4),d=new DataView(b);d.setFloat32(0,value,true);return d.getUint32(0,true);};
  const asFloat=value=>{const b=new ArrayBuffer(4),d=new DataView(b);d.setUint32(0,value,true);return d.getFloat32(0,true);};
  engine.mem_write(slot,word(trap));engine.mem_write(trap,word(0xe12fff1e)); // bx lr
  const depthCalls=[];
  const hook=engine.hook_add(uc.HOOK_CODE,e=>{
   const values=[e.reg_read_i32(uc.ARM_REG_R0)>>>0,e.reg_read_i32(uc.ARM_REG_R1)>>>0].map(asFloat);
   depthCalls.push(values);host.depthRange?.(...values);
  },null,trap,trap);
  try{
   engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);engine.reg_write_i32(uc.ARM_REG_R0,obj);
   engine.reg_write_i32(uc.ARM_REG_R1,floatBits(0.125));engine.reg_write_i32(uc.ARM_REG_R2,floatBits(0.875));
   engine.reg_write_i32(uc.ARM_REG_LR,stop);engine.emu_start(wrapper,stop,0,100);
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,stop,'Import wrapper return');
   check(JSON.stringify(depthCalls),'[[0.125,0.875]]','Original softfp GL import arguments');
  }finally{engine.hook_del(hook);}

  // Two guest execution contexts share memory and are interleaved while each
  // original routine is suspended. This proves context primitives, not pthreads.
  const a=engine.context_alloc(),b=engine.context_alloc();
  const caseA=crcCases.find(c=>c.address!==0&&c.hex.length>20),caseB=vfpCases[10];
  const workerObj=0x710000, workerOffset=workerObj-obj;
  const sentinelD7=0x3ff123456789abcdn, sentinelFPSCR=0x00400000;
  try{
   engine.mem_write(obj,Uint8Array.from([...bytes(caseA.hex),0]));
   engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);engine.reg_write_i32(uc.ARM_REG_R0,caseA.address);
   engine.reg_write_i32(uc.ARM_REG_R1,caseA.seed);engine.reg_write_i32(uc.ARM_REG_LR,stop);
   engine.reg_write_i32(uc.ARM_REG_SP,0x780000);engine.reg_write_i32(uc.ARM_REG_FPSCR,sentinelFPSCR);
   engine.reg_write_i64(uc.ARM_REG_D7,sentinelD7);
   engine.emu_start(0x3a4770,stop,0,5);
   const pcA=engine.reg_read_i32(uc.ARM_REG_PC)>>>0,cpsrA=engine.reg_read_i32(uc.ARM_REG_CPSR)>>>0;
   if(pcA===stop)throw Error('Thread A did not suspend');engine.context_save(a);
   engine.mem_write(workerObj,new Uint8Array(4096));
   for(const w of caseB.writes)engine.mem_write(w.address+workerOffset,bytes(w.hex));
   engine.reg_write_i32(uc.ARM_REG_CPSR,0x10);engine.reg_write_i32(uc.ARM_REG_R0,workerObj);
   engine.reg_write_i32(uc.ARM_REG_SP,0x770000);engine.reg_write_i32(uc.ARM_REG_LR,stop);
   engine.reg_write_i32(uc.ARM_REG_FPSCR,0);engine.reg_write_i64(uc.ARM_REG_D7,0n);
   engine.emu_start(caseB.entry,stop,0,3);
   const pcB=engine.reg_read_i32(uc.ARM_REG_PC)>>>0,d7B=engine.reg_read_i64(uc.ARM_REG_D7);
   if(pcB===stop)throw Error('Thread B did not suspend');engine.context_save(b);
   engine.context_restore(a);
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,pcA,'Thread A pc');
   check(engine.reg_read_i32(uc.ARM_REG_SP)>>>0,0x780000,'Thread A stack');
   check(engine.reg_read_i32(uc.ARM_REG_CPSR)>>>0,cpsrA,'Thread A flags');
   check(engine.reg_read_i32(uc.ARM_REG_FPSCR)>>>0,sentinelFPSCR,'Thread A FPSCR');
   check(engine.reg_read_i64(uc.ARM_REG_D7),sentinelD7,'Thread A VFP register');
   engine.emu_start(pcA,stop,0,1000000);check(engine.reg_read_i32(uc.ARM_REG_R0)>>>0,caseA.expected,'Resumed original CRC');
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,stop,'Resumed thread A return');
   engine.context_restore(b);
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,pcB,'Thread B pc');
   check(engine.reg_read_i32(uc.ARM_REG_SP)>>>0,0x770000,'Thread B stack');
   check(engine.reg_read_i32(uc.ARM_REG_FPSCR)>>>0,0,'Thread B FPSCR');
   check(engine.reg_read_i64(uc.ARM_REG_D7),d7B,'Thread B VFP register');
   engine.emu_start(pcB,stop,0,1000);
   for(const r of caseB.reads)check(hex(engine.mem_read(r.address+workerOffset,r.hex.length/2)),r.hex,'Resumed original VFP routine');
   check(engine.reg_read_i32(uc.ARM_REG_PC)>>>0,stop,'Resumed thread B return');
  }finally{engine.context_free(a);engine.context_free(b);}
  return {crc_cases:crcPassed,vfp_cases:vfpPassed,original_functions:7,
   imported_float_call:'Original SetDepthRange -> original PLT -> patched GOT -> host hook; softfp values 0.125 and 0.875 preserved',
   guest_context_switch:'Two suspended original routines resumed; PC, SP, CPSR, FPSCR and D7 checked; outputs matched',
   scope:'Original ARM leaf routines plus one imported GL wrapper executed by Unicorn.js WebAssembly. One GOT slot and two guest CPU contexts tested; no general ELF loader, pthread scheduler, JNI, full engine, or frame-rate proof.'};
 } finally {engine.close();}
}
