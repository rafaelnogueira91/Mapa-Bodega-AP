'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../public/js/solicitudes.js'), 'utf8');
const start = source.indexOf('const entregasParcialesSinConfirmar = new Map();');
const end = source.indexOf('// Reintentar una pérdida de conexión', start);
assert(start >= 0 && end > start);
const script = source.slice(start, end);
const data = new Map();
const sessionStorage = {
  getItem: k => data.get(k) ?? null,
  setItem: (k, v) => data.set(k, v),
  removeItem: k => data.delete(k)
};
function context() {
  return vm.createContext({sessionStorage, console, avisosIdentidadLista:true, claveAvisosUsuario:"avisos_usuario_1"});
}
const op = {url:'/api/solicitudes/12/entregar-parcial', clave:'12345678-1234-1234-1234-123456789abc', carga:{personalId:3,productos:[{productoId:4,tipoControl:'CANTIDAD',cantidad:2}]}};
const first = context();
vm.runInContext(script, first);
vm.runInContext(`entregasParcialesSinConfirmar.set(12, ${JSON.stringify(op)}); guardarEntregasParcialesPendientes();`, first);
assert.equal(data.size, 1);
const reloaded = context();
vm.runInContext(script + "\nrecuperarEntregasParcialesPendientes();", reloaded);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.get(12).clave', reloaded), op.clave);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.get(12).carga.productos[0].cantidad', reloaded), 2);
vm.runInContext('entregasParcialesSinConfirmar.delete(12); guardarEntregasParcialesPendientes();', reloaded);
assert.equal(data.size, 0);
data.set('mapaBodega:entregasParcialesSinConfirmar:v2:avisos_usuario_1', JSON.stringify([[12,{...op,url:'https://example.com/evil'}]]));
const malformed = context();
vm.runInContext(script + "\nrecuperarEntregasParcialesPendientes();", malformed);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.size', malformed), 0);
assert.equal(data.size, 0);
// El servidor admite guiones bajos en la clave; la recuperación debe admitirlos también.
const claveConGuionBajo = {...op, clave:'entrega_parcial_123456789'};
data.set('mapaBodega:entregasParcialesSinConfirmar:v2:avisos_usuario_1', JSON.stringify([[12, claveConGuionBajo]]));
const conGuionBajo = context();
vm.runInContext(script + "\nrecuperarEntregasParcialesPendientes();", conGuionBajo);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.get(12).clave', conGuionBajo), claveConGuionBajo.clave);
data.clear();
// La recuperación nunca debe reenviar una carga manipulada, aunque tenga URL y clave válidas.
for (const carga of [
  {...op.carga, productos:[{productoId:4,tipoControl:'CANTIDAD',cantidad:-2}]},
  {...op.carga, productos:[{productoId:4,tipoControl:'SERIE',cantidad:2}]},
  {...op.carga, productos:[{productoId:4,tipoControl:'CANTIDAD',cantidad:2},{productoId:4,tipoControl:'CANTIDAD',cantidad:2}]},
  {...op.carga, personalId:0}
]) {
  data.set('mapaBodega:entregasParcialesSinConfirmar:v2:avisos_usuario_1', JSON.stringify([[12,{...op,carga}]]));
  const recovered = context();
  vm.runInContext(script + "\nrecuperarEntregasParcialesPendientes();", recovered);
  assert.equal(vm.runInContext('entregasParcialesSinConfirmar.size', recovered), 0);
  assert.equal(data.size, 0);
}
data.set('mapaBodega:entregasParcialesSinConfirmar:v2:avisos_usuario_1', JSON.stringify([[12,op],[12,op]]));
const duplicates = context();
vm.runInContext(script + "\nrecuperarEntregasParcialesPendientes();", duplicates);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.size', duplicates), 0);
assert.equal(data.size, 0);
// Otra cuenta en la misma pestaña no puede recuperar una entrega ajena.
data.set('mapaBodega:entregasParcialesSinConfirmar:v2:avisos_usuario_1', JSON.stringify([[12, op]]));
const otraCuenta = vm.createContext({sessionStorage, console, avisosIdentidadLista:true, claveAvisosUsuario:'avisos_usuario_2'});
vm.runInContext(script + '\nrecuperarEntregasParcialesPendientes();', otraCuenta);
assert.equal(vm.runInContext('entregasParcialesSinConfirmar.size', otraCuenta), 0);
console.log('OK: persiste tras recarga, recupera la misma operación, limpia al confirmar y rechaza datos manipulados');
