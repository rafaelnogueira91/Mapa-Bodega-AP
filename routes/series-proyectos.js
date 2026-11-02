'use strict';
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
module.exports = (app, db) => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS series_proyecto (
      serie_id INTEGER PRIMARY KEY REFERENCES productos_seriados(id),
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
      fecha_asignacion TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS entregas_series_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serie_id INTEGER NOT NULL REFERENCES productos_seriados(id),
      solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id),
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
      personal_id INTEGER NOT NULL REFERENCES personal(id),
      ubicacion_origen_id INTEGER NOT NULL REFERENCES ubicaciones(id),
      usuario_id INTEGER,
      fecha_entrega TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fecha_devolucion TEXT,
      ubicacion_devolucion_id INTEGER REFERENCES ubicaciones(id))`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_serie_entrega_abierta
      ON entregas_series_proyecto(serie_id) WHERE fecha_devolucion IS NULL`);
    db.run(`CREATE TABLE IF NOT EXISTS historial_series_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serie_id INTEGER NOT NULL, proyecto_origen_id INTEGER,
      proyecto_destino_id INTEGER, accion TEXT NOT NULL,
      usuario_id INTEGER, motivo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TRIGGER IF NOT EXISTS series_asignadas_no_salen
      BEFORE UPDATE OF ubicacion_id, producto_id ON productos_seriados
      WHEN EXISTS(SELECT 1 FROM series_proyecto WHERE serie_id=OLD.id)
      AND (NEW.ubicacion_id IS NOT OLD.ubicacion_id OR NEW.producto_id IS NOT OLD.producto_id)
      BEGIN SELECT RAISE(ABORT,'Serie asignada a proyecto: liberar antes de mover'); END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS series_asignadas_no_eliminar
      BEFORE DELETE ON productos_seriados
      WHEN EXISTS(SELECT 1 FROM series_proyecto WHERE serie_id=OLD.id)
      BEGIN SELECT RAISE(ABORT,'Serie asignada a proyecto: liberar antes de eliminar'); END`);
  });
  const validId = x => Number.isSafeInteger(Number(x)) && Number(x)>0 ? Number(x) : null;
  const dbPath=path.join(__dirname,'..','database','bodega.db');
  const list=(sql,args=[])=>new Promise((resolve,reject)=>db.all(sql,args,(e,r)=>e?reject(e):resolve(r)));
  app.get('/api/series-proyectos',async(req,res)=>{
    try{res.json(await list(`SELECT ps.id AS serie_id,ps.numero_serie,pr.codigo AS producto,
      u.codigo AS ubicacion,p.codigo AS proyecto,sp.proyecto_id
      FROM productos_seriados ps JOIN productos pr ON pr.id=ps.producto_id
      LEFT JOIN ubicaciones u ON u.id=ps.ubicacion_id
      LEFT JOIN series_proyecto sp ON sp.serie_id=ps.id
      LEFT JOIN proyectos p ON p.id=sp.proyecto_id
      ORDER BY ps.numero_serie LIMIT 1000`));}
    catch(e){res.status(500).json({error:'No se pudieron consultar las series'});}
  });
  app.get('/api/series-proyectos/historial',async(req,res)=>{
    try{res.json(await list(`SELECT h.*,s.numero_serie,po.codigo AS origen,pd.codigo AS destino
      FROM historial_series_proyecto h JOIN productos_seriados s ON s.id=h.serie_id
      LEFT JOIN proyectos po ON po.id=h.proyecto_origen_id
      LEFT JOIN proyectos pd ON pd.id=h.proyecto_destino_id
      ORDER BY h.id DESC LIMIT 200`));}
    catch(e){res.status(500).json({error:'No se pudo consultar el historial'});}
  });
  app.get('/api/series-proyectos/entregas',async(req,res)=>{
    try { res.json(await list(`SELECT e.id,e.serie_id,s.numero_serie,p.codigo AS proyecto,
      per.nombre AS trabajador,e.fecha_entrega,e.fecha_devolucion,u.codigo AS ubicacion_origen,ud.codigo AS ubicacion_devolucion
      FROM entregas_series_proyecto e
      JOIN productos_seriados s ON s.id=e.serie_id
      JOIN proyectos p ON p.id=e.proyecto_id
      JOIN personal per ON per.id=e.personal_id
      JOIN ubicaciones u ON u.id=e.ubicacion_origen_id
      LEFT JOIN ubicaciones ud ON ud.id=e.ubicacion_devolucion_id
      ORDER BY e.id DESC LIMIT 500`)); }
    catch(e){res.status(500).json({error:'No se pudo consultar entregas'});}
  });
  // Exportación paginada de todas las entregas pendientes: cursor estable por ID.
  // No altera el límite de 500 utilizado por la pantalla de consulta.
  app.get('/api/series-proyectos/pendientes-exportacion',async(req,res)=>{
    if(!['ADMIN','BODEGA'].includes(req.usuario?.rol))return res.status(403).json({error:'Sin permisos'});
    const cursorTexto=String(req.query.cursor??'0');
    if(!/^(0|[1-9][0-9]*)$/.test(cursorTexto))return res.status(400).json({error:'Cursor inválido'});
    const cursor=Number(cursorTexto);
    if(!Number.isSafeInteger(cursor)||cursor<0)return res.status(400).json({error:'Cursor inválido'});
    try {
      const registros=await list(`SELECT e.id,e.serie_id,s.numero_serie,p.codigo AS proyecto,
        per.nombre AS trabajador,e.fecha_entrega,e.fecha_devolucion,
        u.codigo AS ubicacion_origen,ud.codigo AS ubicacion_devolucion
        FROM entregas_series_proyecto e
        JOIN productos_seriados s ON s.id=e.serie_id
        JOIN proyectos p ON p.id=e.proyecto_id
        JOIN personal per ON per.id=e.personal_id
        JOIN ubicaciones u ON u.id=e.ubicacion_origen_id
        LEFT JOIN ubicaciones ud ON ud.id=e.ubicacion_devolucion_id
        WHERE e.fecha_devolucion IS NULL AND e.id>? ORDER BY e.id ASC LIMIT 1000`,[cursor]);
      res.json({registros,siguienteCursor:registros.length===1000?registros[registros.length-1].id:null});
    } catch(e){res.status(500).json({error:'No se pudo consultar las herramientas pendientes para exportación'});}
  });
  app.post('/api/series-proyectos/mover',(req,res)=>{
    if(!['ADMIN','BODEGA'].includes(req.usuario?.rol))return res.status(403).json({error:'Sin permisos'});
    const serie=validId(req.body?.serie_id), destino=req.body?.proyecto_destino_id ? validId(req.body.proyecto_destino_id):null;
    const motivo=String(req.body?.motivo||'').trim();
    if(!serie || (req.body?.proyecto_destino_id && !destino) || !motivo || motivo.length>500)
      return res.status(400).json({error:'Serie, destino o motivo inválidos'});
    const cx=new sqlite3.Database(dbPath);
    cx.configure('busyTimeout',5000);
    const run=(sql,args=[])=>new Promise((resolve,reject)=>cx.run(sql,args,function(e){e?reject(e):resolve(this)}));
    const get=(sql,args=[])=>new Promise((resolve,reject)=>cx.get(sql,args,(e,r)=>e?reject(e):resolve(r)));
    (async()=>{
      let begun=false;
      try{
        await run('BEGIN IMMEDIATE');begun=true;
        const item=await get(`SELECT s.id,s.ubicacion_id,s.estado,p.tipo_control FROM productos_seriados s
          JOIN productos p ON p.id=s.producto_id WHERE s.id=?`,[serie]);
        if(!item || item.tipo_control!=='SERIE' || !item.ubicacion_id || item.estado!=='Disponible')
          throw Object.assign(new Error('La serie no está disponible en una ubicación'),{status:409});
        const entregada=await get('SELECT id FROM entregas_series_proyecto WHERE serie_id=? AND fecha_devolucion IS NULL',[serie]);
        if(entregada)throw Object.assign(new Error('La herramienta está entregada a un trabajador; registra su devolución antes de cambiar de proyecto'),{status:409});
        const current=await get('SELECT proyecto_id FROM series_proyecto WHERE serie_id=?',[serie]);
        const origen=current?.proyecto_id||null;
        if(origen===destino)throw Object.assign(new Error('La asignación no cambia'),{status:409});
        if(destino){
          const project=await get("SELECT id FROM proyectos WHERE id=? AND estado='ACTIVO'",[destino]);
          if(!project)throw Object.assign(new Error('El proyecto destino no está activo'),{status:400});
          await run(`INSERT INTO series_proyecto(serie_id,proyecto_id) VALUES(?,?)
            ON CONFLICT(serie_id) DO UPDATE SET proyecto_id=excluded.proyecto_id,fecha_asignacion=CURRENT_TIMESTAMP`,[serie,destino]);
        }else{
          if(!origen)throw Object.assign(new Error('La serie ya está libre'),{status:409});
          await run('DELETE FROM series_proyecto WHERE serie_id=?',[serie]);
        }
        const accion=origen?(destino?'TRANSFERENCIA':'LIBERACION'):'ASIGNACION';
        await run(`INSERT INTO historial_series_proyecto
          (serie_id,proyecto_origen_id,proyecto_destino_id,accion,usuario_id,motivo)
          VALUES(?,?,?,?,?,?)`,[serie,origen,destino,accion,req.usuario.id,motivo]);
        await run('COMMIT');begun=false;
        res.json({ok:true,accion,serie_id:serie,proyecto_origen_id:origen,proyecto_destino_id:destino});
      }catch(e){if(begun)try{await run('ROLLBACK');}catch(_){}res.status(e.status||500).json({error:e.status?e.message:'No se pudo actualizar la asignación'});}
      finally{cx.close();}
    })();
  });
};
