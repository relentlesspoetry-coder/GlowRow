const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app/src/main/assets/index.html'),'utf8').match(/<script id="gridImportCore">([\s\S]*?)<\/script>/)[1];
const run=vm.runInNewContext(src+'\n(image,opts)=>JSON.stringify(GlowRowImport.analyze(image,opts))');
const analyze=(image,opts={})=>JSON.parse(run(image,{mode:'chart',...opts}));
const palette=['#f6f6f8','#abb0bc','#445684','#ffffff','#292a2f','#e82932','#d9bc55'];
const light=['#dadada','#dedede','#dddddd','#dddddd','#dfdfdf','#e1e1e1','#d8d8d8'];
const weak=['#c0c0c0','#c4c4c4','#c1c1c1','#c2c2c2','#c3c3c3','#c5c5c5','#d6d6d6'];
const dusk=['#444444','#505050','#464646','#494949','#494949','#444444','#4f4f4f'];
const modes={dark:[palette,'#292733'],bright:[dusk,'#d3d3dd'],mild:[light,'#c5c5c5'],weak:[weak,'#bdbdbd']};
function seed(n){return ()=>((n=(1664525*n+1013904223)>>>0)/4294967296);}
function chart(w,h,p,mode,ps,margin=[0,0,0,0],cut=[0,0,0,0],faded=''){
 const [colors,rail]=modes[mode], rng=seed(ps); const [ml,mt,mr,mb]=margin,[cl,ct,cr,cb]=cut;
 const expected=Array.from({length:h},()=>Array.from({length:w},()=>colors[Math.floor(rng()*colors.length)]));
 const width=ml+w*p+1+mr-cl-cr,height=mt+h*p+1+mb-ct-cb,data=new Uint8Array(width*height*4);
 const patterned=(x,y)=>{
  if(x<0||y<0||x>w*p||y>h*p)return '#ffffff';
  if(!(x%p)||!(y%p)) {
    if((faded==='left'&&x>0&&x<p)||(faded==='right'&&x<w*p&&x>(w-1)*p)||
       (faded==='top'&&y>0&&y<p)||(faded==='bottom'&&y<h*p&&y>(h-1)*p))return '#cbcbcc';
    return rail;
  }
  return expected[Math.floor(y/p)][Math.floor(x/p)];
 };
 const numbers=new Map(); for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const color=patterned(x+cl-ml,y+ct-mt);if(!numbers.has(color))numbers.set(color,parseInt(color.slice(1),16));
  const n=numbers.get(color),z=4*(y*width+x);data[z]=n>>16;data[z+1]=(n>>8)&255;data[z+2]=n&255;data[z+3]=255;
 }
 return [{data,width,height},expected];
}
const cases=[];
for(const [w,h,p] of [[11,7,6],[16,12,9],[25,18,13],[31,27,20]])for(const contrast of ['dark','bright','mild','weak']){
 cases.push({label:'closed',w,h,p,contrast,cut:[0,0,0,0],margin:[0,0,0,0]});
 cases.push({label:'framed',w,h,p,contrast,cut:[0,0,0,0],margin:[8,5,11,10]});
 cases.push({label:'removed-rail',w,h,p,contrast,cut:[1,0,1,0]});
 cases.push({label:'opposite-weak-left',w,h,p,contrast,cut:[1,0,1,0],faded:'left'});
 cases.push({label:'quarter-removed',w,h,p,contrast,cut:[Math.ceil(p*.25),0,0,0]});
 cases.push({label:'half-removed',w,h,p,contrast,cut:[0,Math.ceil(p*.50),0,0]});
 cases.push({label:'most-removed',w,h,p,contrast,cut:[0,0,Math.floor(p*.82),0]});
 cases.push({label:'all-edges',w,h,p,contrast,cut:[1,1,1,1]});
}

test('regression matrix never imports a truncated or expanded chart, even with faded/cropped rails',()=>{
  let accepted=0,refused=0;
  for(const [i,c] of cases.entries()){
    const label=JSON.stringify(c);
    const [image,expected]=chart(c.w,c.h,c.p,c.contrast,183990+i,c.margin,c.cut,c.faded);
    const result=analyze(image);
    if(result.method==='needs-input'){
      assert.deepEqual(result.colors,[],label);
      assert.equal(result.detected,undefined,label);
      refused++;
    }else{
      assert.equal(result.method,'detected',label);
      assert.deepEqual([result.width,result.height],[c.w,c.h],label);
      assert.deepEqual(result.colors,expected,label);
      accepted++;
    }
  }
  assert.ok(accepted>=50&&refused>=40,'checks both successful and uncertain charts');
});

test('clean printed charts retain exact dimensions and cell colors across sizes and pitches',()=>{
  for(const [w,h,p] of [[5,7,9],[11,7,6],[25,18,13],[31,27,20]]){
    const [image,expected]=chart(w,h,p,'dark',6791);
    const result=analyze(image);
    assert.equal(result.method,'detected',`${w}×${h} pitch ${p}`);
    assert.deepEqual([result.width,result.height],[w,h]);
    assert.deepEqual(result.colors,expected);
  }
});

test('continued guides beyond a heavy outer border are not synthetic cells',()=>{
  const [w,h,p]=[25,18,13];
  for(const side of ['right','left','top','bottom']){
    const margin=Array(4).fill(0);
    margin[['left','top','right','bottom'].indexOf(side)]=p;
    const [image,expected]=chart(w,h,p,'mild',8222,margin);
    const [l,t]=margin;
    for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
      const xx=x-l,yy=y-t;
      const xmargin=xx<0||xx>w*p,ymargin=yy<0||yy>h*p;
      const lines=xmargin&&yy>=0&&yy<=h*p&&yy%p===0||ymargin&&xx>=0&&xx<=w*p&&xx%p===0;
      const edge=(side==='right'&&xx>w*p-2&&xx<=w*p||side==='left'&&xx>=0&&xx<3)&&!ymargin
             ||(side==='bottom'&&yy>h*p-2&&yy<=h*p||side==='top'&&yy>=0&&yy<3)&&!xmargin;
      if(lines||edge){const offset=4*(y*image.width+x);image.data.fill(197,offset,offset+3);}
    }
    const result=analyze(image);
    if(result.method==='detected'){
      assert.deepEqual([result.width,result.height],[w,h]);
      assert.deepEqual(result.colors,expected);
    }else assert.deepEqual(result.colors,[]);
  }
});

function rescale(image,scale,shear=0) {
  const width=Math.round(image.width*scale),height=Math.round(image.height*scale);
  const data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const srcY=Math.max(0,Math.min(image.height-1,Math.round((y+.5)/scale-.5)));
    const px=(x+.5)/scale-.5+(srcY-image.height/2)*shear;
    const srcX=Math.max(0,Math.min(image.width-1,Math.round(px)));
    const a=4*(srcY*image.width+srcX),b=4*(y*width+x);
    data.set(image.data.subarray(a,a+4),b);
  }
  return {data,width,height};
}

test('rescaling and a clipped near-full edge either recover the exact cells or ask for review',()=>{
  let accepted=0;
  const [image,expected]=chart(25,18,13,'dark',28619,[0,0,1,0],[0,0,0,2]);
  for(const scale of [.78,.9,1,1.25,1.46]){
    const result=analyze(rescale(image,scale));
    if(result.method==='detected'){
      accepted++;
      assert.deepEqual([result.width,result.height],[25,18]);
      assert.deepEqual(result.colors,expected);
      assert.deepEqual(result.inferredEdges,['bottom']);
    }else assert.deepEqual(result.colors,[]);
  }
  assert.ok(accepted>=2,'near-complete cells remain discoverable');
});

test('oblique chart and plain art do not become guessed printed grids',()=>{
  const [image]=chart(25,18,13,'dark',28619);
  assert.deepEqual(analyze(rescale(image,1,.25)).colors,[]);
  const pixel=chart(25,18,13,'dark',166)[0];
  for(let y=0;y<pixel.height;y++)for(let x=0;x<pixel.width;x++){
    const v=(x>=pixel.width/3)=== (y>=pixel.height/2)?100:155;
    pixel.data.fill(v,4*(y*pixel.width+x),4*(y*pixel.width+x)+3);
  }
  assert.deepEqual(analyze(pixel).colors,[]);
});
