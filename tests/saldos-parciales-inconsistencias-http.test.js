'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.get('/api/solicitudes/:id/saldos'");
const end = source.indexOf('// Historial detallado de entregas parciales', start);
assert.ok(start >= 0 && end > start);
let handler, filas;
const db = {
 get(sql, params, cb) { cb(null, {id:1, estado:'EN PREPARACIÓN'}); },
 all(sql, params, cb) { cb(null, filas); }
};
vm.runInNewContext(source.slice(start,end), {app:{get(route, fn){handler=fn;}},db});
function consultar(data) {
 filas = data;
 let status = 200, body;
 handler({params:{id:'1'}, usuario:{rol:'BODEGA'}}, {
  status(c){status=c;return this;},json(b){body=b;return this;}
 });
 return {status,body};
}
const row = (solicitada, entregada) => ({productoId:10,cantidadSolicitada:solicitada,cantidadEntregada:entregada});
assert.equal(consultar([row(10,3)]).status,200);
for (const entrada of [row(10,-1),row(0,0),row(-5,0),row(10,11),row(10,1.5),row(10,NaN),row(Number.MAX_SAFE_INTEGER+1,0), {...row(10,0), productoId:0}, {...row(10,0), productoId:1.5}]) {
 assert.equal(consultar([entrada]).status,409,JSON.stringify(entrada));
}
console.log('Validación HTTP de saldos inconsistentes: OK');
