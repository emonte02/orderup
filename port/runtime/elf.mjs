/** ELF32/ARM loader. Guest addresses stay independent of JavaScript/WASM pointers. */
export class ArmElf {
 constructor(data){
  this.bytes=data instanceof Uint8Array?data:new Uint8Array(data);this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);
  const v=this.view;if(v.getUint32(0,true)!==0x464c457f||v.getUint8(4)!==1||v.getUint8(5)!==1||v.getUint16(18,true)!==40)throw Error('Expected little-endian ELF32 ARM');
  const range=(o,n)=>{if(o<0||n<0||o+n>this.bytes.length)throw Error('ELF range exceeds file');};this.range=range;
  const phoff=v.getUint32(28,true),phsize=v.getUint16(42,true),phnum=v.getUint16(44,true);
  this.segments=[];for(let i=0;i<phnum;i++){const p=phoff+i*phsize;range(p,32);this.segments.push({type:v.getUint32(p,true),offset:v.getUint32(p+4,true),address:v.getUint32(p+8,true),filesz:v.getUint32(p+16,true),memsz:v.getUint32(p+20,true),flags:v.getUint32(p+24,true)});}
  const shoff=v.getUint32(32,true),shsize=v.getUint16(46,true),shnum=v.getUint16(48,true),strndx=v.getUint16(50,true);
  this.sections=[];for(let i=0;i<shnum;i++){const p=shoff+i*shsize;range(p,40);this.sections.push({nameOffset:v.getUint32(p,true),type:v.getUint32(p+4,true),address:v.getUint32(p+12,true),offset:v.getUint32(p+16,true),size:v.getUint32(p+20,true),link:v.getUint32(p+24,true),entsize:v.getUint32(p+36,true)});}
  const names=this.sections[strndx];for(const s of this.sections)s.name=this.string(names.offset+s.nameOffset);
  this.symbols=[];const sym=this.sections.find(s=>s.type===11);if(!sym)throw Error('ELF has no dynamic symbol table');const strings=this.sections[sym.link];
  for(let p=sym.offset;p<sym.offset+sym.size;p+=sym.entsize){range(p,16);this.symbols.push({name:this.string(strings.offset+v.getUint32(p,true)),value:v.getUint32(p+4,true),size:v.getUint32(p+8,true),info:v.getUint8(p+12),section:v.getUint16(p+14,true)});}
  this.named=new Map(this.symbols.filter(s=>s.name).map(s=>[s.name,s]));
  this.relocations=[];for(const s of this.sections.filter(s=>s.type===9))for(let p=s.offset;p<s.offset+s.size;p+=s.entsize){range(p,8);const info=v.getUint32(p+4,true);this.relocations.push({address:v.getUint32(p,true),type:info&255,symbol:this.symbols[info>>>8]});}
 }
 string(offset){this.range(offset,1);let end=offset;while(end<this.bytes.length&&this.bytes[end])end++;if(end===this.bytes.length)throw Error('Unterminated ELF string');return new TextDecoder().decode(this.bytes.subarray(offset,end));}
 load(runtime){
  const loads=this.segments.filter(s=>s.type===1),last=Math.max(...loads.map(s=>s.address+s.memsz));runtime.map(0,(last+4095)&~4095);
  for(const s of loads){this.range(s.offset,s.filesz);if(s.filesz>s.memsz)throw Error('Invalid ELF segment');runtime.write(s.address,this.bytes.subarray(s.offset,s.offset+s.filesz));}
  const imports=new Map();for(const s of this.symbols.filter(s=>s.name&&!s.section))imports.set(s.name,runtime.resolveImport(s));
  const counts={};for(const r of this.relocations){counts[r.type]=(counts[r.type]||0)+1;const value=r.symbol?.section?r.symbol.value:imports.get(r.symbol?.name);switch(r.type){case 0:break;case 23:break;case 21:case 22:if(value===undefined)throw Error('Unresolved ELF symbol '+r.symbol?.name);runtime.u32(r.address,value);break;case 2:runtime.u32(r.address,(runtime.u32(r.address)+value)>>>0);break;default:throw Error('Unsupported ARM relocation '+r.type);}}
  const init=this.sections.find(s=>s.name==='.init_array');this.initializers=[];if(init)for(let p=init.address;p<init.address+init.size;p+=4){const a=runtime.u32(p);if(a&&a!==0xffffffff)this.initializers.push(a);}
  this.loadReport={segments:loads.length,mapped_bytes:last,relocations:counts,imports:imports.size,initializers:this.initializers.length};return this.loadReport;
 }
 address(name){const s=this.named.get(name);if(!s?.section)throw Error('Missing defined ELF symbol '+name);return s.value;}
}
