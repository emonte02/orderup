/** Mouse-only integration driver for the original diner recipe. No game-state writes. */
import {tap,drag} from './cooking_helpers.mjs';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function visibleChopGuide(page){return page.evaluate(()=>{
 const canvas=document.querySelector('canvas'),pixels=canvas.getContext('2d').getImageData(350,210,300,220).data;let sum=0,count=0;
 for(let y=0;y<220;y++)for(let x=0;x<300;x++){const i=(y*300+x)*4;if(pixels[i]>225&&pixels[i+1]>220&&pixels[i+2]<85){sum+=x+350;count++;}}
 return count?{x:sum/count,count}:null;
});}
export async function cookDinerHamburger(page,ticketX=350,{log=()=>{}}={}){
 const plate=async(x,y)=>{await tap(page,880,60,250);await tap(page,x,y,900);};
 const select=async y=>{await tap(page,ticketX,80,500);await tap(page,230,y,500);await tap(page,630,300,1100);};
 await select(305);await wait(12500);await drag(page,480,360,480,210,300);await wait(12500);await plate(480,360);log('Burger plated');
 await select(390);for(let i=0;i<12;i++){await drag(page,450,320,700,320,260);await wait(850);}await plate(550,290);log('Lettuce plated');
 await select(480);for(let i=0;i<8;i++){let guide=null;for(let j=0;j<12&&!guide;j++){await wait(250);guide=await visibleChopGuide(page);}if(!guide)break;await drag(page,guide.x,235,guide.x,430,180);await wait(1500);}await plate(550,350);log('Tomato plated');
 await select(570);await drag(page,480,280,480,480,300);await wait(26500);await drag(page,480,470,480,290,300);await plate(480,350);log('Fries plated');
 if(await page.evaluate(()=>orderup.error))throw Error(await page.evaluate(()=>orderup.error));
}
export async function serveDinerMeals(page){await tap(page,200,60,8000);await tap(page,200,230,10000);}
