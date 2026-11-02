'use strict';
// Auditoría de inconsistencias; nunca altera existencias.
module.exports = (app, db) => {
  const all = (sql, args = []) => new Promise((resolve, reject) =>
    db.all(sql, args, (err, rows) => err ? reject(err) : resolve(rows)));
  // Historial de una serie bajo demanda; no modifica registros.
  app.get('/api/admin/auditoria-inventario/historial-serie', async (req, res) => {
    if (!['ADMIN','BODEGA'].includes(req.usuario?.rol))
      return res.status(403).json({error:'Acceso restringido'});
    const serie = req.query?.serie;
    if (typeof serie !== 'string' || !serie.trim() || serie.length > 150)
      return res.status(400).json({error:'Número de serie inválido'});
    try {
      const herramientas = await all(`
        SELECT ps.id, ps.numero_serie, ps.estado, p.codigo AS producto,
          u.codigo AS ubicacion
        FROM productos_seriados ps
        LEFT JOIN productos p ON p.id=ps.producto_id
        LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
        WHERE ps.numero_serie=? LIMIT 1`,[serie]);
      if (!herramientas.length) return res.status(404).json({error:'Serie no encontrada'});
      const herramienta=herramientas[0];
      const movimientos=await all(`
        SELECT m.id,m.tipo_movimiento,m.fecha_movimiento,m.cantidad,
          m.personal_id, u.codigo AS ubicacion
        FROM movimientos m
        LEFT JOIN ubicaciones u ON u.id=m.ubicacion_id
        JOIN productos_seriados ps ON ps.producto_id=m.producto_id
          AND ps.numero_serie=m.numero_serie
        WHERE ps.id=?
        ORDER BY m.id DESC LIMIT 100`,[herramienta.id]);
      const entregas=await all(`
        SELECT e.id,e.proyecto_id,e.personal_id,e.fecha_entrega,
          e.fecha_devolucion
        FROM entregas_series_proyecto e
        WHERE e.serie_id=? ORDER BY e.id DESC LIMIT 100`,[herramienta.id]);
      // Cronología unificada: las fechas SQLite sin zona se interpretan como UTC.
      // Se conserva también el historial original para las tablas de detalle.
      const eventos = [
        ...movimientos.map(m => ({tipo:'MOVIMIENTO',id:m.id,fecha:m.fecha_movimiento,
          descripcion:m.tipo_movimiento,personal_id:m.personal_id,ubicacion:m.ubicacion})),
        ...entregas.flatMap(e => [
          {tipo:'ENTREGA',id:e.id,fecha:e.fecha_entrega,
            descripcion:'Entrega a proyecto '+e.proyecto_id,personal_id:e.personal_id},
          ...(e.fecha_devolucion ? [{tipo:'DEVOLUCION_PROYECTO',id:e.id,
            fecha:e.fecha_devolucion,descripcion:'Devolución de proyecto '+e.proyecto_id,
            personal_id:e.personal_id}] : [])
        ])
      ].filter(e => e.fecha).sort((a,b) => {
        const fecha = valor => {
          const texto=String(valor).trim();
          const normalizado=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(texto)
            ? texto.replace(' ','T')+'Z' : texto;
          const ms=Date.parse(normalizado);
          return Number.isFinite(ms)?ms:0;
        };
        return fecha(b.fecha)-fecha(a.fecha) || b.id-a.id;
      });
      res.json({herramienta,movimientos,entregas,eventos,limite_por_historial:100});
    } catch(err) {
      console.error('Historial auditoría:',err);
      res.status(500).json({error:'No se pudo consultar el historial de la serie'});
    }
  });
  app.get('/api/admin/auditoria-inventario', async (req, res) => {
    if (req.usuario?.rol !== 'ADMIN' && req.usuario?.rol !== 'BODEGA')
      return res.status(403).json({error: 'Acceso restringido a administración de bodega'});
    try {
      const cantidades = await all(`
        WITH fisico AS (
          SELECT producto_id, ubicacion_id, SUM(cantidad) AS unidades
          FROM stock_cantidad GROUP BY producto_id, ubicacion_id
        ), reservado AS (
          SELECT producto_id, ubicacion_id, SUM(cantidad) AS unidades
          FROM stock_proyecto GROUP BY producto_id, ubicacion_id
        ), llaves AS (
          SELECT producto_id, ubicacion_id FROM fisico
          UNION SELECT producto_id, ubicacion_id FROM reservado
        )
        SELECT p.codigo AS producto, u.codigo AS ubicacion,
          COALESCE(f.unidades,0) AS fisico, COALESCE(r.unidades,0) AS reservado,
          COALESCE(f.unidades,0)-COALESCE(r.unidades,0) AS libre
        FROM llaves k
        LEFT JOIN fisico f ON f.producto_id=k.producto_id AND f.ubicacion_id=k.ubicacion_id
        LEFT JOIN reservado r ON r.producto_id=k.producto_id AND r.ubicacion_id=k.ubicacion_id
        LEFT JOIN productos p ON p.id=k.producto_id
        LEFT JOIN ubicaciones u ON u.id=k.ubicacion_id
        WHERE COALESCE(f.unidades,0)<0 OR COALESCE(r.unidades,0)<0
           OR COALESCE(r.unidades,0)>COALESCE(f.unidades,0)
           OR p.id IS NULL OR u.id IS NULL
        ORDER BY p.codigo,u.codigo LIMIT 500`);
      const series = await all(`
        SELECT ps.numero_serie, ps.estado, u.codigo AS ubicacion_codigo,
          CASE
            WHEN ps.estado='Disponible' AND ps.ubicacion_id IS NULL THEN 'Disponible sin ubicación'
            WHEN ps.estado='SALIDA' AND ps.ubicacion_id IS NOT NULL THEN 'Salida con ubicación activa'
            WHEN sp.serie_id IS NOT NULL AND ps.ubicacion_id IS NULL THEN 'Serie de proyecto sin ubicación'
            ELSE 'Referencia inválida'
          END AS problema
        FROM productos_seriados ps
        LEFT JOIN series_proyecto sp ON sp.serie_id=ps.id
        LEFT JOIN productos p ON p.id=ps.producto_id
        LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
        WHERE (ps.estado='Disponible' AND ps.ubicacion_id IS NULL)
           OR (ps.estado='SALIDA' AND ps.ubicacion_id IS NOT NULL)
           OR (sp.serie_id IS NOT NULL AND ps.ubicacion_id IS NULL)
           OR p.id IS NULL
           OR (ps.ubicacion_id IS NOT NULL AND u.id IS NULL)
        ORDER BY ps.numero_serie LIMIT 500`);
      const entregasSeries = await all(`
        SELECT ps.numero_serie, e.id AS entrega_id, e.proyecto_id,
          e.personal_id, ps.estado, ps.ubicacion_id, u.codigo AS ubicacion_codigo,
          CASE
            WHEN ps.id IS NULL THEN 'Entrega abierta sin serie existente'
            WHEN (SELECT COUNT(*) FROM entregas_series_proyecto otras
                  WHERE otras.serie_id=e.serie_id AND otras.fecha_devolucion IS NULL)>1
              THEN 'Más de una entrega abierta para la misma serie'
            WHEN ps.estado!='SALIDA' THEN 'Entrega abierta con serie no marcada como SALIDA'
            WHEN ps.ubicacion_id IS NOT NULL THEN 'Entrega abierta con ubicación de stock'
            WHEN sp.serie_id IS NOT NULL THEN 'Serie entregada y simultáneamente reservada'
            ELSE 'Inconsistencia no clasificada'
          END AS problema
        FROM entregas_series_proyecto e
        LEFT JOIN productos_seriados ps ON ps.id=e.serie_id
        LEFT JOIN series_proyecto sp ON sp.serie_id=e.serie_id
        LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
        WHERE e.fecha_devolucion IS NULL AND (
          ps.id IS NULL OR ps.estado!='SALIDA' OR ps.ubicacion_id IS NOT NULL
          OR sp.serie_id IS NOT NULL
          OR (SELECT COUNT(*) FROM entregas_series_proyecto otras
              WHERE otras.serie_id=e.serie_id AND otras.fecha_devolucion IS NULL)>1)
        ORDER BY e.id DESC LIMIT 500`);
      // Contrasta el último movimiento registrado con el estado actual.
      // Una entrega de proyecto abierta tiene prioridad sobre el movimiento manual.
      const trazabilidadSeries = await all(`
        SELECT ps.numero_serie, ps.estado, m.tipo_movimiento AS ultimo_movimiento,
          m.fecha_movimiento, u.codigo AS ubicacion_codigo,
          CASE
            WHEN EXISTS (SELECT 1 FROM entregas_series_proyecto ep WHERE ep.serie_id=ps.id)
              THEN 'Con historial de proyecto'
            WHEN m.personal_id IS NOT NULL THEN 'Salida a trabajador'
            ELSE 'Movimiento de bodega'
          END AS origen_movimiento,
          CASE
            WHEN m.tipo_movimiento='SALIDA' AND ps.estado='Disponible'
              THEN 'Último movimiento SALIDA, pero serie disponible'
            WHEN m.tipo_movimiento IN ('ENTRADA','DEVOLUCION','TRASLADO_ENTRADA')
              AND ps.estado='SALIDA'
              THEN 'Último movimiento de ingreso, pero serie en SALIDA'
          END AS problema
        FROM productos_seriados ps
        JOIN movimientos m ON m.id=(
          SELECT MAX(m2.id) FROM movimientos m2
          WHERE m2.producto_id=ps.producto_id
            AND m2.numero_serie=ps.numero_serie
            AND m2.tipo_movimiento IN ('SALIDA','ENTRADA','DEVOLUCION','TRASLADO_ENTRADA')
        )
        LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
        WHERE NOT EXISTS (
          SELECT 1 FROM entregas_series_proyecto e
          WHERE e.serie_id=ps.id AND e.fecha_devolucion IS NULL
        ) AND (
          (m.tipo_movimiento='SALIDA' AND ps.estado='Disponible')
          OR (m.tipo_movimiento IN ('ENTRADA','DEVOLUCION','TRASLADO_ENTRADA')
              AND ps.estado='SALIDA')
        )
        ORDER BY m.id DESC LIMIT 500`);
      // Casos que requieren revisión humana: existe devolución histórica,
      // no hay entrega abierta y la serie aún figura en SALIDA.
      // No se presume error: pudo existir una salida manual posterior.
      const devolucionesPorRevisar = await all(`
        SELECT ps.numero_serie, ps.estado,
          e.id AS ultima_entrega_id, e.proyecto_id, e.personal_id,
          e.fecha_devolucion, u.codigo AS ubicacion_codigo,
          'Devolución registrada, serie aún en SALIDA; verificar movimientos posteriores' AS problema
        FROM productos_seriados ps
        JOIN entregas_series_proyecto e ON e.id=(
          SELECT MAX(e2.id) FROM entregas_series_proyecto e2
          WHERE e2.serie_id=ps.id AND e2.fecha_devolucion IS NOT NULL
        )
        LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
        WHERE ps.estado='SALIDA'
          AND NOT EXISTS (
            SELECT 1 FROM entregas_series_proyecto abierta
            WHERE abierta.serie_id=ps.id AND abierta.fecha_devolucion IS NULL
          )
        ORDER BY e.id DESC LIMIT 500`);
      res.json({generado_en: new Date().toISOString(),
        resumen: {inconsistencias_cantidad: cantidades.length, inconsistencias_series: series.length, inconsistencias_entregas_series: entregasSeries.length, inconsistencias_trazabilidad: trazabilidadSeries.length, devoluciones_por_revisar: devolucionesPorRevisar.length},
        cantidades, series, entregasSeries, trazabilidadSeries, devolucionesPorRevisar, limite_por_categoria: 500,
        advertencia: 'Auditoría de solo lectura; los resultados se limitan a 500 por categoría'});
    } catch (err) {
      console.error('Auditoría de inventario:', err);
      res.status(500).json({error:'No se pudo completar la auditoría'});
    }
  });
};
