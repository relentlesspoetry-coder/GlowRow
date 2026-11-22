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
    fillRect(x,y,w,h) { paint.push({color:this.fillStyle,x,y,w,h}); },
    beginPath(){}, moveTo(){}, lineTo(){}, stroke(){}, strokeRect(){},
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
test('renders only the active diagonal over a dark board and restores progress',()=>{
  const storage = new Map();
  const {evaluate,element,paint}=app(storage);
  assert.equal(evaluate('current().row'),1);
  assert.equal(element('totalRows').textContent,29);
  element('nextRow').events.click();
  assert.equal(evaluate('current().row'),2);
  assert.equal(paint.at(-3).color,'#05090e');
  assert.equal(paint.at(-2).w,24);
  assert.equal(paint.at(-1).w,24);
  assert.equal(app(storage).evaluate('current().row'),2);
});
test('Android Back closes an open dialog before leaving the app',()=>{
  const {run}=app();
  assert.equal(run('window.glowRowBack()'),false);
  run("openModal('importModal')");
  assert.equal(run('window.glowRowBack()'),true);
  assert.equal(run('window.glowRowBack()'),false);
});
