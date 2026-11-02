'use strict';
// Prueba HTTP del módulo real de notificaciones con base de datos simulada.
// No necesita Express, SQLite ni credenciales de Gmail.
const assert=require('node:assert/strict');
const http=require('node:http');
const routes=[];
const app={};
for(const method of ['get','post','patch']) app[method]=(path,...handlers)=>routes.push({method:method.toUpperCase(),path,handlers});
const recipients=[];
const db={
 run(sql,args,cb){if(typeof args==='function'){cb=args;args=[]}let changes=1;
   if(sql.startsWith('INSERT INTO notificacion_destinatarios')){
     if(!recipients.some(x=>x.correo===args[0]))recipients.push({id:recipients.length+1,correo:args[0],activo:1});
   }
   if(sql.startsWith('UPDATE notificacion_destinatarios')){
     const target=recipients.find(x=>x.id===args[1]);if(target)target.activo=args[0];else changes=0;
   }
   setImmediate(()=>cb.call({changes},null));
 },
 all(sql,args,cb){if(typeof args==='function')cb=args;
   let result=[];
   if(sql.includes('PRAGMA table_info'))result=[{name:'proximo_intento'}];
   else if(sql.includes('SELECT id,correo,activo FROM notificacion_destinatarios'))result=recipients;
   else if(sql.includes('COUNT(*) AS total FROM notificacion_destinatarios'))result=[{total:recipients.filter(x=>x.activo).length}];
   else if(sql.includes('SELECT COUNT(*) AS total,'))result=[{total:0,pendientes:null,reintentables:null,agotados:null,en_curso:null}];
   setImmediate(()=>cb(null,result));
 }
};
function match(pattern,path){const keys=[];const re=new RegExp('^'+pattern.replace(/:[^/]+/g,x=>{keys.push(x.slice(1));return '([^/]+)'})+'$');const m=path.match(re);return m?Object.fromEntries(keys.map((k,i)=>[k,m[i+1]])):null}
async function main(){
 await require('../routes/notificaciones')(app,db);
 const server=http.createServer(async(request,response)=>{
   const route=routes.map(r=>({...r,params:r.method===request.method?match(r.path,request.url):null})).find(r=>r.params);
   if(!route){response.writeHead(404);response.end();return}
   let raw='';for await(const chunk of request)raw+=chunk;
   let body={};try{body=raw?JSON.parse(raw):{}}catch{response.writeHead(400);response.end();return}
   const req={usuario:request.headers['x-test-role']?{rol:request.headers['x-test-role']}:undefined,body,params:route.params};
   let code=200,output;
   const res={status(n){code=n;return this},json(data){output=data;return this}};
   for(const handler of route.handlers){let next=false;await handler(req,res,()=>{next=true});if(!next)break}
   response.writeHead(code,{'Content-Type':'application/json'});response.end(JSON.stringify(output));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 async function call(path,method='GET',role,body){const r=await fetch(base+path,{method,headers:{...(role?{'x-test-role':role}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
 try{
  const endpoint='/api/admin/notificaciones/destinatarios';
  assert.equal((await call(endpoint)).status,403);
  assert.equal((await call(endpoint,'GET','CONSULTA')).status,403);
  assert.equal((await call(endpoint,'POST','OPERADOR',{correo:'a@b.cl'})).status,403);
  assert.equal((await call(endpoint,'POST','ADMIN',{correo:'correo-invalido'})).status,400);
  assert.equal((await call(endpoint,'POST','ADMIN',{correo:'Bodega@Ejemplo.cl'})).status,201);
  const listado=await call(endpoint,'GET','ADMIN');assert.equal(listado.status,200);
  assert.equal(listado.data[0].correo,'bodega@ejemplo.cl');
  assert.equal((await call(endpoint+'/1','PATCH','ADMIN',{activo:0})).status,200);
  assert.equal((await call('/api/admin/notificaciones/diagnostico','GET','ADMIN')).data.destinatarios_activos,0);
  assert.equal((await call(endpoint+'/1','PATCH','ADMIN',{activo:1})).status,200);
  assert.equal((await call('/api/admin/notificaciones/diagnostico','GET','ADMIN')).data.destinatarios_activos,1);
  assert.equal((await call('/api/admin/notificaciones/diagnostico','GET','CONSULTA')).status,403);
  console.log('OK: 11 verificaciones HTTP (roles, alta, validación, activación y diagnóstico)');
 }finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))}
}
main().catch(e=>{console.error(e);process.exitCode=1});
