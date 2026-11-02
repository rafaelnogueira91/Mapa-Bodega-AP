'use strict';
// Contrato de regresión de la ruta real. No conecta a la base de datos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const routeStart = source.indexOf('app.post(\n            "/api/movimientos",');
assert(routeStart >= 0, 'No se encontró la ruta de movimientos');
const start = source.indexOf('// SALIDA CANTIDAD', routeStart);
assert(start > routeStart, 'No se encontró la rama de salida por cantidad');
const end = source.indexOf('conexionSalida.close();', start);
assert(end > start, 'No se encontró el cierre de la conexión');
const branch = source.slice(start, end);
const required = [
  ['espera ante bloqueos en conexión independiente', /conexionSalida\.configure\('busyTimeout', SQLITE_BUSY_TIMEOUT_MS\)/],
  ['transacción de escritura', /await ejecutarSalida\('BEGIN IMMEDIATE TRANSACTION'\)/],
  ['descuento condicionado', /UPDATE stock_cantidad SET cantidad = cantidad - \?/],
  ['producto y ubicación coinciden con stock', /WHERE id = \? AND producto_id = \? AND ubicacion_id = \? AND cantidad >= \?/],
  ['validación de reserva en SQL', /FROM stock_proyecto sp[\s\S]*?sp\.ubicacion_id = stock_cantidad\.ubicacion_id/],
  ['revisión de fila afectada', /descuento\.changes !== 1/],
  ['registro de movimiento', /INSERT INTO movimientos/],
  ['confirmación', /await ejecutarSalida\('COMMIT'\)/],
  ['reversión', /await ejecutarSalida\('ROLLBACK'\)/],
  ['cierre de conexión', /finally\s*\{/]
];
for (const [label, pattern] of required) assert.match(branch, pattern, `Falta ${label}`);
const begin = branch.indexOf("await ejecutarSalida('BEGIN IMMEDIATE TRANSACTION')");
const update = branch.indexOf('UPDATE stock_cantidad SET cantidad = cantidad - ?');
const insert = branch.indexOf('INSERT INTO movimientos');
const commit = branch.indexOf("await ejecutarSalida('COMMIT')");
assert(begin < update && update < insert && insert < commit, 'Orden transaccional incorrecto');
assert.match(branch, /if \(transaccionIniciada\)\s*\{[\s\S]*?await ejecutarSalida\('ROLLBACK'\)/, 'Falta reversión ante excepción');
assert.match(branch, /\['SQLITE_BUSY', 'SQLITE_LOCKED'\]\.includes\(errorSalida\.code\)/, 'Falta distinguir bloqueos temporales');
assert.match(branch, /res\.status\(bloqueoTemporal \? 503 : 500\)/, 'Falta respuesta recuperable ante bloqueo');
console.log(`OK: ${required.length} controles de contrato y orden de transacción en la ruta real.`);
