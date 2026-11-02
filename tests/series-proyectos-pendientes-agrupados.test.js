'use strict';
const assert=require('node:assert/strict');
const {agruparPendientes}=require('../public/js/series-proyectos');
const datos=[
 {trabajador:'Ana',proyecto:'Obra 1',numero_serie:'S-01',fecha_devolucion:null},
 {trabajador:'Ana',proyecto:'Obra 1',numero_serie:'S-02',fecha_devolucion:''},
 {trabajador:'Ana',proyecto:'Obra 2',numero_serie:'S-03',fecha_devolucion:null},
 {trabajador:'Luis',proyecto:'Obra 1',numero_serie:'S-04',fecha_devolucion:'2026-10-12'},
 {trabajador:'Luis',proyecto:'Obra 1',numero_serie:'S-05',fecha_devolucion:null}
];
const grupos=agruparPendientes(datos);
assert.equal(grupos.length,3);
assert.deepEqual(grupos.map(g=>g.pendientes),[2,1,1]);
assert.equal(grupos[0].trabajador,'Ana');
assert.equal(grupos[0].proyecto,'Obra 1');
assert.equal(grupos[0].series,'S-01, S-02');
assert.ok(!grupos.some(g=>g.series.includes('S-04')));
assert.deepEqual(agruparPendientes([]),[]);
assert.equal(agruparPendientes([{numero_serie:'X'}])[0].trabajador,'Sin trabajador');
console.log('Resumen pendientes por responsable: 8 comprobaciones correctas');
