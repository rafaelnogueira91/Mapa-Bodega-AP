'use strict';
const assert=require('node:assert/strict');
const {diasPendiente,antiguedadEntrega,agruparPendientes}=require('../public/js/series-proyectos');
const ahora=new Date('2026-10-12T12:00:00Z');
assert.equal(diasPendiente('2026-10-09 12:00:00',ahora),3);
assert.equal(diasPendiente('2026-10-11T12:00:00Z',ahora),1);
assert.equal(diasPendiente('2026-10-12T11:59:59Z',ahora),0);
assert.equal(diasPendiente('2026-10-13T12:00:00Z',ahora),0);
assert.equal(diasPendiente('fecha-invalida',ahora),null);
assert.equal(antiguedadEntrega({fecha_devolucion:'2026-10-11',fecha_entrega:'2026-10-01'},ahora),'Devuelta');
assert.equal(antiguedadEntrega({fecha_entrega:null},ahora),'Sin fecha');
const grupos=agruparPendientes([
 {trabajador:'Ana',proyecto:'A',numero_serie:'S1',fecha_entrega:'2026-10-01 10:00:00',fecha_devolucion:null},
 {trabajador:'Ana',proyecto:'A',numero_serie:'S2',fecha_entrega:'2026-10-10 10:00:00',fecha_devolucion:null},
 {trabajador:'Ana',proyecto:'A',numero_serie:'S3',fecha_entrega:'2026-09-01 10:00:00',fecha_devolucion:'2026-09-03'}
]);
assert.equal(grupos.length,1);
assert.equal(grupos[0].primeraEntrega,'2026-10-01 10:00:00');
assert.equal(grupos[0].pendientes,2);
assert.equal(grupos[0].series,'S1, S2');
assert.match(grupos[0].antiguedad_maxima,/día/);
console.log('Antigüedad y pendientes: 12 comprobaciones correctas');
