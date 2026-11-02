'use strict';
// Operaciones comunes sobre series. Deben ejecutarse dentro de transaction-lock.
module.exports = db => {
 const get=(sql,args=[])=>new Promise((resolve,reject)=>db.get(sql,args,(e,row)=>e?reject(e):resolve(row)));
 const run=(sql,args=[])=>new Promise((resolve,reject)=>db.run(sql,args,function(e){e?reject(e):resolve(this.changes)}));
 const fail=message=>Object.assign(new Error(message),{status:409});
 const valid=(value)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=200;
 async function receive(productId,locationId,serial){
  if(!valid(serial))throw fail('Número de serie inválido.');
  const exists=await get('SELECT id FROM productos_seriados WHERE numero_serie=?',[serial]);
  if(exists)throw fail('La serie ya existe. Usa devolución o traslado.');
  await run("INSERT INTO productos_seriados(producto_id,numero_serie,ubicacion_id,estado) VALUES(?,?,?,'Disponible')",[productId,serial,locationId]);
 }
 async function withdraw(productId,locationId,serial){
  if(!valid(serial))throw fail('Número de serie inválido.');
  const changed=await run(`UPDATE productos_seriados SET estado='SALIDA',ubicacion_id=NULL
    WHERE producto_id=? AND ubicacion_id=? AND numero_serie=? AND estado='Disponible'
    AND NOT EXISTS(SELECT 1 FROM series_proyecto sp WHERE sp.serie_id=productos_seriados.id)
    AND NOT EXISTS(SELECT 1 FROM entregas_series_proyecto ep WHERE ep.serie_id=productos_seriados.id AND ep.fecha_devolucion IS NULL)`,
    [productId,locationId,serial]);
  if(changed!==1)throw fail('Serie no disponible o asignada a un proyecto/trabajador.');
 }
 async function transfer(productId,originId,destinationId,serial){
  if(!valid(serial)||originId===destinationId)throw fail('Serie o ubicaciones inválidas.');
  const changed=await run(`UPDATE productos_seriados SET ubicacion_id=?
    WHERE producto_id=? AND ubicacion_id=? AND numero_serie=? AND estado='Disponible'
    AND NOT EXISTS(SELECT 1 FROM series_proyecto sp WHERE sp.serie_id=productos_seriados.id)
    AND NOT EXISTS(SELECT 1 FROM entregas_series_proyecto ep WHERE ep.serie_id=productos_seriados.id AND ep.fecha_devolucion IS NULL)`,
    [destinationId,productId,originId,serial]);
  if(changed!==1)throw fail('La serie ya no está disponible en la ubicación de origen.');
 }
 async function returnToStock(productId,locationId,serial,personalId){
  if(!valid(serial)||!Number.isSafeInteger(personalId)||personalId<=0)throw fail('Serie o trabajador inválido.');
  const item=await get('SELECT id,estado FROM productos_seriados WHERE producto_id=? AND numero_serie=?',[productId,serial]);
  if(!item||item.estado!=='SALIDA')throw fail('La serie no figura como salida.');
  const last=await get("SELECT personal_id FROM movimientos WHERE producto_id=? AND numero_serie=? AND tipo_movimiento IN ('SALIDA','DEVOLUCION') ORDER BY id DESC LIMIT 1",[productId,serial]);
  if(!last||Number(last.personal_id)!==personalId)throw fail('La última entrega de esta serie no corresponde al trabajador seleccionado.');
  const delivery=await get(`SELECT id,proyecto_id,personal_id FROM entregas_series_proyecto
    WHERE serie_id=? AND fecha_devolucion IS NULL`,[item.id]);
  if(delivery){
   if(Number(delivery.personal_id)!==personalId)throw fail('La entrega de este proyecto pertenece a otro trabajador.');
   const project=await get('SELECT id FROM proyectos WHERE id=?',[delivery.proyecto_id]);
   if(!project)throw fail('El proyecto original de la serie no existe.');
  }
  const updated=await run("UPDATE productos_seriados SET estado='Disponible',ubicacion_id=? WHERE id=? AND estado='SALIDA'",[locationId,item.id]);
  if(updated!==1)throw fail('La serie ya fue devuelta.');
  if(delivery){
   await run('INSERT INTO series_proyecto(serie_id,proyecto_id) VALUES(?,?)',[item.id,delivery.proyecto_id]);
   const closed=await run(`UPDATE entregas_series_proyecto SET fecha_devolucion=CURRENT_TIMESTAMP,
     ubicacion_devolucion_id=? WHERE id=? AND fecha_devolucion IS NULL`,[locationId,delivery.id]);
   if(closed!==1)throw fail('No fue posible cerrar la entrega de proyecto.');
  }
 }
 return {receive,withdraw,transfer,returnToStock};
};
