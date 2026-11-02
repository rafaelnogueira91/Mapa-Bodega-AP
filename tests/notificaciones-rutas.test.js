'use strict';
const assert = require('node:assert/strict');
const routes = new Map();
const app = {
  get(path,...handlers){routes.set('GET '+path,handlers)},
  post(path,...handlers){routes.set('POST '+path,handlers)},
  patch(path,...handlers){routes.set('PATCH '+path,handlers)}
};
const db = {
  run(sql,args,cb){if(typeof args==='function')cb=args;setImmediate(()=>cb.call({changes:1},null))},
  all(sql,args,cb){if(typeof args==='function')cb=args;setImmediate(()=>cb(null,
    sql.includes('PRAGMA table_info')?[{name:'proximo_intento'}]:
    sql.includes('FROM notificacion_destinatarios WHERE activo=1')?[{total:0}]:
    sql.includes('COUNT(*) AS total')?[{total:0,pendientes:null,reintentables:null,agotados:null,en_curso:null}]:[]))}
};
async function invoke(key,user,body={}){
  const handlers=routes.get(key);assert.ok(handlers,key);
  let status=200,data;
  const res={status(code){status=code;return this},json(value){data=value;return this}};
  const req={usuario:user,body,params:{id:'1'}};
  for(const handler of handlers){
    let continued=false;
    await handler(req,res,()=>{continued=true});
    if(!continued)break;
  }
  return {status,data};
}
async function main(){
  await require('../routes/notificaciones')(app,db);
  const endpoints=[
    'GET /api/admin/notificaciones/destinatarios',
    'POST /api/admin/notificaciones/destinatarios',
    'PATCH /api/admin/notificaciones/destinatarios/:id',
    'GET /api/admin/notificaciones/cola',
    'GET /api/admin/notificaciones/resumen',
    'GET /api/admin/notificaciones/diagnostico',
    'POST /api/admin/notificaciones/:id/reintentar',
    'POST /api/admin/notificaciones/enviar-pendientes'
  ];
  for(const key of endpoints){
    assert.equal((await invoke(key,{rol:'CONSULTA'})).status,403,key);
    assert.equal((await invoke(key,undefined)).status,403,key);
  }
  assert.equal((await invoke('POST /api/admin/notificaciones/destinatarios',{rol:'ADMIN'},{correo:'no-es-email'})).status,400);
  assert.equal((await invoke('PATCH /api/admin/notificaciones/destinatarios/:id',{rol:'ADMIN'},{activo:2})).status,400);
  const result=await invoke('GET /api/admin/notificaciones/diagnostico',{rol:'ADMIN'});
  assert.equal(result.status,200);
  assert.equal(result.data.cola.agotados,0);
  assert.equal(result.data.destinatarios_activos,0);
  assert.equal(result.data.credenciales_configuradas,false);
  console.log('OK: 8 endpoints protegidos, validaciones de entrada y diagnóstico sin valores nulos');
}
main().catch(e=>{console.error(e);process.exitCode=1});
