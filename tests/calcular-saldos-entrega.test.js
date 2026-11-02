'use strict';
const assert = require('node:assert/strict');
const calcular = require('../routes/calcular-saldos-entrega');
const detalle = [{producto_id:1,cantidad:5},{producto_id:2,cantidad:2}];
assert.deepEqual(calcular(detalle,[{productoId:1,cantidad:3}]), {
  saldos:[{productoId:1,cantidadEntregada:3,saldoPendiente:2},{productoId:2,cantidadEntregada:0,saldoPendiente:2}],completa:false
});
assert.equal(calcular(detalle,[{productoId:1,cantidad:5},{productoId:2,cantidad:2}]).completa,true);
assert.match(calcular(detalle,[{productoId:1,cantidad:6}]).error,/supera/);
assert.match(calcular(detalle,[{productoId:3,cantidad:1}]).error,/no pertenece/);
assert.match(calcular(detalle,[{productoId:1,cantidad:3},{productoId:1,cantidad:3}]).error,/supera/);
assert.match(calcular(detalle,[{productoId:1,cantidad:1.5}]).error,/inválida/);
assert.match(calcular(detalle,[{productoId:1,cantidad:0}]).error,/inválida/);
assert.match(calcular(detalle,[{productoId:1,cantidad:Number.MAX_SAFE_INTEGER}]).error,/supera/);
assert.match(calcular([], [{productoId:1,cantidad:1}]).error,/deben contener/);
assert.deepEqual(detalle,[{producto_id:1,cantidad:5},{producto_id:2,cantidad:2}]);
console.log('10 comprobaciones de saldos parciales aprobadas.');
