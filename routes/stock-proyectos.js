// Inventario asignado a proyectos. Operaciones transaccionales con conexión exclusiva.
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
module.exports = (app, db) => {
  const dbPath = path.join(__dirname, '..', 'database', 'bodega.db');
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS stock_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT, proyecto_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL, ubicacion_id INTEGER NOT NULL,
      cantidad REAL NOT NULL DEFAULT 0 CHECK(cantidad >= 0),
      UNIQUE(proyecto_id,producto_id,ubicacion_id))`);
    db.run(`CREATE TABLE IF NOT EXISTS transferencias_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT, proyecto_origen_id INTEGER NOT NULL,
      proyecto_destino_id INTEGER NOT NULL, producto_id INTEGER NOT NULL,
      ubicacion_id INTEGER NOT NULL, cantidad REAL NOT NULL CHECK(cantidad > 0),
      motivo TEXT NOT NULL, fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    // Protege asignaciones incluso frente a salidas de módulos anteriores.
    db.run(`CREATE TRIGGER IF NOT EXISTS stock_fisico_proteger_update
      BEFORE UPDATE OF cantidad,producto_id,ubicacion_id ON stock_cantidad
      WHEN (SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto
            WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id)
           > (SELECT COALESCE(SUM(cantidad),0) FROM stock_cantidad
              WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id
                AND rowid<>OLD.rowid)
             + CASE WHEN NEW.producto_id=OLD.producto_id
                       AND NEW.ubicacion_id=OLD.ubicacion_id THEN NEW.cantidad ELSE 0 END
      BEGIN SELECT RAISE(ABORT,'Salida compromete stock asignado a proyectos'); END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS stock_fisico_proteger_delete
      BEFORE DELETE ON stock_cantidad
      WHEN (SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto
            WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id)
           > (SELECT COALESCE(SUM(cantidad),0) FROM stock_cantidad
              WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id
                AND rowid<>OLD.rowid)
      BEGIN SELECT RAISE(ABORT,'Salida compromete stock asignado a proyectos'); END`);
    // Invariante global: el stock asignado no puede superar el físico.
    for (const accion of ['INSERT','UPDATE']) {
      db.run(`CREATE TRIGGER IF NOT EXISTS stock_proyecto_limite_${accion.toLowerCase()}
        BEFORE ${accion} ON stock_proyecto
        WHEN (
          SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto
          WHERE producto_id=NEW.producto_id AND ubicacion_id=NEW.ubicacion_id
          ${accion==='UPDATE'?'AND id<>OLD.id':''}
        ) + NEW.cantidad >
        (SELECT COALESCE(SUM(cantidad),0) FROM stock_cantidad
         WHERE producto_id=NEW.producto_id AND ubicacion_id=NEW.ubicacion_id)
        BEGIN SELECT RAISE(ABORT,'Asignación supera stock físico'); END`);
    }
  });
  const id = n => Number.isSafeInteger(Number(n)) && Number(n)>0 ? Number(n) : null;
  const qty = n => Number.isFinite(Number(n)) && Number(n)>0 && Number(n)<=1e9 ? Number(n) : null;
  const all = (sql,args=[]) => new Promise((resolve,reject)=>db.all(sql,args,(e,r)=>e?reject(e):resolve(r)));
  app.get('/api/stock-proyectos', async (req,res) => {
    try { res.json(await all(`SELECT s.*,p.codigo AS proyecto_codigo,p.nombre AS proyecto,
      pr.codigo AS producto_codigo,pr.nombre AS producto,u.codigo AS ubicacion
      FROM stock_proyecto s JOIN proyectos p ON p.id=s.proyecto_id
      JOIN productos pr ON pr.id=s.producto_id JOIN ubicaciones u ON u.id=s.ubicacion_id
      WHERE s.cantidad>0 ORDER BY p.nombre,pr.nombre,u.codigo`)); }
    catch(e){res.status(500).json({error:'Error al consultar stock por proyecto'});}
  });
  // Reporte de conciliación física versus asignación por proyecto.
  app.get('/api/stock-proyectos/conciliacion', async (req,res) => {
    try {
      res.json(await all(`SELECT pr.codigo AS producto, u.codigo AS ubicacion,
        COALESCE(f.fisico,0) AS fisico, COALESCE(a.asignado,0) AS asignado,
        COALESCE(f.fisico,0)-COALESCE(a.asignado,0) AS sin_asignar,
        CASE WHEN COALESCE(a.asignado,0)>COALESCE(f.fisico,0)
          THEN 'INCONSISTENTE' ELSE 'OK' END AS estado
        FROM (
          SELECT producto_id,ubicacion_id FROM stock_cantidad
          UNION SELECT producto_id,ubicacion_id FROM stock_proyecto
        ) k
        JOIN productos pr ON pr.id=k.producto_id
        JOIN ubicaciones u ON u.id=k.ubicacion_id
        LEFT JOIN (
          SELECT producto_id,ubicacion_id,SUM(cantidad) AS fisico
          FROM stock_cantidad GROUP BY producto_id,ubicacion_id
        ) f ON f.producto_id=k.producto_id AND f.ubicacion_id=k.ubicacion_id
        LEFT JOIN (
          SELECT producto_id,ubicacion_id,SUM(cantidad) AS asignado
          FROM stock_proyecto GROUP BY producto_id,ubicacion_id
        ) a ON a.producto_id=k.producto_id AND a.ubicacion_id=k.ubicacion_id
        WHERE pr.tipo_control='CANTIDAD'
        ORDER BY estado,pr.codigo,u.codigo`));
    } catch(e) { res.status(500).json({error:'No se pudo conciliar el inventario'}); }
  });
  app.get('/api/transferencias-proyectos', async (req,res) => {
    try {res.json(await all(`SELECT t.*,po.codigo AS origen,pd.codigo AS destino,pr.codigo AS producto,u.codigo AS ubicacion
      FROM transferencias_proyecto t JOIN proyectos po ON po.id=t.proyecto_origen_id
      JOIN proyectos pd ON pd.id=t.proyecto_destino_id JOIN productos pr ON pr.id=t.producto_id
      JOIN ubicaciones u ON u.id=t.ubicacion_id ORDER BY t.id DESC LIMIT 200`));}
    catch(e){res.status(500).json({error:'Error al consultar transferencias'});}
  });
  // Asignación inicial: mueve stock sin proyecto a stock de un proyecto, sin aumentar stock físico.
  app.post('/api/stock-proyectos/asignar', (req,res) => {
    const proyecto=id(req.body.proyecto_id), producto=id(req.body.producto_id), ubicacion=id(req.body.ubicacion_id), cantidad=qty(req.body.cantidad);
    if(!proyecto||!producto||!ubicacion||!cantidad) return res.status(400).json({error:'Datos inválidos'});
    transaction(async (run,get)=>{
      const p=await get('SELECT id FROM proyectos WHERE id=? AND estado=?',[proyecto,'ACTIVO']);
      const pr=await get('SELECT id,tipo_control FROM productos WHERE id=?',[producto]);
      const u=await get('SELECT id FROM ubicaciones WHERE id=?',[ubicacion]);
      if(!p||!pr||!u||pr.tipo_control!=='CANTIDAD') throw new Failure(400,'Proyecto, producto de cantidad o ubicación inválidos');
      const fisico=await get('SELECT COALESCE(SUM(cantidad),0) AS n FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=?',[producto,ubicacion]);
      const asignado=await get('SELECT COALESCE(SUM(cantidad),0) AS n FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?',[producto,ubicacion]);
      if(fisico.n-asignado.n+1e-8<cantidad) throw new Failure(409,'No hay stock físico sin asignar suficiente');
      await run(`INSERT INTO stock_proyecto(proyecto_id,producto_id,ubicacion_id,cantidad) VALUES(?,?,?,?)
        ON CONFLICT(proyecto_id,producto_id,ubicacion_id) DO UPDATE SET cantidad=cantidad+excluded.cantidad`,[proyecto,producto,ubicacion,cantidad]);
      return {ok:true};
    },res);
  });
  app.post('/api/transferencias-proyectos', (req,res) => {
    const origen=id(req.body.proyecto_origen_id), destino=id(req.body.proyecto_destino_id),producto=id(req.body.producto_id),ubicacion=id(req.body.ubicacion_id),cantidad=qty(req.body.cantidad),motivo=String(req.body.motivo||'').trim();
    if(!origen||!destino||origen===destino||!producto||!ubicacion||!cantidad||!motivo||motivo.length>500) return res.status(400).json({error:'Datos de transferencia inválidos'});
    transaction(async (run,get)=>{
      const projects=await get(`SELECT COUNT(*) AS n FROM proyectos WHERE id IN (?,?) AND estado='ACTIVO'`,[origen,destino]);
      if(projects.n!==2) throw new Failure(400,'Ambos proyectos deben estar activos');
      const result=await run(`UPDATE stock_proyecto SET cantidad=cantidad-? WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?`,[cantidad,origen,producto,ubicacion,cantidad]);
      if(!result.changes) throw new Failure(409,'Stock insuficiente en el proyecto origen');
      await run(`INSERT INTO stock_proyecto(proyecto_id,producto_id,ubicacion_id,cantidad) VALUES(?,?,?,?)
        ON CONFLICT(proyecto_id,producto_id,ubicacion_id) DO UPDATE SET cantidad=cantidad+excluded.cantidad`,[destino,producto,ubicacion,cantidad]);
      const saved=await run(`INSERT INTO transferencias_proyecto(proyecto_origen_id,proyecto_destino_id,producto_id,ubicacion_id,cantidad,motivo) VALUES(?,?,?,?,?,?)`,[origen,destino,producto,ubicacion,cantidad,motivo]);
      return {ok:true,id:saved.lastID};
    },res);
  });
  class Failure extends Error {constructor(status,message){super(message);this.status=status;}}
  function transaction(work,res){
    const cx=new sqlite3.Database(dbPath);
    cx.configure('busyTimeout',5000);
    const run=(sql,args=[])=>new Promise((resolve,reject)=>cx.run(sql,args,function(e){e?reject(e):resolve({changes:this.changes,lastID:this.lastID});}));
    const get=(sql,args=[])=>new Promise((resolve,reject)=>cx.get(sql,args,(e,r)=>e?reject(e):resolve(r)));
    (async()=>{
      let begun=false;
      try{await run('BEGIN IMMEDIATE');begun=true;const result=await work(run,get);await run('COMMIT');begun=false;res.json(result);}
      catch(e){if(begun)try{await run('ROLLBACK');}catch(_){}res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la operación'});}
      finally{cx.close();}
    })();
  }
};
