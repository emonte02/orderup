import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readZipEntry,prepareGameFiles,gameFiles} from '../web/game-files.mjs';
// Exercise the two ZIP layouts in the APK using a small synthetic archive.
function zip(name,content,method=0){
 const filename=Buffer.from(name),data=Buffer.from(content),packed=method===8?deflateRawSync(data):data;
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(method,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(method,10);directory.writeUInt32LE(packed.length,20);directory.writeUInt32LE(data.length,24);directory.writeUInt16LE(filename.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length+filename.length,12);end.writeUInt32LE(local.length+filename.length+packed.length,16);
 return Buffer.concat([local,filename,packed,directory,filename,end]);
}
for(const method of [0,8])assert.equal(Buffer.from(await readZipEntry(zip('assets/test.bin','valid archive payload',method),'assets/test.bin')).toString(),'valid archive payload');
await assert.rejects(readZipEntry(new Uint8Array(4),'missing'),/not a ZIP/);
await assert.rejects(readZipEntry(zip('present','payload'),'missing'),/missing/);
const badOffset=zip('entry','data');badOffset.writeUInt32LE(0xffffffff,badOffset.length-6);await assert.rejects(readZipEntry(badOffset,'entry'),/Incomplete/);
const badLength=zip('entry','data');badLength.writeUInt32LE(100,30+5+4+20);await assert.rejects(readZipEntry(badLength,'entry'),/Incomplete/);
await assert.rejects(prepareGameFiles([]),/three files/);
await assert.rejects(prepareGameFiles([new File(['bad'],'wrong.apk'),new File(['bad'],'main.13.com.svsgames.orderup.obb'),new File(['bad'],'patch.13.com.svsgames.orderup.obb')]),/supported version/);
const forged=gameFiles.map(spec=>({name:spec.name,size:spec.size,arrayBuffer:async()=>Uint8Array.of(1,2,3).buffer}));
await assert.rejects(prepareGameFiles(forged),/does not match/);
console.log('Game file import: stored/deflated APK members, malformed archives, missing files, wrong versions, and modified data checked.');
