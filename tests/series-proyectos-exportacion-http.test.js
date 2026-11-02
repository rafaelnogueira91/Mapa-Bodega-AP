"use strict";
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'..','routes/series-proyectos.js'),'utf8');
const routes={};
const app={get:(url,fn)=>{routes[url]=fn},post:()=>{}};
const filas=Array.from({length:1205},(_,i)=>({id:i+1,numero_serie:`SERIE-${i+1}`,fecha_devolucion:null}));
let errorSql=false,consultas=0;
const db={serialize:fn=>fn(),run:()=>{},all:(sql,args,callback)=>{
  if(typeof args==='function'){callback=args;args=[];}
  if(!sql.includes('FROM entregas_series_proyecto e')||!sql.includes('WHERE e.fecha_devolucion IS NULL'))return callback(null,[]);
  consultas++;
  if(errorSql)return callback(new Error('DB unavailable'));
  const cursor=args[0];
  callback(null,filas.filter(x=>x.id>cursor).slice(0,1000));
}};
const moduleMock={exports:{}};
const sandbox={module:moduleMock,exports:moduleMock.exports,require:(name)=>{
 if(name==='sqlite3')return {verbose:()=>({Database:class{}})};
 if(name==='path')return path;
 throw Error(`Módulo inesperado: ${name}`);
},__dirname:path.join(__dirname,'..','routes')};
vm.runInNewContext(source,sandbox,{filename:'series-proyectos.js'});
moduleMock.exports(app,db);
const endpoint=routes['/api/series-proyectos/pendientes-exportacion'];
assert.equal(typeof endpoint,'function');
async function pedir(query,usuario){
 const respuesta={statusCode:200,status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
 await endpoint({query,usuario},respuesta);
 return respuesta;
}
(async()=>{
 let r=await pedir({cursor:'0'},{rol:'OPERADOR'});
 assert.equal(r.statusCode,403);
 assert.equal(consultas,0);
 for(const cursor of ['-1','abc','1.5','9007199254740992']){
  r=await pedir({cursor},{rol:'ADMIN'});
  assert.equal(r.statusCode,400,`cursor ${cursor}`);
 }
 let cursor=0,ids=[];
 do{
  r=await pedir({cursor:String(cursor)},{rol:'BODEGA'});
  assert.equal(r.statusCode,200);
  ids.push(...r.body.registros.map(x=>x.id));
  cursor=r.body.siguienteCursor;
 }while(cursor!==null);
 assert.equal(ids.length,1205);
 assert.equal(new Set(ids).size,1205);
 assert.equal(ids[0],1);
 assert.equal(ids.at(-1),1205);
 assert.equal(consultas,2);
 r=await pedir({cursor:'1205'},{rol:'ADMIN'});
 assert.equal(r.body.registros.length,0);
 assert.equal(r.body.siguienteCursor,null);
 errorSql=true;
 r=await pedir({cursor:'0'},{rol:'ADMIN'});
 assert.equal(r.statusCode,500);
 assert.match(r.body.error,/No se pudo consultar/);
 console.log('Endpoint HTTP simulado: permisos, cursores, 1205 registros y error SQL OK');
})().catch(e=>{console.error(e);process.exitCode=1});
