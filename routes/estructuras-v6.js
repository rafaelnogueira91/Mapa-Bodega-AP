'use strict';
// Las estructuras y las ubicaciones por lote comparten la misma cola transaccional.
const withTransaction = require('./transaction-lock');
module.exports = (app, db) => {
  const run = (sql,args=[]) => new Promise((ok,fail)=>db.run(sql,args,function(e){e?fail(e):ok(this.lastID)}));
  const get = (sql,args=[]) => new Promise((ok,fail)=>db.get(sql,args,(e,row)=>e?fail(e):ok(row)));
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS estructuras_almacenamiento (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('RACK','ESTANTERIA','PISO')),
      bodega INTEGER NOT NULL,pasillo INTEGER NOT NULL,modulos INTEGER NOT NULL,
      niveles INTEGER NOT NULL,posiciones INTEGER NOT NULL,capacidad_kg REAL,
      fecha_creacion TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(bodega,pasillo,nombre))`);
    db.run(`CREATE TABLE IF NOT EXISTS posiciones_estructura (
      id INTEGER PRIMARY KEY AUTOINCREMENT, estructura_id INTEGER NOT NULL,
      ubicacion_id INTEGER NOT NULL UNIQUE,modulo INTEGER NOT NULL,
      nivel INTEGER NOT NULL,posicion INTEGER NOT NULL,
      FOREIGN KEY(estructura_id) REFERENCES estructuras_almacenamiento(id),
      FOREIGN KEY(ubicacion_id) REFERENCES ubicaciones(id))`);
  });
  app.get('/api/estructuras', (req,res) => {
    db.all(`SELECT e.*,COUNT(p.id) total_posiciones FROM estructuras_almacenamiento e
      LEFT JOIN posiciones_estructura p ON p.estructura_id=e.id
      GROUP BY e.id ORDER BY e.bodega,e.pasillo,e.nombre`,[],(err,rows)=>
      err?res.status(500).json({mensaje:'No se pudieron consultar las estructuras.'}):res.json(rows));
  });
  app.get('/api/estructuras/:id/posiciones',(req,res)=>{
    db.all(`SELECT p.*,u.codigo,u.estado FROM posiciones_estructura p
      JOIN ubicaciones u ON u.id=p.ubicacion_id WHERE p.estructura_id=?
      ORDER BY p.nivel DESC,p.modulo,p.posicion`,[req.params.id],(err,rows)=>
      err?res.status(500).json({mensaje:'Error al consultar posiciones.'}):res.json(rows));
  });
  app.post('/api/estructuras',async(req,res)=>{
    const {nombre,tipo,bodega,pasillo,modulos,niveles,posiciones,capacidad_kg}=req.body||{};
    const nm=String(nombre||'').trim();
    const nums=[bodega,pasillo,modulos,niveles,posiciones].map(Number);
    const [b,p,m,n,po]=nums;
    if(!nm||nm.length>60||!['RACK','ESTANTERIA','PISO'].includes(tipo)||
      nums.some(x=>!Number.isSafeInteger(x)||x<1||x>999999)||
      m>30||n>15||po>20||m*n*po>500||
      (capacidad_kg!==undefined&&capacidad_kg!==''&&
      (!Number.isFinite(Number(capacidad_kg))||Number(capacidad_kg)<0)))
      return res.status(400).json({mensaje:'Revisa los campos. Máximo 500 posiciones por estructura.'});
    try {
      const result=await withTransaction(db,async()=>{
        const row=await get('SELECT COALESCE(MAX(ubicacion),0) AS ultimo FROM ubicaciones WHERE bodega=? AND pasillo=?',[b,p]);
        let siguiente=Number(row.ultimo)||0;
        const total=m*n*po;
        if(!Number.isSafeInteger(siguiente)||siguiente+total>9999999)
          throw Object.assign(new Error('Límite de ubicaciones alcanzado.'),{status:400});
        const estructuraId=await run(`INSERT INTO estructuras_almacenamiento
          (nombre,tipo,bodega,pasillo,modulos,niveles,posiciones,capacidad_kg)
          VALUES(?,?,?,?,?,?,?,?)`,[nm,tipo,b,p,m,n,po,capacidad_kg===''||capacidad_kg==null?null:Number(capacidad_kg)]);
        for(let nivel=1;nivel<=n;nivel++)for(let modulo=1;modulo<=m;modulo++)
          for(let posicion=1;posicion<=po;posicion++){
            const numero=++siguiente;
            const codigo=`B${b}-P${String(p).padStart(2,'0')}-U${String(numero).padStart(2,'0')}`;
            const ubicacionId=await run(`INSERT INTO ubicaciones(codigo,bodega,pasillo,ubicacion,estado)
              VALUES(?,?,?,?,?)`,[codigo,b,p,numero,'Disponible']);
            await run(`INSERT INTO posiciones_estructura(estructura_id,ubicacion_id,modulo,nivel,posicion)
              VALUES(?,?,?,?,?)`,[estructuraId,ubicacionId,modulo,nivel,posicion]);
          }
        return {mensaje:'Estructura creada correctamente.',id:estructuraId,total};
      });
      res.status(201).json(result);
    }catch(e){
      console.error('Error al crear estructura:',e.message);
      res.status(e.status||(e.code==='SQLITE_CONSTRAINT'?409:500)).json({mensaje:
        e.status?e.message:e.code==='SQLITE_CONSTRAINT'?'Ya existe esa estructura o ubicación.':
        'No se pudo crear la estructura. No se guardaron posiciones parciales.'});
    }
  });
};
