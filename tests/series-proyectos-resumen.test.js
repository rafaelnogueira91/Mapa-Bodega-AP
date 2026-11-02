'use strict';
const assert=require('node:assert/strict');
const {filtrarEntregas,estadoEntrega,resumenEntregas}=require('../public/js/series-proyectos');
const entregas=[
 {numero_serie:'SER-1',proyecto:'PROY-A',trabajador:'Ana',ubicacion_origen:'B1-P01-U01',fecha_devolucion:null},
 {numero_serie:'SER-2',proyecto:'PROY-B',trabajador:'Luis',ubicacion_origen:'B1-P01-U02',fecha_devolucion:'2026-10-12'},
 {numero_serie:'SER-3',proyecto:'PROY-A',trabajador:'Ana',ubicacion_origen:'B1-P01-U03',fecha_devolucion:''}
];
assert.deepEqual(resumenEntregas(entregas),{pendientes:2,devueltas:1});
assert.equal(estadoEntrega(entregas[0]),'Pendiente');
assert.equal(estadoEntrega(entregas[1]),'Devuelta');
assert.equal(filtrarEntregas(entregas,'PENDIENTE','Ana').length,2);
assert.equal(filtrarEntregas(entregas,'DEVUELTA','Luis').length,1);
assert.equal(filtrarEntregas(entregas,'TODAS','B1-P01-U02').length,1);
assert.equal(filtrarEntregas(entregas,'PENDIENTE','Luis').length,0);
console.log('Panel de entregas: 7 comprobaciones correctas');
