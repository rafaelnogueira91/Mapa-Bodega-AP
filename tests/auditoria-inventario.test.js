'use strict';
const assert = require('node:assert/strict');
const handlers = {};
const app = {get(path,fn){handlers[path]=fn;}};
const db = {all(sql,args,cb){
  if(sql.includes('WITH fisico')) return cb(null,[{producto:'P1',ubicacion:'U1',fisico:2,reservado:3,libre:-1}]);
  if(sql.includes('FROM entregas_series_proyecto e')) return cb(null,[{numero_serie:'SER-2',entrega_id:7,problema:'Serie entregada y simultáneamente reservada'}]);
  if(sql.includes('FROM productos_seriados')) return cb(null,[{numero_serie:'SER-1',estado:'Disponible',problema:'Disponible sin ubicación'}]);
  cb(new Error('SQL inesperado'));
}};
require('../routes/auditoria-inventario')(app,db);
const route=handlers['/api/admin/auditoria-inventario'];
assert.equal(typeof route,'function');
function invoke(rol){return new Promise(resolve=>{
  const res={code:200,status(n){this.code=n;return this},json(data){resolve({code:this.code,data});return this}};
  Promise.resolve(route({usuario:rol?{rol}:null},res)).catch(e=>{throw e});
});}
(async()=>{
  assert.equal((await invoke(null)).code,403);
  assert.equal((await invoke('CONSULTA')).code,403);
  for(const rol of ['ADMIN','BODEGA']){
    const {code,data}=await invoke(rol);
    assert.equal(code,200);
    assert.equal(data.resumen.inconsistencias_cantidad,1);
    assert.equal(data.resumen.inconsistencias_series,1);
    assert.equal(data.resumen.inconsistencias_entregas_series,1);
    assert.equal(data.entregasSeries[0].entrega_id,7);
  }
  console.log('OK auditoría: acceso por rol y reporte de inconsistencias');
})().catch(e=>{console.error(e);process.exitCode=1});
