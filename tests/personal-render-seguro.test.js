const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Elemento {
  constructor(tag) { this.tagName = tag; this.children = []; this.dataset = {}; this.attributes = {}; this.classList = {add:()=>{},contains:()=>false}; this.textContent = ''; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(k,v) { this.attributes[k] = v; }
  addEventListener() {}
}
async function ejecutar(respuesta) {
  const lista = new Elemento('div');
  const elementos = new Map([['listaPersonal',lista]]);
  const documento = {
    getElementById(id) { if (!elementos.has(id)) elementos.set(id,new Elemento('div')); return elementos.get(id); },
    createElement(tag) { return new Elemento(tag); },
    createTextNode(value) { return {tagName:'#text', textContent:value}; }
  };
  const contexto = {document:documento, fetch:async()=>respuesta, console, alert:()=>{}, confirm:()=>false};
  vm.createContext(contexto);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../public/js/personal.js'),'utf8'),contexto);
  await vm.runInContext('cargarPersonal()',contexto);
  return lista;
}
(async()=>{
  const payload='<img src=x onerror=alert(1)>';
  const lista=await ejecutar({ok:true,json:async()=>[{id:1,nombre:payload,rut:payload,cargo:'TÉCNICO',estado:'ACTIVO'}]});
  assert.equal(lista.children.length,1);
  assert.equal(lista.children[0].children[0].textContent,payload);
  assert.equal(lista.children[0].children[1].children[1].textContent,payload);
  assert.equal(lista.children[0].children.at(-1).textContent,'Desactivar');
  assert.equal(lista.children[0].children.filter(x=>x.tagName==='img').length,0);
  const vacia=await ejecutar({ok:true,json:async()=>[]});
  assert.match(vacia.children[0].textContent,/Aún no hay/);
  const error=await ejecutar({ok:false,json:async()=>({mensaje:'Error'})});
  assert.match(error.children[0].textContent,/No se pudo cargar/);
  const formato=await ejecutar({ok:true,json:async()=>({registros:[]})});
  assert.match(formato.children[0].textContent,/No se pudo cargar/);
  console.log('Personal: 4 escenarios aprobados (HTML, vacío, HTTP, formato).');
})().catch(err=>{console.error(err);process.exitCode=1});
