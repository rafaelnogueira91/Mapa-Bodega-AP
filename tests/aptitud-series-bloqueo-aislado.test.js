'use strict';
// Prueba de ejecución del verificador con base simulada de solo lectura.
// No inicia el servidor ni accede a database/bodega.db.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf('function verificarAptitudSerie(serieId, callback)');
const end = source.indexOf('// Resumen de la última inspección', start);
assert(start !== -1 && end > start);
const snippet = source.slice(start, end);
let fixture, failure, calls;
const db = {
  get(sql, params, callback) {
    calls.push({sql, params});
    assert.match(sql, /^SELECT\s/i);
    assert.deepEqual(Array.from(params), [42, 42]);
    callback(failure, fixture);
  },
  run() { throw new Error('No se permite escribir en la base de datos'); },
};
const context = vm.createContext({db, Date, Error});
vm.runInContext(snippet + '\nthis.verificar = verificarAptitudSerie;', context);
function verify(data, err = null) {
  fixture = data;
  failure = err;
  calls = [];
  let result, count = 0;
  context.verificar(42, (error, blocked) => { count++; result = {error, blocked}; });
  assert.equal(count, 1, 'La devolución debe ejecutarse exactamente una vez');
  assert.equal(calls.length, 1, 'Solo se permite una consulta');
  return result;
}
for (const resultado of ['RECHAZADA', 'OBSERVADA']) {
  const result = verify({ultimaRevision: resultado, vencimiento: null});
  assert.equal(result.error, null);
  assert.match(result.blocked, /No se puede entregar/);
}
const yesterday = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
assert.match(verify({ultimaRevision:'APROBADA', vencimiento:yesterday}).blocked, /vencimiento/);
assert.equal(verify({ultimaRevision:'APROBADA', vencimiento:tomorrow}).blocked, null);
assert.equal(verify({ultimaRevision:null, vencimiento:null}).blocked, null);
assert.match(verify(null).error.message, /Serie inexistente/);
assert.equal(verify(null, new Error('Error de lectura')).error.message, 'Error de lectura');
// Confirmar que ambas rutas consultan la aptitud ANTES de seguir con la salida.
const solicitud = source.slice(source.indexOf('function continuarEntregaSerie()'), source.indexOf('function continuarEntregaSerieValidada()'));
assert.match(solicitud, /if \(motivoBloqueo\) return cancelarEntrega\(motivoBloqueo\)/);
const movimientos = source.slice(source.indexOf("if(tipoMovimiento==='SALIDA' && serie) {"), source.indexOf('app.post(\n            "/api/movimientos"'));
assert.match(movimientos, /if\(motivoBloqueo\) return res\.status\(409\)/);
console.log('OK: inspecciones observadas/rechazadas, vencimiento, errores y lectura sin escrituras.');
