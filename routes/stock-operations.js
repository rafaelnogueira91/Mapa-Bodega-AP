'use strict';
// Única lógica de cantidades para movimientos manuales y traslados integrales.
// Todas las llamadas deben ejecutarse dentro de transaction-lock(db, ...).
module.exports = function stockOperations(db) {
  const get=(q,a=[])=>new Promise((ok,no)=>db.get(q,a,(e,r)=>e?no(e):ok(r)));
  const all=(q,a=[])=>new Promise((ok,no)=>db.all(q,a,(e,r)=>e?no(e):ok(r)));
  const run=(q,a=[])=>new Promise((ok,no)=>db.run(q,a,function(e){e?no(e):ok(this.changes)}));
  const fail=(message)=>Object.assign(new Error(message),{status:409});
  const validate=(n)=>{if(!Number.isSafeInteger(n)||n<=0)throw Object.assign(new Error('Cantidad debe ser entero positivo'),{status:400});};
  async function free(productId,locationId){
    const stock=await get('SELECT COALESCE(SUM(cantidad),0) n FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=?',[productId,locationId]);
    const reserved=await get('SELECT COALESCE(SUM(cantidad),0) n FROM stock_proyecto WHERE producto_id=? AND ubicacion_id=?',[productId,locationId]);
    return stock.n-reserved.n;
  }
  async function withdraw(productId,locationId,amount){
    validate(amount);
    if(await free(productId,locationId)<amount)throw fail('Stock libre insuficiente: existen unidades reservadas o retiradas');
    const rows=await all('SELECT id,cantidad FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=? AND cantidad>0 ORDER BY id',[productId,locationId]);
    let remaining=amount;
    for(const row of rows){
      if(!remaining)break;
      const n=Math.min(remaining,row.cantidad);
      if(await run('UPDATE stock_cantidad SET cantidad=cantidad-? WHERE id=? AND cantidad>=?',[n,row.id,n])!==1)throw fail('Stock modificado durante la operación');
      remaining-=n;
    }
    if(remaining)throw fail('Stock insuficiente');
  }
  async function deposit(productId,locationId,amount){
    validate(amount);
    const row=await get('SELECT id FROM stock_cantidad WHERE producto_id=? AND ubicacion_id=? ORDER BY id LIMIT 1',[productId,locationId]);
    if(row)await run('UPDATE stock_cantidad SET cantidad=cantidad+? WHERE id=?',[amount,row.id]);
    else await run('INSERT INTO stock_cantidad(producto_id,ubicacion_id,cantidad) VALUES(?,?,?)',[productId,locationId,amount]);
  }
  async function occupancy(locationId){
    const result=await get(`SELECT (SELECT COUNT(*) FROM stock_cantidad WHERE ubicacion_id=? AND cantidad>0)
       +(SELECT COUNT(*) FROM productos_seriados WHERE ubicacion_id=? AND estado='Disponible') n`,[locationId,locationId]);
    await run('UPDATE ubicaciones SET estado=? WHERE id=?',[result.n?'Ocupada':'Disponible',locationId]);
  }
  return {free,withdraw,deposit,occupancy};
};
