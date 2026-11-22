const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = readFileSync(join(__dirname,'../app/src/main/assets/index.html'),'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function app(storage = new Map(), analyze, imageData) {
  const elements = new Map();
  const paint = [];
  const ctx = {
    fillRect(x,y,w,h) { paint.push({color:this.fillStyle,alpha:this.globalAlpha,x,y,w,h}); },
    beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, drawImage(){},
    getImageData(){return imageData||{data:new Uint8Array(160),width:5,height:8};},
    strokeRect(x,y,w,h){paint.push({outline:this.strokeStyle,alpha:this.globalAlpha,x,y,w,h});},
  };
  function element(id) {
    if (!elements.has(id)) elements.set(id,{
      id, style:{}, events:{}, children:[], classList:{
        values:new Set(), contains(t){return this.values.has(t);}, add(t){this.values.add(t);}, remove(t){this.values.delete(t);},
        toggle(t,show){ if(show)this.add(t);else this.remove(t); }
      },
      setAttribute(){}, focus(){document.activeElement=this;}, getClientRects(){return [1];}, scrollIntoView(){}, getContext(){return ctx;}, appendChild(node){this.children.push(node);},
      replaceChildren(){this.children=[];},
      addEventListener(event, fn){this.events[event]=fn;}, append(...nodes){nodes.forEach(node=>this.appendChild(node));},
    });
    return elements.get(id);
  }
  const document = {
    getElementById:element, createElement:()=>element(Symbol()), events:{}, addEventListener(type,fn){this.events[type]=fn;},
    querySelectorAll:()=>Array.from(elements.values()).filter(el=>el.classList.values.has('open')),
  };
  document.querySelector=()=>document.querySelectorAll()[0];
  const realm = vm.createContext({document,window:{},console,setTimeout,GlowRowImport:{analyze},
    localStorage:{getItem:key=>storage.get(key),setItem:(key,val)=>storage.set(key,val)},
  });
  if(!analyze)vm.runInContext(html.match(/<script id="gridImportCore">([\s\S]*?)<\/script>/)[1],realm);
  vm.runInContext(script,realm);
  const evaluate=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,realm));
  return {document,evaluate, element,paint,run:code=>vm.runInContext(code,realm)};
}
test('every corner covers each cell once for a rectangular pattern',()=>{
  const {evaluate}=app();
  for(const [corner,first] of Object.entries({tl:{r:0,c:0},tr:{r:0,c:5},bl:{r:2,c:0},br:{r:2,c:5}})){
    const rows=evaluate(`Array.from({length:8},(_, i)=>diagonalCells({width:6,height:3,corner:'${corner}'}, i+1))`);
    assert.deepEqual(rows[0],[first]);
    assert.deepEqual(rows.map(row=>row.length),[1,2,3,3,3,3,2,1]);
    assert.equal(new Set(rows.flat().map(cell=>`${cell.r},${cell.c}`)).size,18);
  }
});
test('keeps a full faded pattern, highlights just the active diagonal, and restores progress',()=>{
  const storage = new Map([['c2c-crochet-v1',JSON.stringify({activeId:'fixture',projects:[{
    id:'fixture',name:'Contrasting colors',width:3,height:2,
    pixels:[['#ffffff','#e84040','#e84040'],['#000000','#000000','#173061']],
    row:1,corner:'tl',
  }]})]]);
  const {evaluate,element,paint}=app(storage);
  assert.equal(evaluate('current().row'),1);
  assert.equal(element('totalRows').textContent,4);
  function checkActive(active) {
    const backdrop=paint[0];
    assert.deepEqual(backdrop,{color:'#35414f',alpha:1,x:0,y:0,w:78,h:52});
    const faded=paint.filter(p=>p.color&&p.alpha<1);
    assert.deepEqual(faded.map(({color,x,y,w,h})=>[color,x,y,w,h]),[
      ['#ffffff',0,0,26,26],['#e84040',26,0,52,26],
      ['#000000',0,26,52,26],['#173061',52,26,26,26],
    ]);
    assert.ok(faded.every(p=>p.alpha===0.42));
    const highlighted=paint.slice(1).filter(p=>p.color&&p.alpha===1);
    assert.deepEqual(highlighted.map(({color,x,y,w,h})=>[color,x,y,w,h]),active.map(([color,x,y])=>[color,x,y,24,24]));
    assert.equal(paint.filter(p=>p.outline&&p.alpha===1).length,active.length);
  }
  checkActive([['#ffffff',1,1]]);
  paint.length=0;
  element('nextRow').events.click();
  assert.equal(evaluate('current().row'),2);
  checkActive([['#000000',1,27],['#e84040',27,1]]);
  assert.equal(app(storage).evaluate('current().row'),2);
  paint.length=0;
  element('previousRow').events.click();
  checkActive([['#ffffff',1,1]]);
});
test('Android Back closes an open dialog before leaving the app',()=>{
  const {run}=app();
  assert.equal(run('window.glowRowBack()'),false);
  run("openModal('importModal')");
  assert.equal(run('window.glowRowBack()'),true);
  assert.equal(run('window.glowRowBack()'),false);
});

test('chart import detects instead of assuming a size and only saves a verified color preview',async()=>{
  const storage=new Map(), pattern={width:3,height:2,colors:[['#000000','#abcdef','#ffffff'],['#ed1000','#ffffff','#ffffff']],method:'detected'};
  const {element,run,evaluate,paint}=app(storage,(_pixels,options)=>{
    assert.equal(options.mode,'chart');
    assert.equal(options.useManual,false);
    assert.equal(options.ignoreRedGuides,false);
    assert.ok(!('cols' in options) && !('rows' in options));
    return pattern;
  });
  element('newPattern').events.click();
  assert.equal(element('importCols').value,'');
  assert.equal(element('importRows').value,'');
  run("sourceImage={naturalWidth:50,naturalHeight:80}; invalidateImport();");
  await element('previewPattern').events.click();
  assert.equal(element('importReview').classList.contains('hidden'),false);
  assert.match(element('importReviewDetail').textContent,/3 across × 2 down · 4 colors/);
  assert.ok(paint.some(p=>p.color==='#ed1000'));
  assert.equal(element('createPattern').disabled,true);
  element('createPattern').events.click();
  assert.equal(storage.size,0);
  element('importVerified').checked=true;
  element('importVerified').events.change();
  assert.equal(element('createPattern').disabled,false);
  element('createPattern').events.click();
  assert.deepEqual(evaluate('current().pixels'),pattern.colors);
  assert.equal(JSON.parse(storage.get('c2c-crochet-v1')).projects.length,2);
});

test('uncertain chart detection cannot save; manual or plain mode needs entered dimensions',async()=>{
  const {element,run}=app(undefined,(_pixels,options)=>{
    if(!options.useManual && options.mode==='chart')return {method:'needs-input',reason:'Could not count the printed grid.'};
    assert.equal(options.cols,2);
    assert.equal(options.rows,2);
    assert.equal(options.ignoreRedGuides,false);
    return {method:'manual',width:2,height:2,colors:[['#ffffff','#cc0000'],['#000000','#ffffff']]};
  });
  element('newPattern').events.click();
  run("sourceImage={naturalWidth:50,naturalHeight:80}; invalidateImport();");
  await element('previewPattern').events.click();
  assert.equal(element('importAdjust').open,true);
  assert.equal(element('importError').textContent,'Could not count the printed grid.');
  assert.equal(element('createPattern').disabled,true);
  element('importManual').checked=true;
  element('importManual').events.change();
  await element('previewPattern').events.click();
  assert.match(element('importError').textContent,/2–150 squares/);
  element('importCols').value='2';
  element('importRows').value='2';
  await element('previewPattern').events.click();
  assert.match(element('importReviewDetail').textContent,/Grid placed using the size/);
  element('importVerified').checked=true;
  element('importVerified').events.change();
  element('importMode').value='pixel';
  element('importMode').events.change();
  assert.equal(element('createPattern').disabled,true);
  assert.equal(element('importReview').classList.contains('hidden'),true);
  await element('previewPattern').events.click();
  assert.match(element('importReviewDetail').textContent,/Resized to the square count/);
  element('importCols').value='3';
  element('importCols').events.input();
  assert.equal(element('createPattern').disabled,true);
});

test('a failed write leaves the existing pattern in place and keeps the reviewed draft',()=>{
  const storage=new Map();
  storage.set=()=>{throw Error('Storage quota');};
  const {element,run,evaluate}=app(storage);
  element('newPattern').events.click();
  run("showImportPreview({width:2,height:2,colors:[['#101010','#202020'],['#303030','#404040']],method:'detected'},'chart')");
  element('importVerified').checked=true;
  element('importVerified').events.change();
  element('createPattern').events.click();
  assert.equal(evaluate('state.projects.length'),1);
  assert.equal(evaluate('state.activeId'),'example-mint-diamond');
  assert.match(element('importError').textContent,/existing patterns have not changed/);
  assert.equal(element('importReview').classList.contains('hidden'),false);
});

test('real import core and form save the original colors for a non-square plain image',async()=>{
  const width=3,height=2;
  const data=new Uint8Array([
    255,255,255,255, 0,0,0,255, 255,0,0,255,
    30,90,180,255, 55,40,60,255, 10,20,30,255,
  ]);
  const {element,run,evaluate}=app(undefined,undefined,{data,width,height});
  element('newPattern').events.click();
  run('sourceImage={naturalWidth:3,naturalHeight:2}; invalidateImport();');
  element('importMode').value='pixel';
  element('importMode').events.change();
  element('importCols').value='3';
  element('importRows').value='2';
  await element('previewPattern').events.click();
  assert.equal(element('importError').textContent,'');
  assert.match(element('importReviewDetail').textContent,/3 across × 2 down · 6 colors/);
  element('importVerified').checked=true;
  element('importVerified').events.change();
  element('createPattern').events.click();
  assert.deepEqual(evaluate('current().pixels'),[['#ffffff','#000000','#ff0000'],['#1e5ab4','#37283c','#0a141e']]);
});

test('Bottom Right is the fresh-install default and saved corner survives restart and pattern switches',()=>{
  const storage=new Map();
  let {element,run,evaluate}=app(storage);
  assert.equal(evaluate('state.defaultCorner'), 'br');
  assert.equal(evaluate('current().corner'), 'br');
  assert.deepEqual(evaluate('diagonalCells(current(),1)'),[{r:14,c:14}]);
  function importDraft(name){
    element('newPattern').events.click();
    element('importName').value=name;
    run("showImportPreview({width:2,height:2,colors:[['#101010','#202020'],['#303030','#404040']],method:'detected'},'chart')");
    element('importVerified').checked=true;
    element('createPattern').events.click();
  }
  importDraft('Original corner');
  assert.equal(evaluate('current().corner'), 'br');
  run('setRow(3)');
  const original=evaluate('current().id');
  run("state.activeId='example-mint-diamond'; saveState();");
  element('openSettings').events.click();
  element('startCorner').value='tr';
  element('showStrip').checked=true;
  element('saveSettings').events.click();
  assert.equal(evaluate('current().corner'), 'tr');
  assert.equal(evaluate('state.defaultCorner'), 'tr');
  ({element,run,evaluate}=app(storage));
  assert.equal(evaluate('current().corner'), 'tr');
  run(`state.activeId=${JSON.stringify(original)}; saveState();`);
  assert.deepEqual(evaluate('[current().corner,current().row]'),['br',3]);
  element('openSettings').events.click();
  assert.equal(element('startCorner').value,'br');
  element('showStrip').checked=false;
  element('saveSettings').events.click();
  assert.equal(evaluate('state.defaultCorner'), 'tr');
  assert.deepEqual(evaluate('[current().corner,current().row]'),['br',3]);
  importDraft('New default');
  assert.deepEqual(evaluate('[current().corner,current().row]'),['tr',1]);
  ({evaluate}=app(storage));
  assert.equal(evaluate('state.defaultCorner'), 'tr');
  assert.equal(evaluate('current().name'), 'New default');
  assert.deepEqual(evaluate(`state.projects.filter(p=>p.id===${JSON.stringify(original)}).map(p=>[p.corner,p.row])`),[['br',3]]);
});

test('upgrade preserves a legacy in-progress Top Left project but migrates the untouched sample',()=>{
  const key='c2c-crochet-v1', sample=app().evaluate('newSample()');
  const storage=new Map([[key,JSON.stringify({activeId:sample.id,projects:[{...sample,corner:'tl',row:1}]})]]);
  let {evaluate}=app(storage);
  assert.deepEqual(evaluate('[state.defaultCorner,current().corner,current().row]'),['br','br',1]);
  storage.set(key,JSON.stringify({activeId:sample.id,projects:[{...sample,corner:'tl',row:4}]}));
  ({evaluate}=app(storage));
  assert.deepEqual(evaluate('[state.defaultCorner,current().corner,current().row]'),['br','tl',4]);
  storage.set(key,JSON.stringify({activeId:sample.id,projects:[{...sample,corner:'bl',row:1}]}));
  ({evaluate}=app(storage));
  assert.deepEqual(evaluate('[state.defaultCorner,current().corner,current().row]'),['br','bl',1]);
});

test('near-color JPEG cleanup is requested only for printed charts',async()=>{
  const modes=[];
  const {element,run}=app(undefined,(_pixels,opts)=>{modes.push([opts.mode,opts.compressPalette]);return {method:'needs-input'};});
  element('newPattern').events.click();
  run('sourceImage={naturalWidth:50,naturalHeight:50}; sourceIsJpeg=true; invalidateImport();');
  await element('previewPattern').events.click();
  element('importMode').value='pixel';
  element('importMode').events.change();
  element('importCols').value='2';element('importRows').value='2';
  await element('previewPattern').events.click();
  element('importMode').value='chart';
  element('importMode').events.change();
  run('sourceIsJpeg=false;');
  await element('previewPattern').events.click();
  assert.deepEqual(modes,[['chart',true],['pixel',false],['chart',false]]);
});

test('fits the full rectangular chart to measured board size without stretching cells',()=>{
  const corner='br', width=150,height=50;
  const storage=new Map([['c2c-crochet-v1',JSON.stringify({activeId:'fixture',projects:[{
    id:'fixture',name:'Wide chart',width,height,row:1,corner,
    pixels:Array.from({length:height},()=>Array(width).fill('#123456')),
  }]})]]);
  const {element,run}=app(storage);
  const holder=element('boardHolder'),canvas=element('patternCanvas');
  function fit(width,height){holder.clientWidth=width;holder.clientHeight=height;run('fitPatternCanvas()');return [parseFloat(canvas.style.width),parseFloat(canvas.style.height)];}
  assert.deepEqual(fit(360,540),[360,120]);
  assert.deepEqual(fit(900,160),[480,160]);
  assert.deepEqual(fit(0,0),[480,160]);
  assert.equal(canvas.width,150*26);
  assert.equal(canvas.height,50*26);
  run("current().width=50;current().height=150;current().pixels=Array.from({length:150},()=>Array(50).fill('#345678')); drawPattern();");
  assert.deepEqual(fit(240,360),[120,360]);
});

test('modal focus wraps within the dialog and Escape returns it to the viewer trigger',()=>{
  const {document,element}=app(),trigger=element('openSettings'),modal=element('settingsModal');
  const first=element('dialogClose'),last=element('saveSettings');
  modal.querySelectorAll=()=>[first,last];
  trigger.focus();trigger.events.click();
  assert.equal(document.activeElement,first);
  assert.equal(element('viewerApp').inert,true);
  const key=(key,shiftKey=false)=>{
    let prevented=false;document.events.keydown({key,shiftKey,preventDefault(){prevented=true;}});
    assert.ok(prevented);
  };
  key('Tab',true);assert.equal(document.activeElement,last);
  key('Tab');assert.equal(document.activeElement,first);
  key('Escape');
  assert.equal(document.activeElement,trigger);
  assert.equal(element('viewerApp').inert,false);
});

test('border centers the original without changing any stitch and places odd extras on bottom/right',()=>{
  const {evaluate}=app();
  const result=evaluate("buildBorder({width:3,height:2,pixels:[['#abcDEF','#101010','#202020'],['#303030','#404040','#505050']]},6,5,'#ffffff')");
  const {top,right,bottom,left}=result;
  assert.deepEqual([top,right,bottom,left],[1,2,2,1]);
  assert.deepEqual(result.pixels.slice(top,top+2).map(row=>row.slice(left,left+3)),[['#abcDEF','#101010','#202020'],['#303030','#404040','#505050']]);
  assert.equal(result.pixels.flat().filter(p=>p==='#ffffff').length,24);
  assert.equal(evaluate("buildBorder(newSample(),14,30,'#abcdef')"),null);
  assert.equal(evaluate("buildBorder(newSample(),30,151,'#abcdef')"),null);
  assert.equal(evaluate("buildBorder(newSample(),15,15,'#abcdef')"),null);
  assert.equal(evaluate("buildBorder(newSample(),20.2,30,'#abcdef')"),null);
  assert.deepEqual(evaluate("(()=>{const p=buildBorder(newSample(),15,150,'#abcdef');return [p.left,p.right,p.top,p.bottom,p.pixels.length,p.pixels[0].length]})()"),[0,0,67,68,150,15]);
});

test('Patterns border action previews and saves a new row-one pattern without changing original or default',()=>{
  const original={id:'test-pattern',name:'Original',width:23,height:22,row:9,corner:'bl',pixels:Array.from({length:22},()=>Array(23).fill('#123456'))};
  original.pixels[8][8]='#abcdef';
  const key='c2c-crochet-v1',storage=new Map([[key,JSON.stringify({activeId:original.id,defaultCorner:'tr',projects:[original]})]]);
  const {element,evaluate}=app(storage);
  element('openProjects').events.click();element('openBorder').events.click();
  assert.equal(element('borderWidth').value,30);
  assert.equal(element('borderHeight').value,30);
  assert.equal(element('borderColor').value,'#123456');
  element('borderWidth').value=20;element('borderWidth').events.input();
  assert.equal(element('saveBorder').disabled,true);
  element('saveBorder').events.click();
  assert.equal(evaluate('state.projects.length'),1);
  element('borderWidth').value=30;element('borderWidth').events.input();
  element('borderColor').value='#000000';element('borderColor').events.input();
  assert.match(element('borderCounts').textContent,/59 diagonal rows.*top 4, right 4, bottom 4, left 3/);
  element('saveBorder').events.click();
  const saved=JSON.parse(storage.get(key));
  assert.equal(saved.projects.length,2);
  assert.deepEqual(saved.projects[0],original);
  assert.equal(saved.defaultCorner,'tr');
  const copy=saved.projects[1];
  assert.equal(saved.activeId,copy.id);
  assert.deepEqual([copy.width,copy.height,copy.row,copy.corner],[30,30,1,'bl']);
  assert.equal(copy.pixels[12][11],'#abcdef');
  assert.equal(copy.pixels.flat().filter(p=>p==='#000000').length,394);
  assert.equal(app(storage).evaluate('total(current())'),59);
});

test('saving a border leaves the original active if storage is full',()=>{
  const storage=new Map();
  storage.set=()=>{throw Error('Storage quota');};
  const {element,evaluate}=app(storage);
  element('openBorder').events.click();
  element('saveBorder').events.click();
  assert.equal(evaluate('state.projects.length'),1);
  assert.equal(evaluate('state.activeId'),'example-mint-diamond');
  assert.match(element('borderError').textContent,/original pattern has not changed/);
  assert.equal(element('borderModal').classList.contains('open'),true);
});

test('Add a pattern previews and saves only the final 30×30 copy with true border stitches',()=>{
  const storage=new Map(),{element,run,evaluate}=app(storage);
  element('newPattern').events.click();
  element('importName').value='Chart with border';
  run(`showImportPreview({width:23,height:22,colors:Array.from({length:22},(_,y)=>Array.from({length:23},(_,x)=>x===8&&y===8?'#abcdef':'#123456')),method:'detected'},'chart')`);
  assert.equal(element('importAddBorder').checked,false);
  assert.equal(element('importFinishedWidth').value,30);
  assert.equal(element('importFinishedHeight').value,30);
  assert.equal(element('importBorderColor').value,'#123456');
  assert.match(element('importReviewDetail').textContent,/Original: 23 across × 22 down/);
  element('importVerified').checked=true;element('importVerified').events.change();
  element('importAddBorder').checked=true;element('importAddBorder').events.change();
  assert.equal(element('importVerified').checked,false);
  assert.match(element('importFinishedDetail').textContent,/Finished: 30 × 30 stitches · 59 diagonal rows.*top 4, right 4, bottom 4, left 3/);
  element('importVerified').checked=true;element('importVerified').events.change();
  element('importFinishedWidth').value=22;element('importFinishedWidth').events.input();
  assert.equal(element('createPattern').disabled,true);
  assert.equal(element('importVerified').disabled,true);
  assert.equal(element('importBorderError').classList.contains('hidden'),false);
  element('createPattern').events.click();
  assert.equal(storage.size,0);
  element('importFinishedWidth').value=30;element('importFinishedWidth').events.input();
  element('importVerified').checked=true;element('importVerified').events.change();
  element('importBorderColor').value='#fedcba';element('importBorderColor').events.input();
  assert.equal(element('createPattern').disabled,true);
  element('importVerified').checked=true;element('importVerified').events.change();
  element('createPattern').events.click();
  assert.equal(evaluate("state.projects.filter(p=>p.name==='Chart with border').length"),1);
  const result=evaluate('current()');
  assert.deepEqual([result.width,result.height,result.row,result.corner],[30,30,1,'br']);
  assert.equal(result.pixels[12][11],'#abcdef');
  assert.equal(result.pixels.flat().filter(p=>p==='#fedcba').length,394);
});

test('cancelling an acknowledged padded import or failing storage never creates an unpadded record',()=>{
  const storage=new Map();
  const {element,run,evaluate}=app(storage);
  const setup=()=>{
    element('newPattern').events.click();
    run("showImportPreview({width:2,height:2,colors:[['#101010','#202020'],['#303030','#404040']],method:'detected'},'chart')");
    element('importAddBorder').checked=true;element('importAddBorder').events.change();
    element('importVerified').checked=true;element('importVerified').events.change();
  };
  setup();
  run("closeModal('importModal')");
  element('createPattern').events.click();
  assert.equal(storage.size,0);
  setup();
  storage.set=()=>{throw Error('Storage quota');};
  element('createPattern').events.click();
  assert.equal(evaluate('state.projects.length'),1);
  assert.equal(evaluate('[importFinal.width, importFinal.height]').join('x'),'30x30');
  assert.match(element('importError').textContent,/existing patterns have not changed/);
});

test('import border defaults respect source sizes above thirty and toggling off restores original preview',()=>{
  const {element,run,evaluate}=app();
  element('newPattern').events.click();
  run("showImportPreview({width:42,height:20,colors:Array.from({length:20},()=>Array(42).fill('#223344')),method:'detected'},'chart')");
  element('importAddBorder').checked=true;element('importAddBorder').events.change();
  assert.equal(element('importFinishedWidth').value,42);
  assert.equal(element('importFinishedHeight').value,30);
  element('importVerified').checked=true;element('importVerified').events.change();
  element('importAddBorder').checked=false;element('importAddBorder').events.change();
  assert.equal(element('createPattern').disabled,true);
  assert.equal(element('importFinishedDetail').classList.contains('hidden'),true);
  assert.deepEqual(evaluate('[importFinal.width,importFinal.height]'),[42,20]);
});
