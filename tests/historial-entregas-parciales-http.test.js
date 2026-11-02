'use strict';
// Ejecuta el controlador real sobre HTTP; SQLite se comprueba por separado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.get('/api/solicitudes/:id/entregas-parciales'");
const end = source.indexOf('// Entrega parcial transaccional', start);
assert.ok(start > 0 && end > start);
let handler;
const app = {get: (route, callback) => {assert.equal(route, '/api/solicitudes/:id/entregas-parciales'); handler = callback;}};
const rows = [
 {entregaId:1, fecha:'2026-10-16', usuarioId:4, personalDestinoId:8, productoId:7, cantidad:3},
 {entregaId:1, fecha:'2026-10-16', usuarioId:4, personalDestinoId:8, productoId:8, cantidad:2},
 {entregaId:2, fecha:'2026-10-17', usuarioId:4, personalDestinoId:8, productoId:7, cantidad:4}
];
const db = {
 get(query, params, callback) {
  const id = Number(params[0]);
  const permitted = params.length === 1 || params[1] === 'propio@empresa.cl';
  callback(null, id === 10 && permitted ? {id} : undefined);
 },
 all(query, params, callback) {
  assert.equal(params[0], 10);
  callback(null, rows);
 }
};
vm.runInNewContext(source.slice(start, end), {app, db});
const server = http.createServer((req, res) => {
 const match = /^\/api\/solicitudes\/([^/]+)\/entregas-parciales$/.exec(req.url);
 if (!match) {res.writeHead(404); return res.end();}
 const response = {
  status(code) {res.statusCode = code; return this;},
  json(body) {res.setHeader('content-type','application/json'); res.end(JSON.stringify(body));}
 };
 handler({params:{id:match[1]},usuario:{rol:req.headers['x-role']||'BODEGA', usuario:req.headers['x-user']||''}},response);
});
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const base = `http://127.0.0.1:${server.address().port}`;
 const get = async (id, role='BODEGA', user='') => {
  const response = await fetch(`${base}/api/solicitudes/${id}/entregas-parciales`, {headers:{'x-role':role,'x-user':user}});
  return {status:response.status, body:await response.json()};
 };
 try {
  const valid = await get('10');
  assert.equal(valid.status, 200);
  assert.equal(valid.body.entregas.length, 2);
  assert.deepEqual(valid.body.entregas[0].productos, [{productoId:7,cantidad:3},{productoId:8,cantidad:2}]);
  assert.equal(valid.body.entregas[1].productos[0].cantidad, 4);
  assert.equal((await get('10','SUPERVISOR','propio@empresa.cl')).status,200);
  assert.equal((await get('10','SUPERVISOR','ajeno@empresa.cl')).status,404);
  assert.equal((await get('20')).status,404);
  for (const bad of ['0','-1','abc','9007199254740992']) assert.equal((await get(bad)).status,400);
  console.log('OK: historial HTTP, agrupación, permisos y validación de IDs');
 } finally {await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); server.close(); process.exitCode=1;});
