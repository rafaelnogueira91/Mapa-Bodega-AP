'use strict';
// Prueba el controlador HTTP real con una base transaccional simulada.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.post('/api/solicitudes/:id/entregar-parcial'");
const end = source.indexOf('// LISTAR SOLICITUDES', start);
assert.ok(start > 0 && end > start);
let handler;
let data;
let snapshot;
let failMovement = false;
let splitLocations = false;
const reset = () => { data = {stock:8, reserved:8, delivered:0, state:'EN PREPARACIÓN', movements:0, history:0, partials:0}; snapshot = null; };
reset();
const db = {
 serialize(fn) {fn();},
 get(sql, params, cb) {
  if (sql.includes('FROM entregas_parciales_idempotencia i')) return cb(null, null);
  if (sql.includes('FROM entregas_parciales_idempotencia WHERE clave=')) return cb(null, null);
  if (sql.includes('FROM solicitudes s LEFT JOIN')) return cb(null, {estado:data.state, proyecto_id:2, personal_destino_id:3, proyecto_estado:'ACTIVO', bodega:1});
  if (sql.includes('FROM personal WHERE')) return cb(null, {id:3});
  if (sql.includes('AS total')) return cb(null, {total:data.stock ? 1 : 0});
  throw Error('Consulta GET inesperada: '+sql);
 },
 all(sql, params, cb) {
  if (sql.includes('FROM detalle_solicitudes d')) return cb(null, [{productoId:7, solicitada:8, entregada:data.delivered, tipoControl:'CANTIDAD'}]);
  if (sql.includes('FROM stock_cantidad sc')) {
   if (splitLocations) return cb(null, [
    {id:10,ubicacion_id:11,fisico:data.stockByLocation[11],reservado:data.reservedByLocation[11]},
    {id:20,ubicacion_id:22,fisico:data.stockByLocation[22],reservado:data.reservedByLocation[22]}
   ].filter(row => row.fisico > 0 && row.reservado > 0));
   return cb(null, data.stock ? [{id:10,ubicacion_id:11,fisico:data.stock,reservado:data.reserved}] : []);
  }
  throw Error('Consulta ALL inesperada: '+sql);
 },
 run(sql, params, cb) {
  if (typeof params === 'function') {cb=params; params=[];}
  const finish = (error, changes=1, lastID=1) => cb.call({changes,lastID},error || null);
  if (sql === 'BEGIN IMMEDIATE TRANSACTION') {snapshot=structuredClone(data); return finish();}
  if (sql === 'ROLLBACK') {data=structuredClone(snapshot); snapshot=null; return finish();}
  if (sql === 'COMMIT') {snapshot=null; return finish();}
  if (sql.includes('INSERT INTO entregas_parciales_idempotencia')) return finish();
  if (sql.includes('INSERT INTO entregas_parciales (')) {data.partials++; return finish();}
  if (sql.includes('UPDATE stock_proyecto SET')) {
   if(splitLocations) {const location=params[3];if(data.reservedByLocation[location]<params[0])return finish(null,0);data.reservedByLocation[location]-=params[0];}
   if(data.reserved<params[0]) return finish(null,0); data.reserved-=params[0]; return finish();
  }
  if (sql.includes('UPDATE stock_cantidad SET')) {
   if(splitLocations) {const location=params[1]===10?11:22;if(data.stockByLocation[location]<params[0])return finish(null,0);data.stockByLocation[location]-=params[0];}
   if(data.stock<params[0]) return finish(null,0); data.stock-=params[0]; return finish();
  }
  if (sql.includes('INSERT INTO movimientos')) {if(failMovement) return finish(failMovement === true ? Error('fallo simulado') : Object.assign(Error('detalle SQL interno'), {code:failMovement})); data.movements++; return finish();}
  if (sql.includes('INSERT INTO entregas_parciales_detalle')) {data.delivered+=params[2]; return finish();}
  if (sql.includes("UPDATE solicitudes SET estado='ENTREGADA'")) {data.state='ENTREGADA'; return finish();}
  if (sql.includes('INSERT INTO historial_solicitudes')) {data.history++; return finish();}
  if (sql.includes('DELETE FROM stock_') || sql.includes('UPDATE ubicaciones SET')) return finish();
  throw Error('Consulta RUN inesperada: '+sql);
 }
};
vm.runInNewContext(source.slice(start,end), {app:{post(route, fn){assert.equal(route,'/api/solicitudes/:id/entregar-parcial');handler=fn;}},db,require: id=>require(path.join(__dirname,'..',id)),console});
const server = http.createServer(async(req,res)=>{
 const match=/^\/api\/solicitudes\/([^/]+)\/entregar-parcial$/.exec(req.url);
 if(!match) {res.writeHead(404);return res.end();}
 let body='';for await(const chunk of req) body+=chunk;
 handler({params:{id:match[1]},body:JSON.parse(body),headers:req.headers,usuario:{id:1,rol:req.headers['x-role']||'BODEGA'}},{status(code){res.statusCode=code;return this;},json(obj){res.setHeader('content-type','application/json');res.end(JSON.stringify(obj));}});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const url=`http://127.0.0.1:${server.address().port}/api/solicitudes/5/entregar-parcial`;
 let sequence=0;
 const post=async(quantity,role='BODEGA',key)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','x-role':role,...(key=== null ? {} : {'idempotency-key':key || `entrega-prueba-${String(++sequence).padStart(16,'0')}`})},body:JSON.stringify({personalId:3,productos:[{productoId:7,tipoControl:'CANTIDAD',cantidad:quantity}]})});return {status:r.status,body:await r.json()};};
 try {
  assert.equal((await post(2,'SUPERVISOR')).status,403);
  assert.equal((await post(2,'BODEGA',null)).status,400);
  assert.equal(data.stock,8);
  const first=await post("3");assert.equal(first.status,200);assert.equal(first.body.estado,'EN PREPARACIÓN');
  assert.deepEqual([data.stock,data.reserved,data.delivered,data.movements,data.partials],[5,5,3,1,1]);
  const excessive=await post(6);assert.equal(excessive.status,409);assert.equal(data.stock,5);assert.equal(data.partials,1);
  failMovement=true;const failed=await post(2);assert.equal(failed.status,409);assert.equal(data.stock,5);assert.equal(data.reserved,5);assert.equal(data.partials,1);failMovement=false;
  // Errores SQLite: no filtrar detalles internos; rollback completo y códigos HTTP apropiados.
  for (const [codigo, esperado] of [['SQLITE_BUSY',503],['SQLITE_LOCKED',503],['SQLITE_IOERR',500]]) {
   failMovement=codigo;
   const respuesta=await post(2);
   assert.equal(respuesta.status,esperado);
   assert.ok(!respuesta.body.mensaje.includes('detalle SQL interno'));
   assert.deepEqual([data.stock,data.reserved,data.delivered,data.movements,data.partials],[5,5,3,1,1]);
  }
  failMovement=false;
  const final=await post(5);assert.equal(final.status,200);assert.equal(final.body.estado,'ENTREGADA');
  assert.deepEqual([data.stock,data.reserved,data.delivered,data.movements,data.partials,data.history],[0,0,8,2,2,1]);
  assert.equal((await post(1)).status,409);
  reset(); splitLocations=true; data.stockByLocation={11:3,22:5}; data.reservedByLocation={11:3,22:5};
  const distributed=await post("7");
  assert.equal(distributed.status,200);
  assert.equal(distributed.body.estado,'EN PREPARACIÓN');
  assert.deepEqual([data.stockByLocation[11],data.stockByLocation[22],data.reservedByLocation[11],data.reservedByLocation[22]],[0,1,0,1]);
  assert.equal(data.movements,2);
  assert.equal(data.delivered,7);
  const distributedFinal=await post(1);
  assert.equal(distributedFinal.status,200);
  assert.equal(distributedFinal.body.estado,'ENTREGADA');
  assert.equal(data.stock,0);
  assert.equal(data.movements,3);
  reset(); data.stockByLocation={11:3,22:4}; data.reservedByLocation={11:3,22:4};
  const unavailable=await post(8);
  assert.equal(unavailable.status,409);
  assert.equal(data.stock,8);
  assert.equal(data.reserved,8);
  assert.equal(data.movements,0);
  assert.equal(data.partials,0);
  assert.deepEqual(data.stockByLocation,{11:3,22:4});
  assert.deepEqual(data.reservedByLocation,{11:3,22:4});
  splitLocations=false;
  console.log('OK: HTTP entrega parcial, permisos, multiubicación, saldos, cierre y rollback');
 }finally{await new Promise(resolve=>server.close(resolve));}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
