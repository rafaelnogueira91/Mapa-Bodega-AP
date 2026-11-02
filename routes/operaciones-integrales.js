"use strict";
// Módulo adicional: movimientos operativos validados.
module.exports = (app, db) => {
  const all = (sql, params=[]) => new Promise((resolve,reject)=>db.all(sql,params,(e,r)=>e?reject(e):resolve(r)));
  const get = (sql, params=[]) => new Promise((resolve,reject)=>db.get(sql,params,(e,r)=>e?reject(e):resolve(r)));
  const run = (sql, params=[]) => new Promise((resolve,reject)=>db.run(sql,params,function(e){e?reject(e):resolve({changes:this.changes,lastID:this.lastID})}));
  const fail=(message,status=400)=>Object.assign(new Error(message),{status});
  const locked = work => require('./transaction-lock')(db, work);
  const stock = require('./stock-operations')(db);
  const serialOps = require('./serie-operations')(db);
  const safe=(fn)=>(req,res)=>Promise.resolve().then(()=>fn(req,res)).catch(e=>{
    console.error('[Operaciones]',e.message);
    if(!res.headersSent)res.status(e.status||500).json({mensaje:e.status?e.message:'No fue posible completar la operación.'});
  });
  const int=(v)=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
  const location=async(id)=>{
    const u=await get('SELECT * FROM ubicaciones WHERE id=?',[id]);
    if(!u)throw fail('Ubicación inexistente.'); return u;
  };
  const product=async(id)=>{
    const p=await get('SELECT * FROM productos WHERE id=?',[id]);
    if(!p)throw fail('Producto inexistente.'); return p;
  };
  const updateOccupancy = stock.occupancy;
  // Listados que alimentan las pantallas y reportes.
  app.get('/api/integral/catalogos',safe(async(req,res)=>{
    const [productos,ubicaciones,personal]=await Promise.all([
      all('SELECT id,codigo,nombre,tipo_control FROM productos ORDER BY nombre'),
      all('SELECT id,codigo FROM ubicaciones ORDER BY codigo'),
      all("SELECT id,nombre,cargo FROM personal WHERE estado='ACTIVO' AND cargo IN ('TECNICO','ASISTENTE') ORDER BY nombre")
    ]);res.json({productos,ubicaciones,personal});
  }));
  app.get('/api/integral/disponibilidad',safe(async(req,res)=>{
    const productoId=int(req.query.productoId),ubicacionId=int(req.query.ubicacionId);
    if(!productoId||!ubicacionId)throw fail('Selecciona producto y ubicación.');
    const p=await product(productoId);
    if(p.tipo_control==='SERIE'){
      const series=await all(`SELECT numero_serie FROM productos_seriados ps
        WHERE producto_id=? AND ubicacion_id=? AND estado='Disponible'
          AND NOT EXISTS(SELECT 1 FROM series_proyecto sp WHERE sp.serie_id=ps.id)
        ORDER BY numero_serie`,[productoId,ubicacionId]);
      return res.json({tipo:'SERIE',cantidad:series.length,series:series.map(x=>x.numero_serie)});
    }
    const stock=await get('SELECT COALESCE(SUM(cantidad),0) AS cantidad FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=?',[productoId,ubicacionId]);
    const reservado=await get('SELECT COALESCE(SUM(cantidad),0) AS cantidad FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?',[productoId,ubicacionId]);
    res.json({tipo:'CANTIDAD',cantidad:Math.max(0,stock.cantidad-reservado.cantidad),series:[]});
  }));
  app.post('/api/integral/traslados',safe(async(req,res)=>{
    const productoId=int(req.body.productoId),origenId=int(req.body.origenId),destinoId=int(req.body.destinoId);
    const cantidad=int(req.body.cantidad),serie=String(req.body.numeroSerie||'').trim();
    if(!productoId||!origenId||!destinoId||origenId===destinoId)throw fail('Selecciona producto y ubicaciones distintas.');
    const result=await locked(async()=>{
      const p=await product(productoId);await location(origenId);await location(destinoId);
      if(p.tipo_control==='SERIE'){
        if(!serie)throw fail('Selecciona un número de serie.');
        await serialOps.transfer(productoId,origenId,destinoId,serie);
      } else {
        if(!cantidad)throw fail('Ingresa una cantidad positiva.');
        await stock.withdraw(productoId,origenId,cantidad);
        await stock.deposit(productoId,destinoId,cantidad);
      }
      await run('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad,numero_serie) VALUES(?,?,?,?,?)',['TRASLADO_SALIDA',productoId,origenId,p.tipo_control==='SERIE'?1:cantidad,serie||null]);
      await run('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad,numero_serie) VALUES(?,?,?,?,?)',['TRASLADO_ENTRADA',productoId,destinoId,p.tipo_control==='SERIE'?1:cantidad,serie||null]);
      await updateOccupancy(origenId);await updateOccupancy(destinoId);
      return {mensaje:'Traslado registrado correctamente.'};
    });res.json(result);
  }));
  app.post('/api/integral/devoluciones',safe(async(req,res)=>{
    const productoId=int(req.body.productoId),ubicacionId=int(req.body.ubicacionId),personalId=int(req.body.personalId);
    const cantidad=int(req.body.cantidad),serie=String(req.body.numeroSerie||'').trim();
    if(!productoId||!ubicacionId||!personalId)throw fail('Completa producto, trabajador y ubicación.');
    const result=await locked(async()=>{
      const p=await product(productoId);await location(ubicacionId);
      const persona=await get("SELECT id FROM personal WHERE id=? AND cargo IN ('TECNICO','ASISTENTE')",[personalId]);
      if(!persona)throw fail('Trabajador no válido.');
      if(p.tipo_control==='SERIE'){
        if(!serie)throw fail('Selecciona un número de serie.');
        await serialOps.returnToStock(productoId,ubicacionId,serie,personalId);
      }else{
        if(!cantidad)throw fail('Ingresa una cantidad positiva.');
        const balance=await get("SELECT COALESCE(SUM(CASE WHEN tipo_movimiento='SALIDA' THEN COALESCE(cantidad,0) WHEN tipo_movimiento='DEVOLUCION' THEN -COALESCE(cantidad,0) ELSE 0 END),0) AS saldo FROM movimientos WHERE producto_id=? AND personal_id=?",[productoId,personalId]);
        if(balance.saldo<cantidad)throw fail('La devolución supera las unidades registradas como entregadas a este trabajador.');
        await stock.deposit(productoId,ubicacionId,cantidad);
      }
      await run('INSERT INTO movimientos(tipo_movimiento,producto_id,ubicacion_id,cantidad,numero_serie,personal_id) VALUES(?,?,?,?,?,?)',['DEVOLUCION',productoId,ubicacionId,p.tipo_control==='SERIE'?1:cantidad,serie||null,personalId]);
      await updateOccupancy(ubicacionId);
      return {mensaje:'Devolución registrada correctamente.'};
    });res.json(result);
  }));
  app.get('/api/integral/historial',safe(async(req,res)=>{
    const personalId=int(req.query.personalId);
    const params=personalId?[personalId]:[];
    const filtro=personalId?'WHERE m.personal_id=?':'';
    const movimientos=await all(`SELECT m.id,m.tipo_movimiento,m.cantidad,m.numero_serie,m.fecha_movimiento,p.codigo,p.nombre,p.tipo_control,u.codigo AS ubicacion,per.nombre AS trabajador FROM movimientos m JOIN productos p ON p.id=m.producto_id LEFT JOIN ubicaciones u ON u.id=m.ubicacion_id LEFT JOIN personal per ON per.id=m.personal_id ${filtro} ORDER BY m.id DESC LIMIT 1000`,params);
    res.json(movimientos);
  }));
  app.get('/api/integral/asignaciones',safe(async(req,res)=>{
    const personalId=int(req.query.personalId);if(!personalId)throw fail('Selecciona un trabajador.');
    const cantidades=await all(`SELECT p.codigo,p.nombre,SUM(CASE WHEN m.tipo_movimiento='SALIDA' THEN COALESCE(m.cantidad,0) WHEN m.tipo_movimiento='DEVOLUCION' THEN -COALESCE(m.cantidad,0) ELSE 0 END) AS pendiente FROM movimientos m JOIN productos p ON p.id=m.producto_id WHERE m.personal_id=? AND p.tipo_control='CANTIDAD' GROUP BY p.id HAVING pendiente>0`,[personalId]);
    const series=await all(`SELECT p.codigo,p.nombre,s.numero_serie FROM productos_seriados s JOIN productos p ON p.id=s.producto_id WHERE s.estado='SALIDA' AND (SELECT m.personal_id FROM movimientos m WHERE m.producto_id=s.producto_id AND m.numero_serie=s.numero_serie AND m.tipo_movimiento IN ('SALIDA','DEVOLUCION') ORDER BY m.id DESC LIMIT 1)=?`,[personalId]);
    res.json({cantidades,series});
  }));
};
