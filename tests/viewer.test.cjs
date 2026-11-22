const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const html = readFileSync(join(__dirname,'../app/src/main/assets/index.html'),'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function app(storage = new Map()) {
  const elements = new Map();
  const paint = [];
  const ctx = {
    fillRect(x,y,w,h) { paint.push({color:this.fillStyle,alpha:this.globalAlpha,x,y,w,h}); },
    beginPath(){}, moveTo(){}, lineTo(){}, stroke(){},
    strokeRect(x,y,w,h){paint.push({outline:this.strokeStyle,alpha:this.globalAlpha,x,y,w,h});},
  };
  function element(id) {
    if (!elements.has(id)) elements.set(id,{
      id, style:{}, events:{}, children:[], classList:{
        values:new Set(), add(t){this.values.add(t);}, remove(t){this.values.delete(t);},
        toggle(t,show){ if(show)this.add(t);else this.remove(t); }
      },
      setAttribute(){}, getContext(){return ctx;}, appendChild(node){this.children.push(node);},
      replaceChildren(){this.children=[];},
      addEventListener(event, fn){this.events[event]=fn;}, append(...nodes){nodes.forEach(node=>this.appendChild(node));},
    });
    return elements.get(id);
  }
  const document = {
    getElementById:element, createElement:()=>element(Symbol()), addEventListener(){},
    querySelectorAll:()=>Array.from(elements.values()).filter(el=>el.classList.values.has('open')),
  };
  document.querySelector=()=>document.querySelectorAll()[0];
  const realm = vm.createContext({document,window:{},console,
    localStorage:{getItem:key=>storage.get(key),setItem:(key,val)=>storage.set(key,val)},
  });
  vm.runInContext(script,realm);
  const evaluate=code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,realm));
  return {evaluate, element,paint,run:code=>vm.runInContext(code,realm)};
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
