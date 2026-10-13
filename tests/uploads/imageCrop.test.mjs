import test from 'node:test';
import assert from 'node:assert/strict';
import {percentCropRatio,fitCropRatio,resizeCrop} from '../../src/utils/imageCrop.js';
test('presets produce their pixel ratio on portrait, landscape and rotated images',()=>{
 for(const [w,h] of [[640,480],[480,640]])for(const rotation of [0,90,180,270])for(const ratio of [1,4/3,16/9,1/1.414]){
  const r=percentCropRatio(w,h,rotation,ratio);const crop=fitCropRatio({x:10,y:10,width:80,height:80},r);
  for(const box of [crop,resizeCrop(crop,99,99,'se',r),resizeCrop(crop,-99,-99,'nw',r)]){
   const actual=rotation%180 ? box.height*h/(box.width*w) : box.width*w/(box.height*h);
   assert.ok(Math.abs(actual-ratio)<1e-8);assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=100.00001&&box.y+box.height<=100.00001);
  }
 }
});
test('freeform keeps independent dimensions',()=>{assert.equal(percentCropRatio(640,480,0,null),null);assert.deepEqual(resizeCrop({x:10,y:10,width:40,height:30},10,5,'se',null),{x:10,y:10,width:50,height:35});});
