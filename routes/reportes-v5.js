"use strict";
module.exports = (app, db) => {
  const all = (sql, args=[]) => new Promise((resolve,reject)=>db.all(sql,args,(err,rows)=>err?reject(err):resolve(rows)));
  const get = (sql, args=[]) => new Promise((resolve,reject)=>db.get(sql,args,(err,row)=>err?reject(err):resolve(row)));
  const wrap = fn => async(req,res)=>{try{await fn(req,res)}catch(e){console.error('[Reportes V5]',e);res.status(500).json({mensaje:'Error al generar el reporte.'})}};
  app.get('/api/v5/resumen',wrap(async(req,res)=>{
    const [productos,ubicaciones,personal,solicitudes,unidades,series,pendientes,movimientos] = await Promise.all([
      get('SELECT COUNT(*) total FROM productos'),get('SELECT COUNT(*) total FROM ubicaciones'),
      get("SELECT COUNT(*) total FROM personal WHERE estado='ACTIVO'"),
      all('SELECT estado,COUNT(*) total FROM solicitudes GROUP BY estado'),
      get('SELECT COALESCE(SUM(CASE WHEN cantidad>0 THEN cantidad ELSE 0 END),0) total FROM stock_cantidad'),
      get("SELECT COUNT(*) total FROM productos_seriados WHERE estado='Disponible'"),
      get("SELECT COUNT(*) total FROM solicitudes WHERE estado!='ENTREGADA'"),
      get('SELECT COUNT(*) total FROM movimientos')
    ]);
    res.json({productos:productos.total,ubicaciones:ubicaciones.total,personal:personal.total,solicitudes,unidades:unidades.total,series:series.total,pendientes:pendientes.total,movimientos:movimientos.total});
  }));
  app.get('/api/v5/inventario',wrap(async(req,res)=>{
    const filas=await all(`SELECT p.codigo,p.nombre,p.tipo_control,u.codigo AS ubicacion,
      CASE WHEN p.tipo_control='SERIE' THEN
        (SELECT COUNT(*) FROM productos_seriados ps WHERE ps.producto_id=p.id AND ps.ubicacion_id=u.id AND ps.estado='Disponible')
      ELSE COALESCE((SELECT SUM(sc.cantidad) FROM stock_cantidad sc WHERE sc.producto_id=p.id AND sc.ubicacion_id=u.id),0) END AS disponible
      FROM productos p CROSS JOIN ubicaciones u
      WHERE (p.tipo_control='SERIE' AND EXISTS(SELECT 1 FROM productos_seriados ps WHERE ps.producto_id=p.id AND ps.ubicacion_id=u.id AND ps.estado='Disponible'))
      OR (p.tipo_control!='SERIE' AND EXISTS(SELECT 1 FROM stock_cantidad sc WHERE sc.producto_id=p.id AND sc.ubicacion_id=u.id AND sc.cantidad>0))
      ORDER BY p.nombre,u.codigo`);
    res.json(filas);
  }));
  // Conciliación por ubicación: físico, reservado por proyecto y libre.
  // Las series se cuentan por unidad y su reserva proviene de series_proyecto.
  app.get('/api/v5/inventario-libre',wrap(async(req,res)=>{
    const filas=await all(`WITH
      fisico_cantidad AS (
        SELECT producto_id,ubicacion_id,SUM(cantidad) AS fisico
        FROM stock_cantidad GROUP BY producto_id,ubicacion_id
      ),
      reservado_cantidad AS (
        SELECT producto_id,ubicacion_id,SUM(cantidad) AS reservado
        FROM stock_proyecto GROUP BY producto_id,ubicacion_id
      ),
      llaves_cantidad AS (
        SELECT producto_id,ubicacion_id FROM fisico_cantidad
        UNION SELECT producto_id,ubicacion_id FROM reservado_cantidad
      ),
      series AS (
        SELECT ps.producto_id,ps.ubicacion_id,
          COUNT(*) AS fisico,
          SUM(CASE WHEN sp.serie_id IS NOT NULL THEN 1 ELSE 0 END) AS reservado
        FROM productos_seriados ps
        LEFT JOIN series_proyecto sp ON sp.serie_id=ps.id
        WHERE ps.ubicacion_id IS NOT NULL AND ps.estado='Disponible'
        GROUP BY ps.producto_id,ps.ubicacion_id
      ),
      saldos AS (
        SELECT k.producto_id,k.ubicacion_id,
          COALESCE(f.fisico,0) AS fisico,COALESCE(r.reservado,0) AS reservado
        FROM llaves_cantidad k
        LEFT JOIN fisico_cantidad f ON f.producto_id=k.producto_id AND f.ubicacion_id=k.ubicacion_id
        LEFT JOIN reservado_cantidad r ON r.producto_id=k.producto_id AND r.ubicacion_id=k.ubicacion_id
        UNION ALL
        SELECT producto_id,ubicacion_id,fisico,reservado FROM series
      )
      SELECT p.codigo,p.nombre,p.tipo_control,u.codigo AS ubicacion,
        s.fisico,s.reservado,s.fisico-s.reservado AS libre,
        CASE WHEN s.reservado>s.fisico OR s.fisico<0 OR s.reservado<0
          THEN 'INCONSISTENTE' ELSE 'OK' END AS estado
      FROM saldos s JOIN productos p ON p.id=s.producto_id
      JOIN ubicaciones u ON u.id=s.ubicacion_id
      ORDER BY estado,p.nombre,u.codigo`);
    res.json(filas);
  }));
  app.get('/api/v5/alertas',wrap(async(req,res)=>{
    const [negativos,duplicados,solicitudes]=await Promise.all([
      all('SELECT p.codigo,p.nombre,u.codigo AS ubicacion,s.cantidad FROM stock_cantidad s JOIN productos p ON p.id=s.producto_id LEFT JOIN ubicaciones u ON u.id=s.ubicacion_id WHERE s.cantidad<0'),
      all('SELECT p.codigo,u.codigo AS ubicacion,COUNT(*) registros FROM stock_cantidad s JOIN productos p ON p.id=s.producto_id LEFT JOIN ubicaciones u ON u.id=s.ubicacion_id GROUP BY s.producto_id,s.ubicacion_id HAVING COUNT(*)>1'),
      all("SELECT id,estado,fecha_solicitud FROM solicitudes WHERE estado!='ENTREGADA' ORDER BY id DESC LIMIT 50")
    ]);
    res.json({negativos,duplicados,solicitudes});
  }));
};
