/** Package the browser port and verified runtime data for one-click play. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'_site');
const gameData=JSON.parse(fs.readFileSync(path.join(root,'port/game-data.json')));
// Verify required payloads before replacing the last working website.
for(const spec of gameData.files){
 const source=path.join(root,'_runtime/data',spec.path);
 if(!fs.existsSync(source))throw Error('Missing runtime data. Download and extract the game-data release first (see README): '+spec.path);
 const bytes=fs.readFileSync(source);
 if(bytes.length!==spec.size||crypto.createHash('sha256').update(bytes).digest('hex')!==spec.sha256)throw Error('Runtime data failed verification: '+spec.path);
}
const record=JSON.parse(fs.readFileSync(path.join(root,'port/build/emulator-build.json')));
const bundle=fs.readFileSync(path.join(root,'port/build/unicorn-arm.js'));
if(crypto.createHash('sha256').update(bundle).digest('hex')!==record.bundle_sha256)throw Error('Emulator bundle differs from its build record. Rebuild before publishing.');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(out,{recursive:true});
const copy=(source,target)=>fs.copyFileSync(path.join(root,source),path.join(out,target));
const modules=[...['app.mjs','loop.mjs','mouse.mjs','downloads.mjs','tutorial.mjs'].map(name=>({source:'port/web/'+name,target:name})),...fs.readdirSync(path.join(root,'port/runtime')).filter(name=>name.endsWith('.mjs')).sort().map(name=>({source:'port/runtime/'+name,target:'runtime/'+name}))];
const versionHash=crypto.createHash('sha256').update(bundle).update(fs.readFileSync(path.join(root,'port/web/index.html')));
for(const item of modules)versionHash.update(item.target).update(fs.readFileSync(path.join(root,item.source)));
const appVersion=versionHash.digest('hex').slice(0,16);
const versionModule=text=>text.replace(/(['"])(\.{1,2}\/[^'"?#]+\.mjs)\1/g,(_match,quote,specifier)=>quote+specifier+'?v='+appVersion+quote).replace("new URL('./unicorn.js',import.meta.url)","new URL('./unicorn.js?v="+appVersion+"',import.meta.url)");
const html=fs.readFileSync(path.join(root,'port/web/index.html'),'utf8').replace('src="./app.mjs"','src="./app.mjs?v='+appVersion+'"');
fs.writeFileSync(path.join(out,'index.html'),html);fs.mkdirSync(path.join(out,'runtime'));
for(const item of modules)fs.writeFileSync(path.join(out,item.target),versionModule(fs.readFileSync(path.join(root,item.source),'utf8')));
fs.writeFileSync(path.join(out,'build.json'),JSON.stringify({version:appVersion,bundle_sha256:record.bundle_sha256},null,2)+'\n');
copy('port/build/unicorn-arm.js','unicorn.js');copy('port/build/emulator-build.json','emulator-build.json');
fs.cpSync(path.join(root,'port/licenses'),path.join(out,'licenses'),{recursive:true});
copy('port/THIRD_PARTY.md','THIRD_PARTY.md');fs.writeFileSync(path.join(out,'.nojekyll'),'');
for(const spec of gameData.files){
 fs.mkdirSync(path.dirname(path.join(out,spec.path)),{recursive:true});copy('_runtime/data/'+spec.path,spec.path);
}
fs.writeFileSync(path.join(out,'game/manifest.json'),JSON.stringify({version:gameData.version,files:gameData.files.map(({path,size,sha256})=>({path,size,sha256}))},null,2)+'\n');
console.log('Packaged the player and '+gameData.files.length+' runtime files in _site/. No file selection required.');
