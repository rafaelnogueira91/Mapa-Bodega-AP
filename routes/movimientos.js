"use strict";
// Movimientos manuales transaccionales. Registrado antes del controlador heredado.
module.exports=(app,db)=>{
 const get=(q,a=[])=>new Promise((ok,no)=>db.get(q,a,(e,r)=>e?no(e):ok(r)));
 const all=(q,a=[])=>new Promise((ok,no)=>db.all(q,a,(e,r)=>e?no(e):ok(r)));
 const run=(q,a=[])=>new Promise((ok,no)=>db.run(q,a,function(e){e?no(e):ok(this.changes)}));
 const fail=(m,status=400)=>Object.assign(new Error(m),{status});
 const locked = work => require('./transaction-lock')(db, work);
 const stock = require('./stock-operations')(db);
 const serialOps = require('./serie-operations')(db);
 // Trazabilidad de producto/serie. Consulta de solo lectura con límite de resultados.
 app.get('/api/trazabilidad',async(req,res)=>{
  try{
   const codigo=String(req.query.codigo||'').trim();
   const serie=String(req.query.serie||'').trim();
   if(!codigo||codigo.length>120||serie.length>200)return res.status(400).json({mensaje:'Indica un código de producto válido'});
   const producto=await get('SELECT id,codigo,nombre,tipo_control FROM productos WHERE codigo=?',[codigo]);
   if(!producto)return res.status(404).json({mensaje:'Producto no encontrado'});
   if(serie && producto.tipo_control!=='SERIE')return res.status(400).json({mensaje:'Este producto no se controla por serie'});
   const ubicaciones=producto.tipo_control==='CANTIDAD'
     ?await all(`SELECT u.codigo AS ubicacion, SUM(sc.cantidad) AS cantidad
       FROM stock_cantidad sc JOIN ubicaciones u ON u.id=sc.ubicacion_id
       WHERE sc.producto_id=? GROUP BY u.id,u.codigo HAVING SUM(sc.cantidad)>0 ORDER BY u.codigo`,[producto.id])
     :await all(`SELECT u.codigo AS ubicacion, ps.numero_serie AS serie,ps.estado
       FROM productos_seriados ps LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
       WHERE ps.producto_id=? AND (?='' OR ps.numero_serie=?) ORDER BY ps.numero_serie LIMIT 300`,[producto.id,serie,serie]);
   const asignaciones=producto.tipo_control==='SERIE'
     ?await all(`SELECT ps.numero_serie AS serie,
       pa.codigo AS proyecto_asignado,
       pe.codigo AS proyecto_entrega,
       per.nombre AS trabajador,
       e.solicitud_id AS solicitud,
       e.fecha_entrega,
       e.ubicacion_origen_id,
       u.codigo AS ubicacion_origen
       FROM productos_seriados ps
       LEFT JOIN series_proyecto sp ON sp.serie_id=ps.id
       LEFT JOIN proyectos pa ON pa.id=sp.proyecto_id
       LEFT JOIN entregas_series_proyecto e ON e.serie_id=ps.id AND e.fecha_devolucion IS NULL
       LEFT JOIN proyectos pe ON pe.id=e.proyecto_id
       LEFT JOIN personal per ON per.id=e.personal_id
       LEFT JOIN ubicaciones u ON u.id=e.ubicacion_origen_id
       WHERE ps.producto_id=? AND (?='' OR ps.numero_serie=?)
       ORDER BY ps.numero_serie LIMIT 300`,[producto.id,serie,serie])
     :[];
   const historialEntregas=producto.tipo_control==='SERIE'
     ?await all(`SELECT ps.numero_serie AS serie,pe.codigo AS proyecto,
       per.nombre AS trabajador,e.solicitud_id AS solicitud,
       e.fecha_entrega,e.fecha_devolucion,
       u.codigo AS ubicacion_origen,ud.codigo AS ubicacion_devolucion
       FROM entregas_series_proyecto e
       JOIN productos_seriados ps ON ps.id=e.serie_id
       LEFT JOIN proyectos pe ON pe.id=e.proyecto_id
       LEFT JOIN personal per ON per.id=e.personal_id
       LEFT JOIN ubicaciones u ON u.id=e.ubicacion_origen_id
       LEFT JOIN ubicaciones ud ON ud.id=e.ubicacion_devolucion_id
       WHERE ps.producto_id=? AND (?='' OR ps.numero_serie=?)
       ORDER BY e.fecha_entrega DESC,e.id DESC LIMIT 300`,[producto.id,serie,serie])
     :[];
   const movimientos=await all(`SELECT m.id,m.tipo_movimiento,m.cantidad,m.numero_serie,m.fecha_movimiento,
       u.codigo AS origen,ud.codigo AS destino,per.nombre AS entregado_a
       FROM movimientos m LEFT JOIN ubicaciones u ON u.id=m.ubicacion_id
       LEFT JOIN ubicaciones ud ON ud.id=m.ubicacion_destino_id
       LEFT JOIN personal per ON per.id=m.personal_id
       WHERE m.producto_id=? AND (?='' OR m.numero_serie=?)
       ORDER BY m.fecha_movimiento DESC,m.id DESC LIMIT 300`,[producto.id,serie,serie]);
   res.json({producto,ubicaciones,asignaciones,historialEntregas,movimientos,limite:300});
  }catch(error){console.error('Trazabilidad:',error);res.status(500).json({mensaje:'No fue posible consultar la trazabilidad'});}
 });
 app.post('/api/movimientos',async(req,res)=>{
  try{
   const {tipoMovimiento:tipo,codigoProducto,ubicacion,ubicacionDestino,cantidad,numeroSerie,personalId}=req.body||{};
   if(!['ENTRADA','SALIDA','TRASLADO'].includes(tipo)||!codigoProducto||!ubicacion)throw fail('Datos de movimiento incompletos');
   const result=await locked(async()=>{
    const p=await get('SELECT id,tipo_control FROM productos WHERE codigo=?',[codigoProducto]);
    const u=await get('SELECT id FROM ubicaciones WHERE codigo=?',[ubicacion]);
    if(!p||!u)throw fail('Producto o ubicación no encontrados',404);
    let destination=null;
    if(tipo==='TRASLADO'){
      if(!ubicacionDestino||ubicacionDestino===ubicacion)throw fail('Selecciona una ubicación de destino distinta del origen');
      destination=await get('SELECT id FROM ubicaciones WHERE codigo=?',[ubicacionDestino]);
      if(!destination)throw fail('Ubicación de destino no encontrada',404);
    }
    const worker=Number(personalId);
    if(tipo==='SALIDA'){
      if(!Number.isSafeInteger(worker)||worker<=0)throw fail('Selecciona el trabajador');
      const person=await get("SELECT id FROM personal WHERE id=? AND estado='ACTIVO'",[worker]);
      if(!person)throw fail('Trabajador no disponible');
    }
    let n=1,serial=null;
    if(p.tipo_control==='CANTIDAD'){
      n=Number(cantidad);
      if(!Number.isSafeInteger(n)||n<=0)throw fail('Cantidad debe ser entero positivo');
      if(tipo==='SALIDA')await stock.withdraw(p.id,u.id,n);
      else if(tipo==='ENTRADA')await stock.deposit(p.id,u.id,n);
      else {await stock.withdraw(p.id,u.id,n);await stock.deposit(p.id,destination.id,n);}
    }else if(p.tipo_control==='SERIE'){
      serial=String(numeroSerie||'').trim();
      if(!serial)throw fail('Indica el número de serie');
      if(tipo==='ENTRADA')await serialOps.receive(p.id,u.id,serial);
      else if(tipo==='SALIDA')await serialOps.withdraw(p.id,u.id,serial);
      else await serialOps.transfer(p.id,u.id,destination.id,serial);
    }else throw fail('Tipo de producto inválido');
    await run('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,ubicacion_destino_id,cantidad,numero_serie,personal_id) VALUES(?,?,?,?,?,?,?)',
      [tipo,p.id,u.id,destination?destination.id:null,n,serial,tipo==='SALIDA'?worker:null]);
    await stock.occupancy(u.id);
    if(destination)await stock.occupancy(destination.id);
    return {mensaje:'Movimiento registrado correctamente'};
   });
   res.json(result);
  }catch(e){
   if(e.status)res.status(e.status).json({mensaje:e.message});
   else{console.error('Movimiento:',e);res.status(500).json({mensaje:'Error al registrar movimiento'})}
  }
 });
};
