"use strict";
// Impresión de etiquetas usando los resultados filtrados de la vista actual.
// Sin dependencias externas, cambios de stock ni acceso directo a la base de datos.
(() => {
 const boton=document.getElementById('imprimirEtiquetasUbicacion');
 if(!boton)return;
 boton.addEventListener('click',()=>{
  const ubicaciones=window.bodegaUbicacionesFiltradas;
  if(!Array.isArray(ubicaciones)||ubicaciones.length===0){
   alert('No hay ubicaciones para imprimir. Ajusta los filtros o actualiza el listado.');return;
  }
  if(ubicaciones.length>200&&!confirm(`Se imprimirán ${ubicaciones.length} etiquetas. ¿Continuar?`))return;
  if(!window.BodegaQR){alert('No se pudo cargar el generador de QR local.');return;}
  const ventana=window.open('','_blank');
  if(!ventana){alert('Permite las ventanas emergentes para imprimir etiquetas.');return;}
  const d=ventana.document;
  d.title='Etiquetas de ubicaciones — Mapa Bodega AP';
  const meta=d.createElement('meta');meta.setAttribute('charset','utf-8');d.head.appendChild(meta);
  const style=d.createElement('style');
  style.textContent=`@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#1e3558}.toolbar{padding:12px;background:#f0f5fc;display:flex;gap:12px;align-items:center}.toolbar button{background:#23458d;color:white;border:0;border-radius:7px;padding:10px 16px;cursor:pointer}.etiquetas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5mm}.etiqueta{border:1px solid #a7bad4;border-radius:5px;min-height:52mm;padding:4mm 3mm;text-align:center;break-inside:avoid;display:flex;flex-direction:column;justify-content:center;gap:3mm}.qr{width:24mm;height:24mm;margin:0 auto}.qr svg{width:100%;height:100%;display:block}.marca{font-size:9pt;letter-spacing:.07em;color:#536987}.codigo{font-size:14pt;font-weight:800;overflow-wrap:anywhere}.detalle{font-size:9pt;color:#506581}@media print{.toolbar{display:none!important}.etiquetas{gap:4mm}}`;
  d.head.appendChild(style);
  const barra=d.createElement('div');barra.className='toolbar';
  const imprimir=d.createElement('button');imprimir.type='button';imprimir.textContent='Imprimir / Guardar PDF';imprimir.onclick=()=>ventana.print();
  const texto=d.createElement('span');texto.textContent=`${ubicaciones.length} etiquetas · A4`;
  barra.append(imprimir,texto);d.body.appendChild(barra);
  const lista=d.createElement('main');lista.className='etiquetas';
  for(const u of ubicaciones){
   const tarjeta=d.createElement('article');tarjeta.className='etiqueta';
   const marca=d.createElement('div');marca.className='marca';marca.textContent='MAPA BODEGA AP';
   const codigo=d.createElement('div');codigo.className='codigo';codigo.textContent=u.codigo;
   const detalle=d.createElement('div');detalle.className='detalle';detalle.textContent=`Bodega ${u.bodega} · Pasillo ${u.pasillo}`;
   const qr=d.createElement('div');qr.className='qr';
   // QR contiene únicamente el código real, para lectores que ingresan texto.
   try{qr.innerHTML=window.BodegaQR.svg(String(u.codigo));}
   catch(error){console.error('Error generando QR',error);qr.textContent='QR no disponible';}
   tarjeta.append(marca,qr,codigo,detalle);lista.appendChild(tarjeta);
  }
  d.body.appendChild(lista);
  d.close();
 });
})();
