// Operaciones de inventario por proyecto: cada movimiento actualiza stock físico y asignado.
// SQLite BEGIN IMMEDIATE serializa las escrituras concurrentes.
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database', 'bodega.db');
module.exports = (app, db) => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS movimientos_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL CHECK(tipo IN ('ENTRADA','SALIDA')),
      proyecto_id INTEGER NOT NULL, producto_id INTEGER NOT NULL, ubicacion_id INTEGER NOT NULL,
      cantidad REAL NOT NULL CHECK(cantidad>0), motivo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    // Impide que rutas antiguas reduzcan el stock físico por debajo de lo reservado a proyectos.
    db.run(`CREATE TRIGGER IF NOT EXISTS proteger_stock_asignado_update
      BEFORE UPDATE OF cantidad ON stock_cantidad
      WHEN NEW.cantidad < (SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto
        WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id)
      BEGIN SELECT RAISE(ABORT,'Stock fisico inferior al asignado a proyectos'); END`);
    db.run(`CREATE TRIGGER IF NOT EXISTS proteger_stock_asignado_delete
      BEFORE DELETE ON stock_cantidad
      WHEN (SELECT COALESCE(SUM(cantidad),0) FROM stock_proyecto
        WHERE producto_id=OLD.producto_id AND ubicacion_id=OLD.ubicacion_id)>0
      BEGIN SELECT RAISE(ABORT,'No se puede borrar stock asignado a proyectos'); END`);
  });
  const integer = v => Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v):null;
  const amount = v => v!=='' && v!==null && v!==undefined && Number.isSafeInteger(Number(v)) && Number(v)>0 ? Number(v):null;
  app.get('/api/movimientos-proyecto', (req,res) => {
    db.all(`SELECT m.*,p.codigo AS proyecto,pr.codigo AS producto,u.codigo AS ubicacion
      FROM movimientos_proyecto m JOIN proyectos p ON p.id=m.proyecto_id
      JOIN productos pr ON pr.id=m.producto_id JOIN ubicaciones u ON u.id=m.ubicacion_id
      ORDER BY m.id DESC LIMIT 300`,[],(err,rows)=>err?res.status(500).json({error:'Error consultando historial'}):res.json(rows));
  });
  app.post('/api/inventario-proyecto/movimiento', (req,res) => {
    const {tipo, motivo}=req.body||{};
    const proyecto=integer(req.body?.proyecto_id),producto=integer(req.body?.producto_id);
    const ubicacion=integer(req.body?.ubicacion_id),cantidad=amount(req.body?.cantidad);
    const razon=String(motivo||'').trim();
    if(!['ENTRADA','SALIDA'].includes(tipo)||!proyecto||!producto||!ubicacion||!cantidad||!razon||razon.length>500)
      return res.status(400).json({error:'Datos inválidos. Cantidad debe ser entero positivo y motivo obligatorio.'});
    const cx=new sqlite3.Database(dbPath);
    cx.configure('busyTimeout',5000);
    const run=(sql,args=[])=>new Promise((ok,no)=>cx.run(sql,args,function(e){e?no(e):ok({changes:this.changes,lastID:this.lastID})}));
    const get=(sql,args=[])=>new Promise((ok,no)=>cx.get(sql,args,(e,row)=>e?no(e):ok(row)));
    (async()=>{
      let started=false;
      try {
        await run('BEGIN IMMEDIATE');started=true;
        const p=await get("SELECT id FROM proyectos WHERE id=? AND estado='ACTIVO'",[proyecto]);
        const pr=await get("SELECT id FROM productos WHERE id=? AND tipo_control='CANTIDAD'",[producto]);
        const u=await get('SELECT id FROM ubicaciones WHERE id=?',[ubicacion]);
        if(!p||!pr||!u) throw Object.assign(new Error('Proyecto activo, producto de cantidad o ubicación no válidos'),{status:400});
        if(tipo==='ENTRADA') {
          const fisico=await get('SELECT id FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=?',[producto,ubicacion]);
          if(fisico) await run('UPDATE stock_cantidad SET cantidad=cantidad+? WHERE id=?',[cantidad,fisico.id]);
          else await run('INSERT INTO stock_cantidad(producto_id,ubicacion_id,cantidad) VALUES(?,?,?)',[producto,ubicacion,cantidad]);
          await run(`INSERT INTO stock_proyecto(proyecto_id,producto_id,ubicacion_id,cantidad) VALUES(?,?,?,?)
            ON CONFLICT(proyecto_id,producto_id,ubicacion_id) DO UPDATE SET cantidad=cantidad+excluded.cantidad`,[proyecto,producto,ubicacion,cantidad]);
        } else {
          const asignacion=await run(`UPDATE stock_proyecto SET cantidad=cantidad-?
            WHERE proyecto_id=? AND producto_id=? AND ubicacion_id=? AND cantidad>=?`,[cantidad,proyecto,producto,ubicacion,cantidad]);
          if(!asignacion.changes) throw Object.assign(new Error('Stock insuficiente en el proyecto'),{status:409});
          const fisico=await run(`UPDATE stock_cantidad SET cantidad=cantidad-?
            WHERE producto_id=? AND ubicacion_id=? AND cantidad>=?`,[cantidad,producto,ubicacion,cantidad]);
          if(!fisico.changes) throw Object.assign(new Error('Stock físico insuficiente'),{status:409});
        }
        const registro=await run(`INSERT INTO movimientos_proyecto(tipo,proyecto_id,producto_id,ubicacion_id,cantidad,motivo)
          VALUES(?,?,?,?,?,?)`,[tipo,proyecto,producto,ubicacion,cantidad,razon]);
        await run('COMMIT');started=false;
        res.status(201).json({ok:true,movimiento_id:registro.lastID});
      } catch(e) {
        if(started) try{await run('ROLLBACK')}catch(_){}
        res.status(e.status||500).json({error:e.status?e.message:'No se pudo registrar el movimiento'});
      } finally {cx.close()}
    })();
  });
};
