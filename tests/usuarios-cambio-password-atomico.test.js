const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const register = require('../auth');

async function scenario(failDelete) {
  const routes = new Map();
  const app = { post:(p,h)=>routes.set(`POST ${p}`,h),get:(p,h)=>routes.set(`GET ${p}`,h),patch:(p,h)=>routes.set(`PATCH ${p}`,h),use:()=>{} };
  const salt = 'salt-test';
  const originalHash = crypto.scryptSync('contraseña-original-123',salt,64).toString('hex');
  let user = {id:1,usuario:'admin',nombre:'Admin',rol:'ADMIN',activo:1,salt,password_hash:originalHash};
  let sessions = ['active'];
  let backup;
  const db = {
    run(sql,params,cb) {
      if (typeof params==='function') {cb=params;params=[];}
      if(sql==='BEGIN IMMEDIATE') backup={user:{...user},sessions:[...sessions]};
      else if(sql.startsWith('UPDATE usuarios_app SET salt=')) {user={...user,salt:params[0],password_hash:params[1]};}
      else if(sql.startsWith('DELETE FROM sesiones_app WHERE usuario_id=')) {
        if(failDelete) return cb(new Error('SQLite failure'));
        sessions=[];
      } else if(sql==='ROLLBACK') {user=backup.user;sessions=backup.sessions;}
      cb.call({},null);
    },
    get(sql,params,cb) {
      if(sql==='SELECT COUNT(*) n FROM usuarios_app') return cb(null,{n:1});
      if(sql.startsWith('SELECT * FROM usuarios_app WHERE id=')) return cb(null,{...user});
      cb(null,null);
    },
    all(sql,params,cb) {
      if(sql.startsWith('PRAGMA table_info')) return cb(null,[{name:'personal_id'}]);
      cb(null,[]);
    }
  };
  await register(app,db);
  const req={usuario:{id:1,rol:'ADMIN'},body:{actual:'contraseña-original-123',nueva:'contraseña-nueva-123'}};
  const res={statusCode:200,headers:{},status(n){this.statusCode=n;return this;},setHeader(k,v){this.headers[k]=v;},json(v){this.body=v;return this;}};
  await routes.get('POST /api/auth/cambiar-password')(req,res);
  if(failDelete){
    assert.equal(res.statusCode,500);
    assert.equal(user.password_hash,originalHash,'Rollback debe restaurar contraseña');
    assert.deepEqual(sessions,['active'],'Rollback debe restaurar sesiones');
    assert.equal(res.headers['Set-Cookie'],undefined);
  } else {
    assert.equal(res.statusCode,200);
    assert.notEqual(user.password_hash,originalHash);
    assert.deepEqual(sessions,[]);
    assert.match(res.headers['Set-Cookie'],/Max-Age=0/);
  }
}
(async()=>{await scenario(false);await scenario(true);console.log('OK: cambio de contraseña atómico y rollback');})().catch(e=>{console.error(e);process.exitCode=1;});
