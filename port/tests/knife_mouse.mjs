/** Knife Skills: time repeated downward mouse strokes against the original moving cleaver. */
import {drag} from './cooking_helpers.mjs';
import {readCanvasText} from './scene_helpers.mjs';
export async function playKnifeSkillsRound(page,{timeout=100000,onProgress=()=>{}}={}){
 const began=Date.now();let strokes=0,maximumChops=0,text=[];
 while(Date.now()-began<timeout){
  const error=await page.evaluate(()=>orderup.error);if(error)throw Error(error);
  await drag(page,480,230,480,460,180);strokes++;await page.waitForTimeout(420);
  if(strokes%4===0){
   text=(await readCanvasText(page)).map(x=>x.text);for(const label of text){const m=label.match(/(\d+)\s*\/\s*10/);if(m)maximumChops=Math.max(maximumChops,Number(m[1]));}
   onProgress({strokes,chops:maximumChops,text});if(text.some(x=>x==='OK')&&text.some(x=>/^Knife Skills/.test(x)))break;
  }
 }
 return{mouse_only_input:true,downward_strokes:strokes,maximum_chops:maximumChops,elapsed_ms:Date.now()-began,result_text:text,error:await page.evaluate(()=>orderup.error)};
}
