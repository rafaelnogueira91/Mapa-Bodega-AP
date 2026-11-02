const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('listado de solicitudes filtra por ficha de supervisor vinculada a cuenta', () => {
  const list = source.split('app.get(\n    "/api/solicitudes",')[1].split('// CONFIRMAR ENTREGA')[0];
  assert.match(list, /req\.usuario\?\.rol === 'SUPERVISOR'/);
  assert.match(list, /identidad\.id = s\.supervisor_id/);
  assert.match(list, /LOWER\(identidad\.correo\) = LOWER\(\?\)/);
  assert.match(list, /LOWER\(identidad\.rut\) = LOWER\(\?\)/);
  assert.match(list, /\$\{filtroSupervisor\}/);
  assert.match(list, /parametros,\s*\(error, filas\)/);
});

test('cambio de prioridad restringe solicitud a supervisor autenticado', () => {
  const route = source.split("app.patch('/api/solicitudes/:id/prioridad'")[1].split('// LISTAR SOLICITUDES')[0];
  assert.match(route, /identidad\.id = solicitudes\.supervisor_id/);
  assert.match(route, /\$\{filtroPropietario\}/);
  assert.match(route, /parametrosPropietario/);
});
