'use strict';
// Ejecuta el middleware real de /api/movimientos con dependencias aisladas.
// No abre database/bodega.db ni inicia el servidor.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.post('/api/movimientos', (req,res,next) => {");
const end = source.indexOf('\n\n        app.post(', start + 10);
assert(start >= 0 && end > start, 'No se encontró el middleware real');
const middlewareSource = source.slice(start, end);
let handler;
let scenario;
let writes;
const app = {post(route, fn) {assert.equal(route, '/api/movimientos'); handler = fn;}};
const db = {
  get(sql, params, cb) {
    assert.match(sql, /^SELECT/i);
    if (sql.includes('FROM productos WHERE')) return cb(null, {id: 1, tipo_control:'SERIE'});
    if (sql.includes('FROM productos_seriados ps WHERE')) return cb(null, {id: 42, estado:'DISPONIBLE', asignada:0, entregada:0});
    throw new Error('Consulta inesperada: ' + sql);
  },
  run() {writes++; throw new Error('El middleware no debe escribir');}
};
const context = vm.createContext({app, db, verificarAptitudSerie(id, cb) {
  assert.equal(id, 42);
  cb(scenario.error || null, scenario.reason || null);
}});
vm.runInContext(middlewareSource, context);
assert.equal(typeof handler, 'function');
async function run(reason, error, expectedStatus, expectedNext) {
  scenario = {reason, error}; writes = 0;
  let nextCount = 0, responseCount = 0, responseStatus = 200, responseBody;
  const res = {
    status(n) {responseStatus = n; return this;},
    json(body) {responseCount++; responseBody = body; return this;}
  };
  handler({body:{tipoMovimiento:'SALIDA', codigoProducto:'EPP01', ubicacion:'A1', cantidad:1, numeroSerie:'SER-42'}}, res, () => nextCount++);
  assert.equal(nextCount, expectedNext);
  assert.equal(responseCount, expectedNext ? 0 : 1);
  if (!expectedNext) {
    assert.equal(responseStatus, expectedStatus);
    assert.equal(typeof responseBody.mensaje, 'string');
  }
  assert.equal(writes, 0, 'No debe haber escrituras antes de validar aptitud');
}
(async () => {
  await run('Inspección rechazada', null, 409, 0);
  await run('Inspección observada', null, 409, 0);
  await run('Serie vencida', null, 409, 0);
  await run(null, new Error('SQLite falló'), 500, 0);
  await run(null, null, 200, 1);
  console.log('OK: middleware real bloquea 409/500 sin escrituras y permite serie apta.');
})().catch(error => {console.error(error); process.exitCode = 1;});
