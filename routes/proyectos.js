module.exports = (app, db) => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS proyectos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      cliente TEXT DEFAULT '',
      responsable TEXT DEFAULT '',
      descripcion TEXT DEFAULT '',
      estado TEXT NOT NULL DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO','INACTIVO')),
      fecha_creacion TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS stock_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones(id),
      cantidad REAL NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
      UNIQUE(proyecto_id,producto_id,ubicacion_id)
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS transferencias_proyecto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proyecto_origen_id INTEGER NOT NULL REFERENCES proyectos(id),
      proyecto_destino_id INTEGER NOT NULL REFERENCES proyectos(id),
      producto_id INTEGER NOT NULL REFERENCES productos(id),
      ubicacion_id INTEGER NOT NULL REFERENCES ubicaciones(id),
      cantidad REAL NOT NULL CHECK (cantidad > 0),
      motivo TEXT NOT NULL,
      fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
  });
  // Asignación explícita: cada proyecto identifica supervisor (ficha de personal)
  // y bodega física. NULL conserva proyectos históricos sin asignación.
  db.serialize(() => {
    db.all('PRAGMA table_info(proyectos)', [], (err, cols) => {
      if (err) return console.error('Migración proyectos:', err.message);
      const nombres = new Set(cols.map(c => c.name));
      if (!nombres.has('supervisor_personal_id')) db.run('ALTER TABLE proyectos ADD COLUMN supervisor_personal_id INTEGER REFERENCES personal(id)');
      if (!nombres.has('bodega_numero')) db.run('ALTER TABLE proyectos ADD COLUMN bodega_numero INTEGER');
    });
  });
  // Relación muchos supervisores -> un proyecto por supervisor.
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS proyecto_supervisores (
      supervisor_personal_id INTEGER PRIMARY KEY REFERENCES personal(id),
      proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
      fecha_asignacion TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    // Migración no destructiva de la asignación histórica (si la columna ya existe).
    db.all('PRAGMA table_info(proyectos)', [], (err, cols) => {
      if (!err && cols.some(c => c.name === 'supervisor_personal_id'))
        db.run(`INSERT OR IGNORE INTO proyecto_supervisores (supervisor_personal_id,proyecto_id)
          SELECT supervisor_personal_id,id FROM proyectos WHERE supervisor_personal_id IS NOT NULL`);
    });
  });
  const withSupervisores = (rows, res) => {
    db.all('SELECT supervisor_personal_id,proyecto_id FROM proyecto_supervisores', [], (err, asignaciones) => {
      if(err)return res.status(500).json({error:'Error consultando asignaciones'});
      res.json(rows.map(p=>({...p,supervisores_ids:asignaciones.filter(a=>a.proyecto_id===p.id).map(a=>a.supervisor_personal_id)})));
    });
  };
  app.put('/api/proyectos/:id/supervisores', (req,res) => {
    if(req.usuario?.rol!=='ADMIN')return res.status(403).json({error:'Solo Administración puede asignar supervisores'});
    const id=Number(req.params.id), ids=req.body?.supervisorPersonalIds;
    if(!Number.isSafeInteger(id)||id<1||!Array.isArray(ids)||ids.length>500||
       ids.some(x=>!Number.isSafeInteger(x)||x<1)||new Set(ids).size!==ids.length)
      return res.status(400).json({error:'Lista de supervisores inválida'});
    db.get('SELECT id FROM proyectos WHERE id=?',[id],(err,proyecto)=>{
      if(err)return res.status(500).json({error:'Error consultando proyecto'});
      if(!proyecto)return res.status(404).json({error:'Proyecto no encontrado'});
      const placeholders=ids.map(()=>'?').join(',');
      const validar=ids.length?`SELECT id FROM personal WHERE id IN (${placeholders}) AND UPPER(cargo)='SUPERVISOR' AND UPPER(estado)='ACTIVO'`:null;
      const continuar=()=>{
        db.all(`SELECT supervisor_personal_id,proyecto_id FROM proyecto_supervisores WHERE supervisor_personal_id IN (${ids.length?placeholders:'NULL'})`,ids,(e,ocupados)=>{
          if(e)return res.status(500).json({error:'Error verificando asignaciones'});
          if(ocupados.some(a=>a.proyecto_id!==id))return res.status(409).json({error:'Un supervisor ya está asignado a otro proyecto'});
          db.serialize(()=>{
            db.run('BEGIN IMMEDIATE TRANSACTION',e=>{
              if(e)return res.status(500).json({error:'No se pudo iniciar la transacción'});
              db.run('DELETE FROM proyecto_supervisores WHERE proyecto_id=?',[id],e2=>{
                if(e2)return db.run('ROLLBACK',()=>res.status(500).json({error:'No se pudo actualizar asignaciones'}));
                const agregar=(i)=>{
                  if(i===ids.length)return db.run('COMMIT',e3=>e3?res.status(500).json({error:'Error confirmando asignaciones'}):res.json({ok:true,proyectoId:id,supervisorPersonalIds:ids}));
                  db.run('INSERT INTO proyecto_supervisores(supervisor_personal_id,proyecto_id) VALUES (?,?)',[ids[i],id],e4=>{
                    if(e4)return db.run('ROLLBACK',()=>res.status(e4.code==='SQLITE_CONSTRAINT'?409:500).json({error:'Supervisor asignado a otro proyecto o error de guardado'}));
                    agregar(i+1);
                  });
                };agregar(0);
              });
            });
          });
        });
      };
      if(!validar)return continuar();
      db.all(validar,ids,(e,personas)=>{
        if(e)return res.status(500).json({error:'Error validando supervisores'});
        if(personas.length!==ids.length)return res.status(400).json({error:'Hay supervisores inexistentes o inactivos'});
        continuar();
      });
    });
  });
  app.put('/api/proyectos/:id/bodega',(req,res)=>{
    if(req.usuario?.rol!=='ADMIN')return res.status(403).json({error:'Solo Administración puede asignar bodegas'});
    const id=Number(req.params.id),bodega=Number(req.body?.bodegaNumero);
    if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(bodega)||bodega<1)return res.status(400).json({error:'Datos inválidos'});
    db.get('SELECT 1 FROM ubicaciones WHERE bodega=? LIMIT 1',[bodega],(e,row)=>{
      if(e)return res.status(500).json({error:'Error verificando bodega'});
      if(!row)return res.status(400).json({error:'Bodega sin ubicaciones registradas'});
      db.run('UPDATE proyectos SET bodega_numero=? WHERE id=?',[bodega,id],function(err){
        if(err)return res.status(500).json({error:'Error asignando bodega'});
        if(!this.changes)return res.status(404).json({error:'Proyecto no encontrado'});
        res.json({ok:true});
      });
    });
  });
  // Administración configura la relación proyecto -> supervisor -> bodega.
  app.put('/api/proyectos/:id/asignacion', (req, res) => {
    if (req.usuario?.rol !== 'ADMIN') return res.status(403).json({error:'Solo Administración puede asignar proyectos'});
    const id=Number(req.params.id), supervisor=Number(req.body.supervisorPersonalId), bodega=Number(req.body.bodegaNumero);
    if (![id,supervisor,bodega].every(n=>Number.isSafeInteger(n)&&n>0)) return res.status(400).json({error:'Proyecto, supervisor y bodega deben ser números positivos'});
    db.get("SELECT id FROM personal WHERE id=? AND UPPER(cargo)='SUPERVISOR' AND UPPER(estado)='ACTIVO'",[supervisor],(e,persona)=>{
      if(e)return res.status(500).json({error:'Error consultando personal'});
      if(!persona)return res.status(400).json({error:'Supervisor inexistente o inactivo'});
      db.get('SELECT id FROM ubicaciones WHERE bodega=? LIMIT 1',[bodega],(e2,ubic)=>{
        if(e2)return res.status(500).json({error:'Error consultando bodegas'});
        if(!ubic)return res.status(400).json({error:'La bodega no tiene ubicaciones registradas'});
        db.run('UPDATE proyectos SET supervisor_personal_id=?, bodega_numero=? WHERE id=?',[supervisor,bodega,id],function(e3){
          if(e3)return res.status(500).json({error:'Error guardando asignación'});
          if(!this.changes)return res.status(404).json({error:'Proyecto no encontrado'});
          res.json({ok:true,proyectoId:id,supervisorPersonalId:supervisor,bodegaNumero:bodega});
        });
      });
    });
  });
  // Permite quitar una asignación anterior sin eliminar el proyecto ni su historial.
  app.delete('/api/proyectos/:id/asignacion', (req, res) => {
    if (req.usuario?.rol !== 'ADMIN') return res.status(403).json({error:'Solo Administración puede quitar asignaciones'});
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({error:'Proyecto inválido'});
    db.run('UPDATE proyectos SET supervisor_personal_id=NULL, bodega_numero=NULL WHERE id=?', [id], function(err) {
      if (err) return res.status(500).json({error:'Error quitando asignación'});
      if (!this.changes) return res.status(404).json({error:'Proyecto no encontrado'});
      res.json({ok:true, proyectoId:id});
    });
  });
  const clean = x => typeof x === 'string' ? x.trim() : '';
  // La lista se limita en el servidor: el filtro del navegador no es una barrera de acceso.
  app.get('/api/proyectos', (req, res) => {
    const rol = String(req.usuario?.rol || '').toUpperCase();
    if (rol === 'SUPERVISOR') {
      return db.all(`SELECT p.* FROM proyectos p
        JOIN proyecto_supervisores ps ON ps.proyecto_id = p.id
        JOIN personal s ON s.id = ps.supervisor_personal_id
        WHERE (LOWER(s.correo) = LOWER(?) OR LOWER(s.rut) = LOWER(?))
          AND UPPER(s.estado) = 'ACTIVO'
        ORDER BY p.estado ASC, p.nombre COLLATE NOCASE ASC`,
        [req.usuario.usuario, req.usuario.usuario],
        (err, rows) => err ? res.status(500).json({error:'Error al consultar proyectos'}) : withSupervisores(rows,res));
    }
    if (!['ADMIN', 'BODEGA', 'CONSULTA'].includes(rol)) {
      return res.status(403).json({error:'Sin permiso para consultar proyectos'});
    }
    db.all('SELECT * FROM proyectos ORDER BY estado ASC, nombre COLLATE NOCASE ASC', [],
      (err, rows) => err ? res.status(500).json({error:'Error al consultar proyectos'}) : withSupervisores(rows,res));
  });
  app.post('/api/proyectos', (req,res) => {
    const codigo=clean(req.body.codigo).toUpperCase(), nombre=clean(req.body.nombre);
    if(!codigo || !nombre || codigo.length>40 || nombre.length>150) return res.status(400).json({error:'Código y nombre obligatorios (máx. 40 y 150 caracteres)'});
    db.run('INSERT INTO proyectos (codigo,nombre,cliente,responsable,descripcion) VALUES (?,?,?,?,?)',[codigo,nombre,clean(req.body.cliente),clean(req.body.responsable),clean(req.body.descripcion)],function(err){
      if(err) return res.status(err.code==='SQLITE_CONSTRAINT'?409:500).json({error:err.code==='SQLITE_CONSTRAINT'?'El código ya existe':'No se pudo crear el proyecto'});
      res.status(201).json({id:this.lastID,codigo,nombre});
    });
  });
  app.put('/api/proyectos/:id', (req,res) => {
    const id=Number(req.params.id),codigo=clean(req.body.codigo).toUpperCase(),nombre=clean(req.body.nombre),estado=clean(req.body.estado);
    if(!Number.isSafeInteger(id)||id<1||!codigo||!nombre||codigo.length>40||nombre.length>150||!['ACTIVO','INACTIVO'].includes(estado))return res.status(400).json({error:'Datos inválidos'});
    db.run('UPDATE proyectos SET codigo=?,nombre=?,cliente=?,responsable=?,descripcion=?,estado=? WHERE id=?',[codigo,nombre,clean(req.body.cliente),clean(req.body.responsable),clean(req.body.descripcion),estado,id],function(err){
      if(err)return res.status(err.code==='SQLITE_CONSTRAINT'?409:500).json({error:err.code==='SQLITE_CONSTRAINT'?'El código ya existe':'No se pudo actualizar'});
      if(!this.changes)return res.status(404).json({error:'Proyecto no encontrado'});
      res.json({ok:true});
    });
  });
};
