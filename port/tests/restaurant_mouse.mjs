/** Original cooking interactions driven only by browser mouse input. */
import {tap,drag} from './cooking_helpers.mjs';
import {readCanvasText} from './scene_helpers.mjs';
import {visibleChopGuide} from './diner_mouse.mjs';
const labels=async page=>(await readCanvasText(page)).map(row=>row.text);
export async function dismissCookingTip(page){
 const rows=await readCanvasText(page);if(!rows.some(row=>row.text==='Tip!'))return false;
 const button=rows.find(row=>row.text==='OK');if(!button)throw Error('Cooking tip has no visible OK button');
 await tap(page,button.x*960,button.y*640,1400);return true;
}
export async function selectIngredient(page,ticketX,rowY){
 if((await labels(page)).some(text=>/^STEPS\b/i.test(text)))await tap(page,630,300,1000);
 await tap(page,ticketX,80,1500);await tap(page,230,rowY,1500);await dismissCookingTip(page);await tap(page,630,300,3500);
 if(await dismissCookingTip(page))await tap(page,630,300,2000);
}
export async function plateIngredient(page,x,y){await tap(page,880,60,150);await tap(page,x,y,2000);}
export async function circlePot(page,{turns=3}={}){
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);
 await move(565,270);await page.mouse.down();
 try{for(let i=0;i<turns*24;i++){const a=i*Math.PI/12;await move(480+85*Math.cos(a),270+85*Math.sin(a));await page.waitForTimeout(70);}}
 finally{await page.mouse.up();}
}
export async function waitCookingQuality(page,{timeout=22000}={}){
 const start=Date.now();let text=[];
 while(Date.now()-start<timeout){text=await labels(page);const quality=text.find(label=>/^(Good|Perfect)!+$/.test(label));if(quality)return quality;await page.waitForTimeout(800);}
 throw Error('Cooking did not reach Good/Perfect: '+text.join(' | '));
}
export async function cookPot(page){const started=Date.now();while(!(await labels(page)).some(label=>/^Stir!+$/i.test(label))){if(Date.now()-started>10000)throw Error('Pot is not the active cooking tool');await page.waitForTimeout(300);}await circlePot(page);const quality=await waitCookingQuality(page);await plateIngredient(page,480,270);return quality;}
export async function sautePan(page){if(!(await labels(page)).includes('Flip!'))throw Error('Pan is not the active cooking tool');await drag(page,565,425,535,190,300);const quality=await waitCookingQuality(page);await plateIngredient(page,480,245);return quality;}
export async function grateCheese(page){
 if(!(await labels(page)).some(label=>/^[GC]rate!$/i.test(label)))throw Error('Grater is not the active cooking tool');
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);
 await move(465,230);await page.mouse.down();
 try{for(let i=0;i<32;i++){await move(i%2?465:520,i%2?230:380);await page.waitForTimeout(110);}}
 finally{await page.mouse.up();}
 const start=Date.now();let text=await labels(page);
 while(text.some(label=>/^[GC]rate!$/i.test(label))&&Date.now()-start<12000){await drag(page,465,230,520,380,180);await drag(page,520,380,465,230,180);text=await labels(page);}
 if(text.some(label=>/^[GC]rate!$/i.test(label)))throw Error('Cheese grating did not finish');
 await plateIngredient(page,400,360);return text.find(label=>/^(Poor|OK|Good|Perfect)!$/.test(label))||'completed';
}

/** Slice each actual yellow guide, waiting for the native ingredient animation. */
export async function sliceOnBoard(page,{maxCuts=20}={}){
 let cuts=0,missingSince=0;const began=Date.now();
 while(Date.now()-began<60000){
  // Some kitchens have a yellow board outline. Stop on the native completion
  // label once its Slice prompt disappears; that outline is not another cut.
  if(cuts){const text=await labels(page);if(!text.some(label=>/\b(?:chop|slice)\s*!/i.test(label))&&text.some(label=>/^(Poor|OK|Good|Perfect)!$/.test(label)))break;}
  const guide=await visibleChopGuide(page);
  if(guide&&guide.count>5){
   if(cuts>=maxCuts)throw Error('Too many cutting guides');
   await drag(page,guide.x,235,guide.x,430,180);cuts++;missingSince=0;await page.waitForTimeout(1200);
  }else{
   missingSince||=Date.now();
   if(cuts&&Date.now()-missingSince>2500)break;
   if(!cuts&&Date.now()-began>8000)throw Error('No visible slicing guide');
   await page.waitForTimeout(300);
  }
 }
 if(!cuts)throw Error('No mouse cuts performed');
 const text=await labels(page);if(text.some(label=>/\b(?:chop|slice)\s*!/i.test(label)))throw Error('Slicing remains active');
 await plateIngredient(page,550,350);return{cuts,quality:text.find(label=>/^(Poor|OK|Good|Perfect)!$/.test(label))||'completed'};
}
/** The original cleaver charges from repeated vertical strokes while held. */
export async function quarterBird(page){
 if(!(await labels(page)).includes('Build Chop Power!'))throw Error('Quartering cleaver is not active');
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);
 for(let attempt=0;attempt<3;attempt++){
  await move(480,430);await page.mouse.down();
  try{for(let i=0;i<24;i++){await move(480,i%2?430:220);await page.waitForTimeout(80);}}
  finally{await page.mouse.up();}
  await page.waitForTimeout(1400);const text=await labels(page);
  if(!text.includes('Build Chop Power!')){await plateIngredient(page,480,290);return text.find(label=>/^(Poor|OK|Good|Perfect)!$/.test(label))||'completed';}
 }
 throw Error('Quartering did not finish');
}

/** Original gesture_dredge: quick up-left, right, down; release between rolls.
 * Original chefdata/4b019311.bin gives 30px movements and 0.5s per movement.
 * Coordinates assume a fresh, unpanned Italian dredging station. */
export async function dredgeCoating(page){
 if(!(await labels(page)).includes('Dredge!'))throw Error('Dredger is not the active cooking tool');
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);
 for(const x of [405,445,475,530]){
  const y=290;await move(x,y);await page.mouse.down();await page.waitForTimeout(1200);
  try{let from=[x,y];for(const to of [[x-30,y-30],[x+12,y-30],[x+12,y+12]]){
   for(let step=1;step<=4;step++){await move(from[0]+(to[0]-from[0])*step/4,from[1]+(to[1]-from[1])*step/4);await page.waitForTimeout(40);}
   await page.waitForTimeout(60);from=to;
  }await page.waitForTimeout(2500);}finally{await page.mouse.up();}
  await page.waitForTimeout(500);
 }
 await plateIngredient(page,535,290);return 'four coating gestures';
}

/** Oven and assistant UI icons select their food before the plate button acts. */
export async function plateOvenFood(page){await tap(page,200,60,1000);await tap(page,880,60,2200);}

/** Original cutter accepts a quick up-left flick, then plays its cut animation. */
export async function cutRavioli(page){
 if(!(await labels(page)).includes('Cut!'))throw Error('Ravioli cutter is not active');
 const b=await page.locator('canvas').boundingBox(),move=(x,y)=>page.mouse.move(b.x+x*b.width/960,b.y+y*b.height/640);
 for(let cut=0;cut<8;cut++){
  await move(500,315);await page.mouse.down();await page.waitForTimeout(1000);
  try{await move(420,235);await page.waitForTimeout(1900);}finally{await page.mouse.up();}
  await page.waitForTimeout(600);
 }
 await plateIngredient(page,500,315);return{cuts:8,gesture:'quick up-left flick'};
}
