import {floatBits} from './memory.mjs';

// Native Menu ABI from libOrderUp.so 1.65. Create real menu elements, retaining
// the original Back image and font through their native setters. Never clone
// object memory: linked lists, references, strings and handlers belong to C++.
const api={
 find:'_ZN4Menu7Manager16GetElementByNameE10checksum32b',
 create:'_ZN4Menu7Manager13CreateElementENS_7Element4TypeE10checksum32',
 destroy:'_ZN4Menu7Manager14DestroyElementEPNS_7ElementE',
 add:'_ZN4Menu9Container8AddChildEPNS_7ElementE',
 image:'_ZN4Menu5Image8SetImageEPN3Gfx5ImageEb',
 font:'_ZN4Menu4Text7SetFontEPN4Font4FontE',
 text:'_ZN4Menu4Text7SetTextEPKc',
 dims:'_ZN4Menu7Element17SetBaseDimensionsEff',
 focusable:'_ZN4Menu9Container12SetFocusableEb',
};
const type={panel:0x5d522cf0,image:0x3ac2fba0,text:0xc4745838};
function checksum(name){let value=0xffffffff;for(const ch of name.toLowerCase()){value^=ch.charCodeAt(0);for(let i=0;i<8;i++)value=(value>>>1)^((value&1)?0xedb88320:0);}return value>>>0;}
const names={button:checksum('browser_fullscreen_panel'),main:checksum('mainmenu'),overview:checksum('worldmap_exit_panel'),district:checksum('worldmap_back_panel')};

/** Call update only between completed guest entry points, on the frame loop. */
export function createNativeFullscreen(runtime,{enabled=()=>true,label=()=> 'Full Screen',pressed=()=>false,onBounds=()=>{},onMainMenu=()=>{}}={}){
 const r=runtime,managerAddress=r.elf.address('_ZN4Menu9g_ManagerE');
 const call=(name,...args)=>r.call(api[name],args);
 const children=panel=>{
  const result=[];let node=r.u32(panel+0x194);
  while(node&&node!==panel+0x18c&&result.length<128){result.push(node-0x20);node=r.u32(node+8);}
  return result;
 };
 const visible=element=>{
  for(let p=element,depth=0;p&&depth<32;p=r.u32(p+0x154),depth++)if((r.u8(p+0x180)&4)||r.f32(p+0x3c)*r.f32(p+0xbc)<0.01)return false;
  return !!element;
 };
 const copyStyle=(target,source)=>{
  // Value fields only: color, scale, local position, dimensions, justification.
  for(const[offset,size]of[[0x30,48],[0x78,8],[0x140,8]])r.write(target+offset,r.read(source+offset,size));
  r.u8(target+0x181,r.u8(target+0x181)|2); // always_visible, as on Back
 };
 let previousLabel='',previousPanel=0;
 return {async update(){
  const manager=r.u32(managerAddress);if(!manager){onMainMenu(false);onBounds(null);return;}
  onMainMenu(visible(await call('find',manager,names.main,1)));
  let panel=await call('find',manager,names.button,1);
  let back=await call('find',manager,names.overview,1);
  if(!visible(back))back=await call('find',manager,names.district,1);
  if(!enabled()||!visible(back)){
   if(panel)r.u8(panel+0x180,r.u8(panel+0x180)|4);
   onBounds(null);return;
  }
  const parent=r.u32(back+0x154),original=children(back);
  const sourceImage=original.find(p=>r.u32(p+0xac)===type.image),sourceText=original.find(p=>r.u32(p+0xac)===type.text);
  if(!parent||!sourceImage||!sourceText){onBounds(null);return;}
  if(panel&&r.u32(panel+0x154)!==parent){await call('destroy',manager,panel);panel=0;}
  let created=false;
  if(!panel){
   panel=await call('create',manager,type.panel,names.button);
   await call('focusable',panel,0);
   copyStyle(panel,back);r.u32(panel+0x140,checksum('right'));
   r.f32(panel+0x50,-r.f32(back+0x50));
   await call('add',parent,panel);
   const image=await call('create',manager,type.image,0);
   await call('image',image,r.u32(sourceImage+0x18c),0);
   copyStyle(image,sourceImage);await call('add',panel,image);
   const text=await call('create',manager,type.text,0);
   await call('font',text,r.u32(sourceText+0x1d4));
   copyStyle(text,sourceText);
   r.write(text+0x19c,r.read(sourceText+0x19c,36)); // highlight/shadow colors and x offset
   r.f32(text+0x1c0,r.f32(sourceText+0x1c0));
   r.u32(text+0x1ec,r.u32(sourceText+0x1ec));
   await call('add',panel,text);created=true;
  }
  const own=children(panel),text=own.find(p=>r.u32(p+0xac)===type.text),image=own.find(p=>r.u32(p+0xac)===type.image);
  const nextLabel=label();
  if(created||panel!==previousPanel||nextLabel!==previousLabel){
   const string=r.cstring(nextLabel);
   try{await call('text',text,string);}finally{r.free(string);}
   const width=r.f32(text+0x78)+r.f32(back+0x78)-r.f32(sourceText+0x78);
   await call('dims',panel,floatBits(width),r.u32(back+0x7c));
   await call('dims',image,floatBits(r.f32(sourceImage+0x78)*width/r.f32(back+0x78)),r.u32(sourceImage+0x7c));
   previousLabel=nextLabel;previousPanel=panel;
  }
  r.u8(panel+0x180,r.u8(panel+0x180)&~4);
  for(let i=0;i<3;i++)r.f32(image+0x30+i*4,r.f32(sourceImage+0x30+i*4)*(pressed()?0.8:1));
  // Effective coordinates are updated by the original renderer on the next
  // step. Publish only a rendered button, converted from native UI to canvas.
  if(created){onBounds(null);return;}
  let root=parent;for(let depth=0;r.u32(root+0x154)&&depth<32;depth++)root=r.u32(root+0x154);
  const sx=r.graphics.canvas.width/r.f32(root+0x78),sy=r.graphics.canvas.height/r.f32(root+0x7c);
  onBounds({x:r.f32(panel+0x98)*sx,y:r.f32(panel+0x9c)*sy,width:r.f32(panel+0x78)*sx,height:r.f32(panel+0x7c)*sy});
 }};
}
