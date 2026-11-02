'use strict';
const assert=require('node:assert/strict');
const routes={};
const db={all(sql,args,cb){
 if(sql.includes('FROM productos_seriados ps') && sql.includes('WHERE ps.numero_serie=?'))return cb(null,args[0]==='SER-01'?[{id:3,numero_serie:'SER-01',estado:'SALIDA'}]:[]);
 if(sql.includes('FROM movimientos m'))return cb(null,[{id:9,tipo_movimiento:'SALIDA',fecha_movimiento:'2026-10-11 10:00:00'}]);
 if(sql.includes('FROM entregas_series_proyecto e'))return cb(null,[{id:12,proyecto_id:7,fecha_entrega:'2026-10-10 10:00:00',fecha_devolucion:'2026-10-12 10:00:00'}]);
 cb(new Error('SQL inesperado'));
}};
require('../routes/auditoria-inventario')({get(url,fn){routes[url]=fn;}},db);
const fn=routes['/api/admin/auditoria-inventario/historial-serie'];
assert.equal(typeof fn,'function');
async function call(query,rol='ADMIN'){
 let status=200,body;
 const res={status(n){status=n;return this;},json(v){body=v;return this;}};
 await fn({usuario:{rol},query},res);
 return {status,body};
}
(async()=>{
 assert.equal((await call({serie:'SER-01'},'CONSULTA')).status,403);
 assert.equal((await call({serie:''})).status,400);
 assert.equal((await call({serie:'x'.repeat(151)})).status,400);
 assert.equal((await call({serie:'INEXISTENTE'})).status,404);
 const ok=await call({serie:'SER-01'},'BODEGA');
 assert.equal(ok.status,200);
 assert.equal(ok.body.herramienta.id,3);
 assert.equal(ok.body.movimientos[0].id,9);
 assert.equal(ok.body.entregas[0].id,12);
 assert.deepEqual(ok.body.eventos.map(e=>e.tipo),['DEVOLUCION_PROYECTO','MOVIMIENTO','ENTREGA']);
 assert.equal(ok.body.eventos[0].fecha,'2026-10-12 10:00:00');
 console.log('Historial de serie: permisos, validación, ausencia y consulta OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
