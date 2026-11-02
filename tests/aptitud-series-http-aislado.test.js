'use strict';
// Prueba HTTP del middleware real sin abrir ni modificar la base de producción.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const start = source.indexOf("app.post('/api/movimientos', (req,res,next) => {");
const end = source.indexOf('\n\n        app.post(', start + 10);
assert(start >= 0 && end > start, 'No se encontró el middleware');
let middleware;
let scenario = {};
let writes = 0;
const db = {
  get(sql, params, cb) {
    assert.match(sql, /^SELECT/i);
    if (sql.includes('FROM productos WHERE')) return scenario.productQueryError ? cb(Error('Fallo al consultar producto')) : cb(null, scenario.productMissing ? null : {id: 1, tipo_control: scenario.productType || 'SERIE'});
    if (sql.includes('FROM stock_cantidad')) return scenario.stockQueryError ? cb(Error('Fallo al consultar stock')) : cb(null, scenario.stockNull ? null : scenario.stockInvalid ? {fisico: 2, asignado: 5} : scenario.stockNaN ? {fisico: NaN, asignado: 0} : {fisico: 8, asignado: 5});
    if (sql.includes('FROM productos_seriados ps WHERE')) {
      assert.deepEqual(Array.from(params), ['SER-42', 1], 'La serie debe corresponder al producto');
      return scenario.seriesQueryError ? cb(Error('Fallo al consultar serie')) : cb(null, scenario.missing ? null : {id: 42, estado: scenario.seriesStatus || 'DISPONIBLE', asignada: scenario.assigned ? 1 : 0, entregada: scenario.delivered ? 1 : 0});
    }
    throw Error('Consulta no simulada: ' + sql);
  },
  run() { writes++; throw Error('Escritura inesperada'); }
};
vm.runInNewContext(source.slice(start, end), {
  app: {post(route, fn) {assert.equal(route, '/api/movimientos'); middleware = fn;}},
  db,
  verificarAptitudSerie(id, callback) {
    assert.equal(id, 42);
    callback(scenario.error ? Error('Consulta fallida') : null, scenario.reason || null);
  }
});
assert.equal(typeof middleware, 'function');
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/api/movimientos') {
    res.writeHead(404).end(); return;
  }
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const payload = JSON.parse(body);
      scenario = payload._testScenario || {};
      delete payload._testScenario;
      if (scenario.missingNumber) delete payload.numeroSerie;
      if (Object.prototype.hasOwnProperty.call(scenario, 'cantidad')) payload.cantidad = scenario.cantidad;
      if (scenario.tipoMovimiento) payload.tipoMovimiento = scenario.tipoMovimiento;
      res.status = function(status) {res.statusCode = status; return res;};
      res.json = function(data) {res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res;};
      middleware({body: payload}, res, () => res.json({ok: true, validated: true}));
    } catch (error) {res.statusCode = 500; res.end(JSON.stringify({error: error.message}));}
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/movimientos`;
    const cases = [
      ['rechazada', {reason: 'Inspección rechazada'}, 409],
      ['observada', {reason: 'Inspección observada'}, 409],
      ['vencida', {reason: 'Serie vencida'}, 409],
      ['fallo de consulta', {error: true}, 500],
      ['serie inexistente o de otro producto', {missing: true}, 404],
      ['apta', {}, 200],
      ['cantidad fraccionaria', {productType:'CANTIDAD', cantidad:1.5}, 400],
      ['cantidad cero', {productType:'CANTIDAD', cantidad:0}, 400],
      ['cantidad negativa', {productType:'CANTIDAD', cantidad:-1}, 400],
      ['cantidad superior al stock libre', {productType:'CANTIDAD', cantidad:4}, 409],
      ['stock ausente: rechazar sin descontar', {productType:'CANTIDAD', stockNull:true}, 500],
      ['reservas mayores al físico: rechazar', {productType:'CANTIDAD', stockInvalid:true}, 500],
      ['stock no numérico: rechazar', {productType:'CANTIDAD', stockNaN:true}, 500],
      ['cantidad igual al stock libre', {productType:'CANTIDAD', cantidad:3}, 200],
      ['serie sin número', {missingNumber:true}, 400],
      ['serie asignada', {assigned:true}, 409],
      ['serie entregada', {delivered:true}, 409],
      ['serie con salida anterior', {seriesStatus:'SALIDA'}, 409],
      ['entrada de serie entregada', {delivered:true, tipoMovimiento:'ENTRADA'}, 409],
      ['entrada de serie con estado salida en minúsculas', {seriesStatus:'salida', tipoMovimiento:'ENTRADA'}, 409],
      ['serie en estado desconocido', {seriesStatus:'BLOQUEADA'}, 409],
      ['serie disponible con estado original', {seriesStatus:'Disponible'}, 200],
      ['error consulta de producto', {productQueryError:true}, 500],
      ['producto inexistente', {productMissing:true}, 404],
      ['error consulta de serie', {seriesQueryError:true}, 500],
      ['error consulta de stock', {productType:'CANTIDAD', stockQueryError:true}, 500],
      ['cantidad no numérica', {productType:'CANTIDAD', cantidad:'no-numero'}, 400],
      ['cantidad decimal escrita como texto', {productType:'CANTIDAD', cantidad:'2.5'}, 400]
    ];
    for (const [label, state, expected] of cases) {
      const response = await fetch(url, {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({tipoMovimiento:'SALIDA', codigoProducto:'EPP01', ubicacion:'A1', cantidad:1, numeroSerie:'SER-42', _testScenario:state})
      });
      const result = await response.json();
      assert.equal(response.status, expected, label);
      assert.equal(Boolean(result.ok), expected === 200, label);
      assert.equal(writes, 0, `Escrituras detectadas en ${label}`);
    }
    console.log(`OK: ${cases.length} solicitudes HTTP al middleware; validaciones sin escrituras.`);
  } finally {await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); process.exitCode = 1;});
