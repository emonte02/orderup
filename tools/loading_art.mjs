import {inflateSync,deflateSync} from 'node:zlib';

// Export the original title logo and loading-screen character before boot.
// Art stays in the verified game-data release; no duplicate game binaries or
// extra image libraries are required in source control or the Pages build.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
const crc=bytes=>{let n=0xffffffff;for(const b of bytes)n=(n>>>8)^crcTable[(n^b)&255];return(n^0xffffffff)>>>0;};
const nameHash=name=>(crc(Buffer.from(name.toLowerCase()))^0xffffffff)>>>0;
function wadFile(archive,name){
 if(archive.toString('ascii',0,4)!=='0DAW'||archive.readUInt32LE(4)!==4)throw Error('Invalid loading artwork archive');
 const count=archive.readUInt32LE(8),header=archive.readUInt32LE(12),mode=archive.readUInt32LE(20),hash=nameHash(name);
 for(let i=0;i<count;i++){
  if(archive.readUInt32LE(48+i*8)!==hash)continue;
  const index=archive.readUInt32LE(52+i*8),table=48+count*8+index*8,offset=archive.readUInt32LE(table),size=archive.readUInt32LE(table+4);
  let bytes;
  if(mode===2){const block=48+count*16+index*8,start=archive.readUInt32LE(block),length=archive.readUInt32LE(block+4),stored=archive.subarray(start,start+length);bytes=length===size?stored:inflateSync(stored);}
  else if(mode===1){const body=inflateSync(archive.subarray(header,header+archive.readUInt32LE(28)));bytes=body.subarray(offset-header,offset-header+size);}
  else if(mode===0)bytes=archive.subarray(offset,offset+size);
  else throw Error('Unknown loading artwork archive mode');
  if(bytes.length!==size)throw Error('Truncated loading artwork: '+name);
  return bytes;
 }
 throw Error('Missing original loading artwork: '+name);
}

// ETC1 bit layout and intensity tables from the Khronos GLES extension:
// https://registry.khronos.org/OpenGL/extensions/OES/OES_compressed_ETC1_RGB8_texture.txt
function decodeETC1(bytes,width,height){
 if(width%4||height%4||bytes.length!==width*height/2)throw Error('Invalid ETC1 artwork dimensions');
 const pixels=new Uint8Array(width*height*3),levels=[[2,8],[5,17],[9,29],[13,42],[18,60],[24,80],[33,106],[47,183]];
 const expand5=n=>((n&31)<<3)|((n&31)>>>2),signed3=n=>(n&4)?(n&7)-8:n&7;
 let offset=0;
 for(let by=0;by<height;by+=4)for(let bx=0;bx<width;bx+=4){
  const high=bytes.readUInt32BE(offset),low=bytes.readUInt32BE(offset+4);offset+=8;
  const colors=[[],[]];
  for(let c=0;c<3;c++){
   const packed=(high>>>(24-c*8))&255;
   if(high&2){colors[0][c]=expand5(packed>>>3);colors[1][c]=expand5((packed>>>3)+signed3(packed));}
   else{colors[0][c]=(packed>>>4)*17;colors[1][c]=(packed&15)*17;}
  }
  for(let y=0;y<4;y++)for(let x=0;x<4;x++){
   const half=(high&1)?y>>>1:x>>>1,table=(high>>>(half?2:5))&7,bit=x*4+y;
   const delta=levels[table][(low>>>bit)&1]*((low>>>(bit+16))&1?-1:1),p=((by+y)*width+bx+x)*3;
   for(let c=0;c<3;c++)pixels[p+c]=Math.max(0,Math.min(255,colors[half][c]+delta));
  }
 }
 return pixels;
}
function png(width,height,rgba){
 const chunk=(type,data)=>{const body=Buffer.concat([Buffer.from(type),data]),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);body.copy(out,4);out.writeUInt32BE(crc(body),out.length-4);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 const rows=Buffer.alloc((width*4+1)*height);
 for(let y=0;y<height;y++){const row=y*(width*4+1),p=y*width*4;rows[row]=1;for(let x=0;x<width*4;x++)rows[row+1+x]=(rgba[p+x]-(x>=4?rgba[p+x-4]:0))&255;}
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function image(archive,name){
 const descriptor=wadFile(archive,'images/'+name+'.img.adr'),width=descriptor.readUInt32LE(8),height=descriptor.readUInt32LE(12);
 if(descriptor.length!==72||descriptor.readUInt32LE(16)!==4||descriptor.readUInt32LE(20)!==1)throw Error('Unexpected loading image format');
 const texture=offset=>decodeETC1(wadFile(archive,'images/imgdat/'+descriptor.readUInt32LE(offset).toString(16).padStart(8,'0')+'.imgdat.adr'),width,height);
 const rgb=texture(24),alpha=texture(60),rgba=Buffer.alloc(width*height*4);
 for(let i=0;i<width*height;i++){rgba[i*4]=rgb[i*3];rgba[i*4+1]=rgb[i*3+1];rgba[i*4+2]=rgb[i*3+2];rgba[i*4+3]=alpha[i*3];}
 // The original textures contain large transparent sprite margins. Export
 // only their occupied rectangle, preserving every visible decoded pixel.
 let left=width,top=height,right=0,bottom=0;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(rgba[(y*width+x)*4+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
 if(right<=left||bottom<=top)throw Error('Empty loading artwork');
 const cropped=Buffer.alloc((right-left)*(bottom-top)*4);
 for(let y=top;y<bottom;y++)rgba.copy(cropped,(y-top)*(right-left)*4,(y*width+left)*4,(y*width+right)*4);
 return png(right-left,bottom-top,cropped);
}
export function loadingArt(obb){
 return new Map([
  ['logo.png',image(wadFile(obb,'wad/gfx_shell.wad'),'ui/fe_titlescreen_logo')],
  ['inspector.png',image(wadFile(obb,'wad/gfx_loadscreens.wad'),'ui/interface/ui_cg_loadscreen_manhorn')],
 ]);
}
