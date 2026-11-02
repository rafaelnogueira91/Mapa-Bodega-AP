'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.post('/api/solicitudes/:id/entregar-parcial'");
const end = source.indexOf('// LISTAR SOLICITUDES', start);
assert(start > 0 && end > start);
let handler, writes = 0, commits = 0, rollbacks = 0;
const db = {
 serialize(fn) { fn(); },
 run(sql, params, cb) {
  if (typeof params === 'function') { cb = params; params = []; }
  if (sql === 'COMMIT') commits++;
  else if (sql === 'ROLLBACK') rollbacks++;
  else if (sql !== 'BEGIN IMMEDIATE TRANSACTION') writes++;
  cb.call({changes:1,lastID:1}, null);
 },
 get(sql, params, cb) {
  if (sql.includes('FROM entregas_parciales_idempotencia i'))
   return cb(null, {solicitud_id:5,usuario_id:1,entrega_id:9,personal_destino_id:3});
  if (sql === 'SELECT estado FROM solicitudes WHERE id=?') return cb(null,{estado:'ENTREGADA'});
  throw Error('Unexpected get '+sql);
 },
 all(sql, params, cb) {
  if (sql.includes('FROM entregas_parciales_detalle WHERE entrega_id='))
   return cb(null,[{productoId:7,cantidad:3}]);
  throw Error('Unexpected all '+sql);
 }
};
vm.runInNewContext(source.slice(start,end), {app:{post(url,fn){handler=fn;}},db,console,require:id=>require(path.join(__dirname,'..',id))});
function invoke({id='5', user=1, personal=3, cantidad=3, clave='abcdefghijklmnop'}={}) {
 return new Promise(resolve=>{
  const req={params:{id},body:{personalId:personal,productos:[{productoId:7,tipoControl:'CANTIDAD',cantidad}]},usuario:{id:user,rol:'BODEGA'},get:()=>clave};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){resolve({status:this.statusCode,body});}};
  handler(req,res);
 });
}
(async()=>{
 const ok=await invoke();
 assert.equal(ok.status,200);assert.equal(ok.body.repetida,true);assert.equal(ok.body.entregaId,9);
 assert.equal(ok.body.estado,'ENTREGADA');
 const texto=await invoke({cantidad:'3'});
 assert.equal(texto.status,200);assert.equal(texto.body.repetida,true);
 assert.equal(writes,0);assert.equal(commits,2);
 for (const invalid of [{user:2},{id:'6'},{personal:4},{cantidad:2}]) {
  const result=await invoke(invalid);
  assert.equal(result.status,409);
 }
 assert.equal(writes,0);assert.equal(commits,2);assert.equal(rollbacks,4);
 console.log('OK: reintento idempotente y rechazo de claves reutilizadas sin descuentos');
})().catch(err=>{console.error(err);process.exitCode=1;});
