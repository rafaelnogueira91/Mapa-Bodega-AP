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
        JOIN personal s ON s.id = p.supervisor_personal_id
        WHERE (LOWER(s.correo) = LOWER(?) OR LOWER(s.rut) = LOWER(?))
          AND UPPER(s.estado) = 'ACTIVO'
        ORDER BY p.estado ASC, p.nombre COLLATE NOCASE ASC`,
        [req.usuario.usuario, req.usuario.usuario],
        (err, rows) => err ? res.status(500).json({error:'Error al consultar proyectos'}) : res.json(rows));
    }
    if (!['ADMIN', 'BODEGA', 'CONSULTA'].includes(rol)) {
      return res.status(403).json({error:'Sin permiso para consultar proyectos'});
    }
    db.all('SELECT * FROM proyectos ORDER BY estado ASC, nombre COLLATE NOCASE ASC', [],
      (err, rows) => err ? res.status(500).json({error:'Error al consultar proyectos'}) : res.json(rows));
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
