'use strict';
// Integración HTTP real con el controlador original y consultas ejecutadas en SQLite real.
// Usa servidor HTTP nativo, sin depender de Express para montar la ruta.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bodega-http-sqlite-'));
const dbfile=path.join(tmp,'entregas.sqlite');
const python=process.env.PYTHON||'python';
function sql(script,args=[]){
 const code=`import sqlite3,json,sys
db=sqlite3.connect(sys.argv[1])
db.row_factory=sqlite3.Row
q=sys.stdin.read()
try:
 c=db.execute(q,json.loads(sys.argv[2]))
 if c.description: print(json.dumps([dict(x) for x in c.fetchall()]))
 else: db.commit();print('[]')
finally: db.close()`;
 const r=spawnSync(python,['-c',code,dbfile,JSON.stringify(args)],{input:script,encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr);
 return JSON.parse(r.stdout);
}
sql('CREATE TABLE productos_seriados(id INTEGER PRIMARY KEY, numero_serie TEXT)');
sql('CREATE TABLE proyectos(id INTEGER PRIMARY KEY, codigo TEXT)');
sql('CREATE TABLE personal(id INTEGER PRIMARY KEY, nombre TEXT)');
sql('CREATE TABLE ubicaciones(id INTEGER PRIMARY KEY, codigo TEXT)');
sql(`CREATE TABLE entregas_series_proyecto(id INTEGER PRIMARY KEY, serie_id INTEGER, proyecto_id INTEGER, personal_id INTEGER, ubicacion_origen_id INTEGER, ubicacion_devolucion_id INTEGER, fecha_entrega TEXT, fecha_devolucion TEXT)`);
sql("INSERT INTO proyectos VALUES(1,'PR1')");
sql("INSERT INTO personal VALUES(1,'Ana')");
sql("INSERT INTO ubicaciones VALUES(1,'B1-P01-U01')");
const fixture=`import sqlite3,sys
db=sqlite3.connect(sys.argv[1])
db.executemany('INSERT INTO productos_seriados VALUES(?,?)',[(i,'SERIE-'+str(i)) for i in range(1,2206)])
db.executemany('INSERT INTO entregas_series_proyecto VALUES(?,?,?,?,?,?,?,?)',[(i,i,1,1,1,None,'2026-10-01 10:00:00',None if i<=1205 else '2026-10-05 10:00:00') for i in range(1,2206)])
db.commit();db.close()`;
const fixtureResult=spawnSync(python,['-c',fixture,dbfile],{encoding:'utf8'});
assert.equal(fixtureResult.status,0,fixtureResult.stderr);
const routes={};
const app={get:(u,fn)=>{routes[u]=fn},post:()=>{}};
const db={serialize:fn=>fn(),run:()=>{},all:(query,args,callback)=>{
 try{callback(null,sql(query,args));}catch(e){callback(e);}
}};
const source=fs.readFileSync(path.join(__dirname,'..','routes/series-proyectos.js'),'utf8');
const moduleMock={exports:{}};
vm.runInNewContext(source,{
 module:moduleMock,exports:moduleMock.exports,
 require:name=>name==='sqlite3'?{verbose:()=>({Database:class{}})}:require(name),
 __dirname:path.join(__dirname,'..','routes')
});
moduleMock.exports(app,db);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const handler=routes[url.pathname];
 if(!handler){res.writeHead(404);return res.end();}
 const usuario={rol:req.headers['x-test-role']||'OPERADOR'};
 const response={
  status(code){res.statusCode=code;return this},
  json(body){res.setHeader('content-type','application/json');res.end(JSON.stringify(body));return this}
 };
 handler({usuario,query:Object.fromEntries(url.searchParams)},response);
});
async function main(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 const get=async(cursor,role='BODEGA')=>{
  const r=await fetch(`${base}/api/series-proyectos/pendientes-exportacion?cursor=${encodeURIComponent(cursor)}`,{headers:{'x-test-role':role}});
  return {status:r.status,body:await r.json()};
 };
 try{
  assert.equal((await get('0','OPERADOR')).status,403);
  for(const bad of ['-1','abc','1.5','1e2','+1','9007199254740992'])assert.equal((await get(bad)).status,400,bad);
  let cursor=0,ids=[],paginas=0;
  do{
   const r=await get(String(cursor));
   assert.equal(r.status,200);
   paginas++;
   ids.push(...r.body.registros.map(x=>x.id));
   cursor=r.body.siguienteCursor;
  }while(cursor!==null);
  assert.equal(paginas,2);
  assert.equal(ids.length,1205);
  assert.equal(new Set(ids).size,1205);
  assert.equal(ids[0],1);
  assert.equal(ids.at(-1),1205);
  assert.equal((await get('1205')).body.registros.length,0);
  console.log('HTTP real + SQLite: 1205 pendientes, 1000 devueltas excluidas, 2 páginas, sin duplicados; permisos y cursores OK');
 }finally{
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(tmp,{recursive:true,force:true});
 }
}
main().catch(e=>{console.error(e);server.close();fs.rmSync(tmp,{recursive:true,force:true});process.exitCode=1});
