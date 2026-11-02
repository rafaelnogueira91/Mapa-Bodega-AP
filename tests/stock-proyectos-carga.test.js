const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/js/stock-proyectos.js'),'utf8');
class El {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.disabled=false;}
 replaceChildren(...items){this.children=items;}
 append(...items){this.children.push(...items);}
 addEventListener(){}
 querySelector(){return new El('button');}
}
async function scenario(responses){
 const elements=new Map();
 const get=k=>{if(!elements.has(k))elements.set(k,new El());return elements.get(k)};
 const document={querySelector:get,querySelectorAll:k=>[get(k)],createElement:tag=>new El(tag)};
 const urls=['/api/proyectos','/api/productos','/api/ubicaciones','/api/stock-proyectos','/api/transferencias-proyectos','/api/stock-proyectos/conciliacion'];
 const ctx={document,console,FormData:class {},fetch:async url=>({ok:true,json:async()=>responses[urls.indexOf(url)]})};
 vm.createContext(ctx);
 vm.runInContext(source,ctx);
 await vm.runInContext('load()',ctx).catch(e=>{get('#mensaje').textContent=e.message});
 return get;
}
(async()=>{
 const empty=await scenario([[],[],[],[],[],[]]);
 assert.match(empty('#saldos').children[0].children[0].textContent,/Todavía no hay/);
 assert.equal(empty('#saldos').children[0].children[0].colSpan,4);
 assert.match(empty('#conciliacion').children[0].children[0].textContent,/No hay inventario/);
 assert.match(empty('#historial').children[0].children[0].textContent,/Aún no hay/);
 const invalid=await scenario([[],[],[],{registros:[]},[],[]]);
 assert.match(invalid('#mensaje').textContent,/Formato incorrecto de stock/);
 assert.equal(invalid('#saldos').children.length,0);
 const malicious='<img src=x onerror=alert(1)>';
 const valid=await scenario([[],[],[],[{proyecto_codigo:malicious,producto_codigo:'P1',ubicacion:'A',cantidad:2}],[],[]]);
 assert.equal(valid('#saldos').children[0].children[0].textContent,malicious);
 assert.equal(valid('#saldos').children[0].children[0].children.length,0);
 console.log('Stock por proyecto: vacío, formato inválido y texto seguro aprobados.');
})().catch(e=>{console.error(e);process.exitCode=1});
