'use strict';
// Pruebas unitarias de las operaciones de stock utilizadas por los traslados.
const assert = require('node:assert/strict');
const stockFactory = require('../routes/stock-operations');
let rows=[{id:1,producto_id:10,ubicacion_id:1,cantidad:7}];
let reserved=3;
let nextId=2;
const db={
 get(sql,args,cb){
   let result;
   if(sql.includes('SUM(cantidad)') && sql.includes('stock_cantidad')) result={n:rows.filter(r=>r.producto_id===args[0]&&r.ubicacion_id===args[1]).reduce((s,r)=>s+r.cantidad,0)};
   else if(sql.includes('SUM(cantidad)') && sql.includes('stock_proyecto')) result={n:args[1]===1?reserved:0};
   else if(sql.includes('SELECT id FROM stock_cantidad')) result=rows.find(r=>r.producto_id===args[0]&&r.ubicacion_id===args[1]);
   else if(sql.includes('SELECT (SELECT COUNT(*)')) result={n:rows.filter(r=>r.ubicacion_id===args[0]&&r.cantidad>0).length};
   else throw new Error('Consulta inesperada: '+sql);
   queueMicrotask(()=>cb(null,result));
 },
 all(sql,args,cb){
   assert.match(sql,/FROM stock_cantidad/);
   queueMicrotask(()=>cb(null,rows.filter(r=>r.producto_id===args[0]&&r.ubicacion_id===args[1]&&r.cantidad>0).map(r=>({...r}))));
 },
 run(sql,args,cb){
   let changes=0;
   if(sql.startsWith('UPDATE stock_cantidad SET cantidad=cantidad-')){
     const r=rows.find(r=>r.id===args[1]&&r.cantidad>=args[2]);
     if(r){r.cantidad-=args[0];changes=1;}
   }else if(sql.startsWith('UPDATE stock_cantidad SET cantidad=cantidad+')){
     const r=rows.find(r=>r.id===args[1]);if(r){r.cantidad+=args[0];changes=1;}
   }else if(sql.startsWith('INSERT INTO stock_cantidad')){
     rows.push({id:nextId++,producto_id:args[0],ubicacion_id:args[1],cantidad:args[2]});changes=1;
   }else if(sql.startsWith('UPDATE ubicaciones SET estado=')){changes=1;}
   else throw new Error('Actualización inesperada: '+sql);
   queueMicrotask(()=>cb.call({changes},null));
 }
};
const ops=stockFactory(db);
(async()=>{
 assert.equal(await ops.free(10,1),4);
 await assert.rejects(ops.withdraw(10,1,5),/Stock libre insuficiente/);
 assert.equal(rows[0].cantidad,7,'No debe descontar al rechazar stock reservado');
 await assert.rejects(ops.withdraw(10,1,0),/entero positivo/);
 await assert.rejects(ops.deposit(10,2,1.5),/entero positivo/);
 await ops.withdraw(10,1,4);
 await ops.deposit(10,2,4);
 assert.equal(await ops.free(10,1),0);
 assert.equal(await ops.free(10,2),4);
 assert.equal(rows.reduce((sum,r)=>sum+r.cantidad,0),7,'Traslado conserva el total físico');
 await ops.deposit(10,2,2);
 assert.equal(await ops.free(10,2),6);
 console.log('OK: stock reservado, validación, traslado y conservación de existencias');
})().catch(e=>{console.error(e);process.exitCode=1;});
