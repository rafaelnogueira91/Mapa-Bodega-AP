// Autenticación de acceso local: cookies HttpOnly, sesiones persistentes y scrypt.
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const {URL} = require('url');
const secure = process.env.NODE_ENV === 'production';
const hash = (password,salt) => crypto.scryptSync(password,salt,64).toString('hex');
const dbRun = (db,sql,params=[]) => new Promise((ok,no)=>db.run(sql,params,function(e){e?no(e):ok(this)}));
const dbGet = (db,sql,params=[]) => new Promise((ok,no)=>db.get(sql,params,(e,r)=>e?no(e):ok(r)));
function parseCookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(s=>s.trim().split('=').map(decodeURIComponent)).filter(a=>a.length===2));}
function setCookie(res,token,age){res.setHeader('Set-Cookie',`bodega_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);}
module.exports = async (app,db) => {
  await dbRun(db,`CREATE TABLE IF NOT EXISTS usuarios_app (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL, rol TEXT NOT NULL CHECK(rol IN ('ADMIN','BODEGA','SUPERVISOR','TECNICO','CONSULTA')), activo INTEGER NOT NULL DEFAULT 1)`);
  // Vínculo opcional, único, entre cuenta y ficha de personal.
  const cols=await new Promise((ok,no)=>db.all('PRAGMA table_info(usuarios_app)',[],(e,r)=>e?no(e):ok(r)));
  if(!cols.some(c=>c.name==='personal_id')) await dbRun(db,'ALTER TABLE usuarios_app ADD COLUMN personal_id INTEGER REFERENCES personal(id)');
  await dbRun(db,'CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_personal_unico ON usuarios_app(personal_id) WHERE personal_id IS NOT NULL');
  await dbRun(db,`CREATE TABLE IF NOT EXISTS sesiones_app (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, expira INTEGER NOT NULL, FOREIGN KEY(usuario_id) REFERENCES usuarios_app(id))`);
  const count=await dbGet(db,'SELECT COUNT(*) n FROM usuarios_app');
  if(!count.n){
    const password=process.env.BODEGA_ADMIN_PASSWORD;
    if(!password || password.length<12) throw new Error('Primer inicio: configura BODEGA_ADMIN_PASSWORD con 12 o más caracteres. No se crea contraseña predeterminada.');
    const salt=crypto.randomBytes(24).toString('hex');
    await dbRun(db,'INSERT INTO usuarios_app(usuario,nombre,salt,password_hash,rol) VALUES(?,?,?,?,?)',['admin','Administrador',salt,hash(password,salt),'ADMIN']);
    console.log('Usuario inicial creado: admin (contraseña obtenida de BODEGA_ADMIN_PASSWORD)');
  }
  app.post('/api/auth/login',async(req,res)=>{
    try{
      const username=String(req.body.usuario||'').trim();const password=String(req.body.password||'');
      const user=await dbGet(db,'SELECT * FROM usuarios_app WHERE usuario=? AND activo=1',[username]);
      // Same computational cost for an unknown user.
      const salt=user?.salt||'000000000000000000000000000000000000000000000000';
      const expected=Buffer.from(user?.password_hash||'00'.repeat(64),'hex');
      const actual=Buffer.from(hash(password,salt),'hex');
      if(!user||!crypto.timingSafeEqual(expected,actual)) return res.status(401).json({error:'Credenciales inválidas'});
      const token=crypto.randomBytes(32).toString('hex');const expires=Date.now()+8*60*60*1000;
      await dbRun(db,'INSERT INTO sesiones_app(token_hash,usuario_id,expira) VALUES(?,?,?)',[crypto.createHash('sha256').update(token).digest('hex'),user.id,expires]);
      setCookie(res,token,8*60*60);res.json({ok:true,nombre:user.nombre,rol:user.rol});
    }catch(e){res.status(500).json({error:'Error de autenticación'});}
  });
  // Las rutas siguientes se registran antes de la autorización de server.js.
  // Protegerlas aquí evita accesos sin sesión y errores por req.usuario ausente.
  async function requireAuth(req,res,next){
    try {
      const token=parseCookies(req).bodega_session||'';
      if(!/^[a-f0-9]{64}$/.test(token))return res.status(401).json({error:'Inicia sesión'});
      const tokenHash=crypto.createHash('sha256').update(token).digest('hex');
      const user=await dbGet(db,`SELECT u.id,u.usuario,u.nombre,u.rol,u.personal_id
        FROM sesiones_app s JOIN usuarios_app u ON u.id=s.usuario_id
        WHERE s.token_hash=? AND s.expira>? AND u.activo=1`,[tokenHash,Date.now()]);
      if(!user)return res.status(401).json({error:'Sesión inválida o expirada'});
      if(['POST','PUT','PATCH','DELETE'].includes(req.method)){
        const origin=req.get('origin');
        if(origin && origin!==`${req.protocol}://${req.get('host')}`)
          return res.status(403).json({error:'Origen no autorizado'});
      }
      req.usuario=user;
      next();
    } catch(e){next(e)}
  }
  app.use('/api/auth/me',requireAuth);
  app.use('/api/auth/logout',requireAuth);
  app.use('/api/auth/cambiar-password',requireAuth);
  app.use('/api/admin',requireAuth);
  app.get('/api/auth/me',(req,res)=>res.json(req.usuario));
  app.post('/api/auth/logout',async(req,res)=>{
    const token=parseCookies(req).bodega_session;
    if(token)await dbRun(db,'DELETE FROM sesiones_app WHERE token_hash=?',[crypto.createHash('sha256').update(token).digest('hex')]);
    setCookie(res,'',0);res.json({ok:true});
  });
  app.post('/api/auth/cambiar-password',async(req,res)=>{
    try {
      const actual=String(req.body?.actual||'');
      const nueva=String(req.body?.nueva||'');
      if(nueva.length<12 || nueva.length>256) return res.status(400).json({error:'La contraseña nueva debe tener entre 12 y 256 caracteres'});
      const user=await dbGet(db,'SELECT * FROM usuarios_app WHERE id=?',[req.usuario.id]);
      if(!user || !crypto.timingSafeEqual(Buffer.from(user.password_hash,'hex'),Buffer.from(hash(actual,user.salt),'hex')))
        return res.status(401).json({error:'Contraseña actual incorrecta'});
      const salt=crypto.randomBytes(24).toString('hex');
      // Contraseña y revocación de sesiones deben confirmarse juntas.
      // Si falla la revocación, la contraseña anterior debe seguir funcionando.
      await dbRun(db,'BEGIN IMMEDIATE');
      try {
        await dbRun(db,'UPDATE usuarios_app SET salt=?,password_hash=? WHERE id=?',[salt,hash(nueva,salt),user.id]);
        await dbRun(db,'DELETE FROM sesiones_app WHERE usuario_id=?',[user.id]);
        await dbRun(db,'COMMIT');
      } catch(e) {
        await dbRun(db,'ROLLBACK').catch(()=>{});
        throw e;
      }
      setCookie(res,'',0);
      res.json({ok:true,mensaje:'Contraseña actualizada. Inicia sesión nuevamente.'});
    } catch(e) {res.status(500).json({error:'No se pudo cambiar la contraseña'});}
  });
  app.patch('/api/admin/usuarios/:id',async(req,res)=>{
    if(req.usuario.rol!=='ADMIN')return res.status(403).json({error:'Solo administrador'});
    const id=Number(req.params.id);
    const activo=req.body?.activo, rol=req.body?.rol, personalId=req.body?.personalId;
    if(!Number.isSafeInteger(id)||id<=0 || (activo===undefined&&rol===undefined&&personalId===undefined) ||
       (personalId!==undefined && personalId!==null && (!Number.isSafeInteger(Number(personalId))||Number(personalId)<=0)) ||
       (activo!==undefined && activo!==0 && activo!==1) ||
       (rol!==undefined&&!['ADMIN','BODEGA','SUPERVISOR','TECNICO','CONSULTA'].includes(rol)))
      return res.status(400).json({error:'Datos inválidos'});
    if(id===req.usuario.id && (activo===0 || (rol && rol!=='ADMIN')))
      return res.status(409).json({error:'No puedes quitarte el acceso de administrador'});
    try{
      const current=await dbGet(db,'SELECT id,rol,activo,personal_id FROM usuarios_app WHERE id=?',[id]);
      if(!current)return res.status(404).json({error:'Usuario no encontrado'});
      if(current.rol==='ADMIN'&&current.activo===1&&(activo===0||(rol&&rol!=='ADMIN'))){
        const admins=await dbGet(db,"SELECT COUNT(*) n FROM usuarios_app WHERE rol='ADMIN' AND activo=1");
        if(admins.n<=1)return res.status(409).json({error:'Debe permanecer al menos un administrador activo'});
      }
      const nextRole=rol??current.rol;
      const nextPersonal=personalId===undefined?current.personal_id:(personalId===null?null:Number(personalId));
      if(nextPersonal!==null){
        if(!['SUPERVISOR','TECNICO'].includes(nextRole))return res.status(400).json({error:'Solo supervisores y técnicos pueden vincularse con personal'});
        const persona=await dbGet(db,'SELECT id,cargo,estado FROM personal WHERE id=?',[nextPersonal]);
        if(!persona||persona.estado!=='ACTIVO'||(nextRole==='SUPERVISOR'&&persona.cargo!=='SUPERVISOR')||(nextRole==='TECNICO'&&!['TECNICO','ASISTENTE'].includes(persona.cargo)))return res.status(400).json({error:'Ficha de personal incompatible o inactiva'});
      }
      await dbRun(db,'UPDATE usuarios_app SET activo=?,rol=?,personal_id=? WHERE id=?',[activo??current.activo,nextRole,nextPersonal,id]);
      await dbRun(db,'DELETE FROM sesiones_app WHERE usuario_id=?',[id]);
      res.json({ok:true});
    }catch(e){res.status(500).json({error:'No se pudo actualizar el usuario'});}
  });
  // El administrador puede restablecer accesos sin conocer la contraseña anterior.
  // La operación revoca todas las sesiones de la cuenta afectada.
  app.post('/api/admin/usuarios/:id/reset-password',async(req,res)=>{
    if(req.usuario.rol!=='ADMIN')return res.status(403).json({error:'Solo administrador'});
    const id=Number(req.params.id);
    const password=req.body?.password;
    if(!Number.isSafeInteger(id)||id<=0||typeof password!=='string'||password.length<12||password.length>256)
      return res.status(400).json({error:'Identificador o contraseña inválidos (12 a 256 caracteres)'});
    try{
      const target=await dbGet(db,'SELECT id FROM usuarios_app WHERE id=?',[id]);
      if(!target)return res.status(404).json({error:'Usuario no encontrado'});
      const salt=crypto.randomBytes(24).toString('hex');
      await dbRun(db,'BEGIN IMMEDIATE');
      try{
        await dbRun(db,'UPDATE usuarios_app SET salt=?,password_hash=? WHERE id=?',[salt,hash(password,salt),id]);
        await dbRun(db,'DELETE FROM sesiones_app WHERE usuario_id=?',[id]);
        await dbRun(db,'COMMIT');
      }catch(e){await dbRun(db,'ROLLBACK').catch(()=>{});throw e;}
      if(id===req.usuario.id)setCookie(res,'',0);
      res.json({ok:true,mensaje:'Contraseña restablecida. Las sesiones anteriores fueron cerradas.'});
    }catch(e){res.status(500).json({error:'No se pudo restablecer la contraseña'});}
  });
  app.get('/api/admin/usuarios',async(req,res)=>{
    if(req.usuario.rol!=='ADMIN')return res.status(403).json({error:'Solo administrador'});
    db.all('SELECT id,usuario,nombre,rol,activo,personal_id FROM usuarios_app ORDER BY id',[],(e,r)=>e?res.status(500).json({error:'Error'}):res.json(r));
  });
  app.post('/api/admin/usuarios',async(req,res)=>{
    if(req.usuario.rol!=='ADMIN')return res.status(403).json({error:'Solo administrador'});
    const {usuario,nombre,password,rol,personalId=null}=req.body||{};
    if(!/^[a-zA-Z0-9._-]{3,50}$/.test(usuario||'')||!String(nombre||'').trim()||String(password||'').length<12||!['ADMIN','BODEGA','SUPERVISOR','TECNICO','CONSULTA'].includes(rol))return res.status(400).json({error:'Datos inválidos: contraseña de 12 caracteres mínimo'});
    const pid=personalId===null||personalId===''?null:Number(personalId);
    if(pid!==null){
      if(!Number.isSafeInteger(pid)||pid<=0||!['SUPERVISOR','TECNICO'].includes(rol))return res.status(400).json({error:'Vínculo de personal inválido'});
      try{
        const persona=await dbGet(db,'SELECT cargo,estado FROM personal WHERE id=?',[pid]);
        if(!persona||persona.estado!=='ACTIVO'||(rol==='SUPERVISOR'&&persona.cargo!=='SUPERVISOR')||(rol==='TECNICO'&&!['TECNICO','ASISTENTE'].includes(persona.cargo)))return res.status(400).json({error:'Ficha de personal incompatible o inactiva'});
      }catch(e){return res.status(500).json({error:'No se pudo verificar el personal'});}
    }
    const salt=crypto.randomBytes(24).toString('hex');
    try{await dbRun(db,'INSERT INTO usuarios_app(usuario,nombre,salt,password_hash,rol,personal_id) VALUES(?,?,?,?,?,?)',[usuario,nombre.trim(),salt,hash(password,salt),rol,pid]);res.status(201).json({ok:true});}catch(e){res.status(409).json({error:'Usuario duplicado o error de registro'});}
  });
};
