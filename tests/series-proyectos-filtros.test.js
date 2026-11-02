'use strict';
const assert=require('node:assert/strict');
const {filtrarEntregas}=require('../public/js/series-proyectos.js');
const entregas=[
 {numero_serie:'SER-01',proyecto:'Obra Norte',trabajador:'Ana',fecha_devolucion:null},
 {numero_serie:'SER-02',proyecto:'Obra Sur',trabajador:'Luis',fecha_devolucion:'2026-10-11'},
 {numero_serie:'SER-03',proyecto:'Obra Norte',trabajador:'José',fecha_devolucion:null}
];
assert.deepEqual(filtrarEntregas(entregas,'PENDIENTE','').map(e=>e.numero_serie),['SER-01','SER-03']);
assert.deepEqual(filtrarEntregas(entregas,'DEVUELTA','').map(e=>e.numero_serie),['SER-02']);
assert.deepEqual(filtrarEntregas(entregas,'TODAS','obra norte').map(e=>e.numero_serie),['SER-01','SER-03']);
assert.deepEqual(filtrarEntregas(entregas,'PENDIENTE','JOSÉ').map(e=>e.numero_serie),['SER-03']);
assert.deepEqual(filtrarEntregas(entregas,'TODAS','no-existe'),[]);
assert.equal(entregas.length,3);
console.log('Filtros de entregas: 6 comprobaciones correctas');
