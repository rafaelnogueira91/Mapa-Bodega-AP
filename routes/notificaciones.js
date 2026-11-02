'use strict';
// Bandeja de notificaciones: los triggers registran eventos en la misma transacción.
module.exports=(app,db)=>{
 const run=(sql,args=[])=>new Promise((ok,no)=>db.run(sql,args,function(e){e?no(e):ok(this.changes)}));
 const all=(sql,args=[])=>new Promise((ok,no)=>db.all(sql,args,(e,r)=>e?no(e):ok(r)));
 const init=(async()=>{
  await run('CREATE TABLE IF NOT EXISTS notificacion_destinatarios(id INTEGER PRIMARY KEY,correo TEXT NOT NULL COLLATE NOCASE UNIQUE,activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)))');
  await run("CREATE TABLE IF NOT EXISTS notificacion_cola(id INTEGER PRIMARY KEY,evento TEXT NOT NULL,referencia_id INTEGER NOT NULL,creado_en TEXT DEFAULT CURRENT_TIMESTAMP,estado TEXT DEFAULT 'PENDIENTE',intentos INTEGER DEFAULT 0,ultimo_error TEXT,enviado_en TEXT,UNIQUE(evento,referencia_id))");
  await run("CREATE TRIGGER IF NOT EXISTS notif_solicitud_creada AFTER INSERT ON solicitudes BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('SOLICITUD',NEW.id); END");
  await run("CREATE TRIGGER IF NOT EXISTS notif_solicitud_entregada AFTER UPDATE OF estado ON solicitudes WHEN NEW.estado='ENTREGADA' AND OLD.estado<>NEW.estado BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('ENTREGA',NEW.id); END");
  await run("CREATE TRIGGER IF NOT EXISTS notif_devolucion AFTER INSERT ON movimientos WHEN NEW.tipo_movimiento='DEVOLUCION' BEGIN INSERT OR IGNORE INTO notificacion_cola(evento,referencia_id) VALUES('DEVOLUCION',NEW.id); END");
  const cols=await all('PRAGMA table_info(notificacion_cola)');
  if(!cols.some(c=>c.name==='proximo_intento'))await run('ALTER TABLE notificacion_cola ADD COLUMN proximo_intento TEXT');
  await run("UPDATE notificacion_cola SET estado='ERROR',ultimo_error='Envío interrumpido: verificar posible duplicado' WHERE estado='ENVIANDO'");
 })();
 const admin=(req,res,next)=>req.usuario?.rol==='ADMIN'?next():res.status(403).json({error:'Solo administrador'});
 app.get('/api/admin/notificaciones/destinatarios',admin,async(req,res)=>{try{await init;res.json(await all('SELECT id,correo,activo FROM notificacion_destinatarios ORDER BY correo'))}catch(e){res.status(500).json({error:'Error de consulta'})}});
 app.post('/api/admin/notificaciones/destinatarios',admin,async(req,res)=>{
  const correo=String(req.body?.correo||'').trim().toLowerCase();
  if(correo.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))return res.status(400).json({error:'Correo inválido'});
  try{await init;await run('INSERT INTO notificacion_destinatarios(correo) VALUES(?) ON CONFLICT(correo) DO UPDATE SET activo=1',[correo]);res.status(201).json({ok:true})}catch(e){res.status(500).json({error:'No se pudo agregar'})}
 });
 app.patch('/api/admin/notificaciones/destinatarios/:id',admin,async(req,res)=>{
  const id=Number(req.params.id),activo=req.body?.activo;
  if(!Number.isSafeInteger(id)||id<=0||![0,1].includes(activo))return res.status(400).json({error:'Datos inválidos'});
  try{await init;const n=await run('UPDATE notificacion_destinatarios SET activo=? WHERE id=?',[activo,id]);res.status(n?200:404).json(n?{ok:true}:{error:'No encontrado'})}catch(e){res.status(500).json({error:'Error de actualización'})}
 });
 app.get('/api/admin/notificaciones/cola',admin,async(req,res)=>{try{await init;res.json(await all('SELECT * FROM notificacion_cola ORDER BY id DESC LIMIT 200'))}catch(e){res.status(500).json({error:'Error de consulta'})}});
 // Indicadores para el administrador, sin exponer correos a otros roles.
 app.get('/api/admin/notificaciones/resumen',admin,async(req,res)=>{
  try{
   await init;
   const rows=await all('SELECT estado,COUNT(*) AS total FROM notificacion_cola GROUP BY estado');
   const resumen={PENDIENTE:0,ENVIANDO:0,ENVIADO:0,ERROR:0};
   for(const row of rows)resumen[row.estado]=row.total;
   res.json(resumen);
  }catch(e){res.status(500).json({error:'No se pudo consultar el resumen'})}
 });
 // Reintento explícito, solo para fallos que no están actualmente en envío.
 // No reinicia el contador de intentos: se respeta el límite de cinco.
 // Diagnóstico administrativo sin exponer contraseñas ni correos privados.
 app.get('/api/admin/notificaciones/diagnostico',admin,async(req,res)=>{
  try {
   await init;
   const stats=await all(`SELECT COUNT(*) AS total,
      SUM(CASE WHEN estado='PENDIENTE' THEN 1 ELSE 0 END) AS pendientes,
      SUM(CASE WHEN estado='ERROR' AND intentos<5 THEN 1 ELSE 0 END) AS reintentables,
      SUM(CASE WHEN estado='ERROR' AND intentos>=5 THEN 1 ELSE 0 END) AS agotados,
      SUM(CASE WHEN estado='ENVIANDO' THEN 1 ELSE 0 END) AS en_curso
      FROM notificacion_cola`);
   const recipients=await all('SELECT COUNT(*) AS total FROM notificacion_destinatarios WHERE activo=1');
   res.json({automatico:process.env.BODEGA_NOTIFICACIONES_AUTO==='1',
    credenciales_configuradas:Boolean(process.env.BODEGA_GMAIL_USER && process.env.BODEGA_GMAIL_APP_PASSWORD),
    destinatarios_activos:recipients[0].total,intervalo_minutos:intervalMinutes,cola:Object.fromEntries(Object.entries(stats[0]).map(([k,v])=>[k,v??0]))});
  } catch(e) {
   console.error('[Diagnóstico de notificaciones]',e);
   res.status(500).json({error:'No se pudo obtener el diagnóstico'});
  }
 });
 app.post('/api/admin/notificaciones/:id/reintentar',admin,async(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Identificador inválido'});
  try{
   await init;
   const n=await run("UPDATE notificacion_cola SET estado='PENDIENTE',proximo_intento=NULL WHERE id=? AND estado='ERROR' AND intentos<5",[id]);
   res.status(n?200:409).json(n?{ok:true}:{error:'Solo se pueden reintentar errores con menos de cinco intentos'});
  }catch(e){res.status(500).json({error:'No se pudo programar el reintento'})}
 });

 let processing=false;
 const intervalMinutes=Math.max(1,Math.min(1440,Number.parseInt(process.env.BODEGA_NOTIFICACIONES_INTERVALO_MIN||'5',10)||5));
 async function sendPending(){
  await init;
  if(processing)return {procesadas:0,motivo:'Envío en curso'};
  const user=process.env.BODEGA_GMAIL_USER,pass=process.env.BODEGA_GMAIL_APP_PASSWORD;
  if(!user||!pass)return {procesadas:0,motivo:'Configura las credenciales Gmail en el servidor'};
  let nodemailer;
  try{nodemailer=require('nodemailer')}catch(_){return {procesadas:0,motivo:'Instala dependencias con npm install'}}
  processing=true;
  try{
   const bcc=(await all('SELECT correo FROM notificacion_destinatarios WHERE activo=1')).map(x=>x.correo);
   if(!bcc.length)return {procesadas:0,motivo:'Sin destinatarios activos'};
   const transporter=nodemailer.createTransport({service:'gmail',auth:{user,pass}});
   const jobs=await all("SELECT * FROM notificacion_cola WHERE estado IN ('PENDIENTE','ERROR') AND intentos<5 AND (proximo_intento IS NULL OR proximo_intento<=CURRENT_TIMESTAMP) ORDER BY id LIMIT 10");
   let enviadas=0;
   for(const job of jobs){
    const claimed=await run("UPDATE notificacion_cola SET estado='ENVIANDO',intentos=intentos+1 WHERE id=? AND estado IN ('PENDIENTE','ERROR') AND intentos<5 AND (proximo_intento IS NULL OR proximo_intento<=CURRENT_TIMESTAMP)",[job.id]);
    if(!claimed)continue;
    try{
     await transporter.sendMail({from:user,to:user,bcc,subject:`Bodega AP: ${job.evento} #${job.referencia_id}`,text:`Se registró ${job.evento} #${job.referencia_id}. Revisa Mapa Bodega AP para ver los detalles.`});
     await run("UPDATE notificacion_cola SET estado='ENVIADO',enviado_en=CURRENT_TIMESTAMP,ultimo_error=NULL,proximo_intento=NULL WHERE id=?",[job.id]);enviadas++;
    }catch(e){
     const minutes=Math.min(60,Math.pow(2,Math.min(job.intentos+1,5)));
     await run("UPDATE notificacion_cola SET estado='ERROR',ultimo_error=?,proximo_intento=datetime('now', ? || ' minutes') WHERE id=?",[String(e.message||e).slice(0,400),`+${minutes}`,job.id]);
    }
   }
   return {procesadas:jobs.length,enviadas};
  }finally{processing=false}
 }
 app.post('/api/admin/notificaciones/enviar-pendientes',admin,async(req,res)=>{try{res.json(await sendPending())}catch(e){console.error('Correo:',e);res.status(500).json({error:'Error al enviar'})}});
 if(process.env.BODEGA_NOTIFICACIONES_AUTO==='1'){
   init.then(()=>{
     const tick=()=>sendPending().catch(e=>console.error('[Notificaciones automáticas]',e.message));
     const timer=setInterval(tick,intervalMinutes*60*1000);
     timer.unref?.();
   }).catch(e=>console.error('[Notificaciones: inicio]',e.message));
 }
 return init;
};
