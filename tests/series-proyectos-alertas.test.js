'use strict';
const assert=require('node:assert/strict');
const {nivelAlerta,etiquetaAlerta,agruparPendientes}=require('../public/js/series-proyectos');
const ahora=new Date('2026-10-12T12:00:00Z');
const entrada=dias=>({fecha_entrega:new Date(ahora.getTime()-dias*86400000).toISOString()});
for(const [dias,esperado] of [[0,'NORMAL'],[14,'NORMAL'],[15,'ATENCION'],[29,'ATENCION'],[30,'PRIORITARIA'],[90,'PRIORITARIA']]){
 assert.equal(nivelAlerta(entrada(dias),ahora),esperado);
}
assert.equal(nivelAlerta({fecha_entrega:null},ahora),'SIN_FECHA');
assert.equal(nivelAlerta({...entrada(40),fecha_devolucion:'2026-10-11'},ahora),'DEVUELTA');
assert.match(etiquetaAlerta('PRIORITARIA'),/30\+/);
const agrupados=agruparPendientes([
 {trabajador:'Ana',proyecto:'A',numero_serie:'A1',fecha_entrega:'2026-09-01 12:00:00'},
 {trabajador:'Ana',proyecto:'A',numero_serie:'A2',fecha_entrega:'2026-10-10 12:00:00'}
]);
assert.equal(agrupados.length,1);
assert.match(agrupados[0].alerta,/Prioritaria/);
console.log('Alertas de antigüedad: 11 comprobaciones correctas');
