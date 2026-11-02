'use strict';
const assert=require('node:assert/strict');
const {resumenAlertas,filtrarPorAlerta,filtrarEntregas}=require('../public/js/series-proyectos');
const ahora=new Date('2026-10-12T12:00:00Z');
const fecha=dias=>new Date(ahora.getTime()-dias*86400000).toISOString();
const datos=[
 {numero_serie:'P1',trabajador:'Ana',proyecto:'A',fecha_entrega:fecha(35)},
 {numero_serie:'P2',trabajador:'Ana',proyecto:'A',fecha_entrega:fecha(30)},
 {numero_serie:'A1',trabajador:'Luis',proyecto:'B',fecha_entrega:fecha(15)},
 {numero_serie:'N1',trabajador:'Luis',proyecto:'B',fecha_entrega:fecha(14)},
 {numero_serie:'S1',trabajador:'Ana',proyecto:'A',fecha_entrega:null},
 {numero_serie:'D1',trabajador:'Ana',proyecto:'A',fecha_entrega:fecha(90),fecha_devolucion:fecha(2)}
];
assert.deepEqual(resumenAlertas(datos,ahora),{PRIORITARIA:2,ATENCION:1,NORMAL:1,SIN_FECHA:1,pendientes:5,devueltas:1});
assert.equal(resumenAlertas([],ahora).pendientes,0);
assert.equal(resumenAlertas(filtrarPorAlerta(datos,'PRIORITARIA',ahora),ahora).PRIORITARIA,2);
assert.equal(resumenAlertas(filtrarPorAlerta(datos,'ATENCION',ahora),ahora).ATENCION,1);
assert.equal(resumenAlertas(filtrarPorAlerta(datos,'NORMAL',ahora),ahora).NORMAL,1);
assert.equal(resumenAlertas(filtrarPorAlerta(datos,'SIN_FECHA',ahora),ahora).SIN_FECHA,1);
assert.equal(resumenAlertas(filtrarEntregas(datos,'PENDIENTE','Ana'),ahora).pendientes,3);
assert.equal(resumenAlertas(filtrarEntregas(datos,'DEVUELTA','Ana'),ahora).devueltas,1);
assert.equal(resumenAlertas(datos,ahora).PRIORITARIA,2); // No cuenta una devuelta antigua.
assert.equal(datos[0].fecha_devolucion,undefined); // Sin mutaciones.
console.log('Contadores de alertas: 10 comprobaciones correctas');
