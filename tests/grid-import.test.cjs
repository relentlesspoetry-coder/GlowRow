const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const html=readFileSync(join(__dirname,'../app/src/main/assets/index.html'),'utf8');
const src=html.match(/<script id="gridImportCore">([\s\S]*?)<\/script>/)[1];
const analyze=vm.runInNewContext(src+'\n(color,opts)=>JSON.stringify(GlowRowImport.analyze(color,opts))');
const run=(image,opts)=>JSON.parse(analyze(image,opts));
const C=['#f6f6f8','#9b9db1','#2c3670','#ffffff','#111111','#e82932','#d9bc55'];
function base(width,height,color){
 const data=new Uint8Array(width*height*4);
 const paint=(x,y,color)=>{if(x<0||x>=width||y<0||y>=height)return;
  const n=parseInt(color.slice(1),16),p=4*(y*width+x);
  data[p]=n>>16;data[p+1]=(n>>8)&255;data[p+2]=n&255;data[p+3]=255;
 };
 const rect=(a,b,w,h,color)=>{for(let y=b;y<b+h;y++)for(let x=a;x<a+w;x++)paint(x,y,color);};
 rect(0,0,width,height,color);
 return {image:{data,width,height},paint,rect};
}
function chart(cols,rows,{pitch=13,frame=[0,0,0,0],guides=true,thick=true,minor=1}={}){
 const [left,top,right,bottom]=frame;
 const {image,paint,rect}=base(left+pitch*cols+3+right,top+pitch*rows+3+bottom,'#fefefe');
 const expected=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>
  C[r===c&&r%3===0?5:((r*3+c*5+(r^c))%C.length)]));
 // Chart cells are solid; labels and framing are outside the chart border.
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)rect(left+c*pitch+1,top+r*pitch+1,pitch,pitch,expected[r][c]);
 if(guides){
  for(let y=0;y<=rows*pitch;y++){
   for(const diagonal of [-1,0,1,2]){
    const c=y+diagonal*pitch*5;
    for(let x=c-1;x<=c+1;x++)if(x>=0&&x<cols*pitch)paint(left+x,top+y,'#f01328');
   }
  }
 }
 for(let c=0;c<=cols;c++){
  const n=c===0||c===cols?3:thick&&c%5===0?3:minor;
  rect(left+c*pitch-(c!==0&&c!==cols&&n===3?1:0),top,n,rows*pitch+3,'#343640');
 }
 for(let r=0;r<=rows;r++){
  const n=r===0||r===rows?3:thick&&r%5===0?3:minor;
  rect(left,top+r*pitch-(r!==0&&r!==rows&&n===3?1:0),cols*pitch+3,n,'#343640');
 }
 if(left>12)rect(1,top,3,rows*pitch+3,'#232327');
 if(top>16)for(let j=0;j<12;j++)rect(left+6*j,3,3,j%2===0?6:8,'#252626');
 return {image,expected};
}
test('detects 23×23 even if the dialog was previously set to 30×30',()=>{
 const {image,expected}=chart(23,23,{frame:[26,31,6,10]});
 const mismatch=run(image,{mode:'chart',cols:30,rows:30});
 assert.equal(mismatch.method,'needs-input');
 assert.deepEqual(mismatch.detected,{width:23,height:23});
 const result=run(image,{mode:'chart',cols:23,rows:23});
 assert.equal(result.method,'detected');
 assert.deepEqual([result.width,result.height],[23,23]);
 assert.deepEqual(result.colors,expected);
 assert.ok(result.bounds.x>0.06&&result.bounds.y>0.08);
});
test('thick 30×30 chart excludes lines, preserves real reds and all exact grays',()=>{
 const {image,expected}=chart(30,30,{pitch:15,minor:2});
 for(const ignoreRedGuides of [false,true]){
  const result=run(image,{mode:'chart',ignoreRedGuides});
  assert.equal(result.method,'detected');
  assert.deepEqual(result.colors,expected);
 }
});
test('prints true rectangular dimensions rather than forcing a square',()=>{
 const {image,expected}=chart(11,7,{pitch:15,frame:[8,4,5,1]});
 const result=run(image,{mode:'chart'});
 assert.equal(result.method,'detected');
 assert.deepEqual(result.colors,expected);
});
test('manual fallback is explicit and keeps exact original colors on a known crop',()=>{
 const {image,rect}=base(45,44,'#ffffff');
 const colors=[['#5d5e5f','#19191a'],['#eb1614','#f8c3d2']];
 colors.forEach((row,r)=>row.forEach((color,c)=>rect(5+c*20,4+r*20,20,20,color)));
 const crop={x:5/45,y:4/44,w:40/45,h:40/44};
 const a=run(image,{mode:'chart',cols:2,rows:2,crop});
 assert.equal(a.method,'needs-input');
 assert.deepEqual(a.colors,[]);
 assert.equal(run(image,{mode:'pixel'}).method,'needs-input');
 const b=run(image,{mode:'chart',cols:2,rows:2,crop,useManual:true});
 assert.deepEqual(b.colors,colors);
 assert.equal(b.method,'manual');
 assert.deepEqual(run(image,{mode:'pixel',cols:2,rows:2,crop}).colors,colors);
});
test('pixel art keeps genuine red, black and pale grayscale without artificial quantizing',()=>{
 const {image,rect}=base(45,44,'#ffffff');
 const colors=[['#e21b32','#111113'],['#201d19','#f5f5f4']];
 colors.forEach((row,r)=>row.forEach((color,c)=>rect(c*10,r*10,10,10,color)));
 const result=run(image,{mode:'pixel',cols:2,rows:2,crop:{x:0,y:0,w:20/45,h:20/44},ignoreRedGuides:true});
 assert.deepEqual(result.colors,colors);
});

test('recovers periodic grid lines whose color changes with the underlying stitch',()=>{
 const cols=16,rows=12,pitch=20;
 const {image,paint,rect}=base(cols*pitch+1,rows*pitch+1,'#ffffff');
 const expected=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>C[(c+3*r)%C.length]));
 for(let r=0;r<rows;r++)for(let c=0;c<cols;c++)rect(c*pitch+1,r*pitch+1,pitch-1,pitch-1,expected[r][c]);
 const darken=(first,second)=>{
  const rgb=(v,k)=>parseInt(v.slice(1+2*k,3+2*k),16);
  return '#'+[0,1,2].map(k=>Math.round((rgb(first,k)+rgb(second,k))*.18).toString(16).padStart(2,'0')).join('');
 };
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(!(x%pitch)||!(y%pitch)){
  const r=Math.min(rows-1,Math.floor(y/pitch)),c=Math.min(cols-1,Math.floor(x/pitch));
  const adjacent=!(x%pitch)?expected[r][Math.max(0,c-1)]:expected[Math.max(0,r-1)][c];
  paint(x,y,darken(expected[r][c],adjacent));
 }
 const result=run(image,{mode:'chart'});
 assert.equal(result.method,'detected');
 assert.deepEqual([result.width,result.height],[cols,rows]);
 assert.deepEqual(result.colors,expected);
});

test('consolidates small raster variations only when requested for a printed chart',()=>{
 const {image,rect}=base(40,40,'#fefefe');
 const colors=[['#eeeeee','#ededed','#eeeeee','#101217'],['#101217','#121317','#101217','#e32b24'],
 ['#eeeeee','#efeeee','#101217','#e12c24'],['#ededed','#eeeeee','#e32b24','#bd3034']];
 colors.forEach((row,r)=>row.forEach((color,c)=>rect(c*10,r*10,10,10,color)));
 const options={cols:4,rows:4,useManual:true};
 const raw=run(image,{...options,mode:'chart'});
 assert.deepEqual(raw.colors,colors);
 assert.deepEqual(run(image,{...options,mode:'pixel',compressPalette:true}).colors,colors);
 assert.deepEqual(run(image,{...options,mode:'chart',compressPalette:true}).colors,[
 ['#eeeeee','#eeeeee','#eeeeee','#101217'],['#101217','#101217','#101217','#e32b24'],
 ['#eeeeee','#eeeeee','#101217','#e32b24'],['#eeeeee','#eeeeee','#e32b24','#bd3034'],
 ]);
});
