/* Navegación empresarial de solicitudes e historial, sin alterar las operaciones de stock. */
(() => {
  const nueva = document.getElementById('nueva-solicitud');
  const registradas = document.getElementById('solicitudes-registradas');
  const tabs = Array.from(document.querySelectorAll('[data-tab-solicitud]'));
  const botonNueva = document.getElementById('abrirNuevaSolicitud');
  const estado = document.getElementById('filtroEstadoSolicitud');
  const prioridad = document.getElementById('filtroPrioridadSolicitud');
  const buscar = document.getElementById('buscarSolicitudRegistrada');
  const titulo = document.getElementById('tituloListadoSolicitudes');
  const herramientas = document.getElementById('herramientasHistorialEntregas');
  const exportar = document.getElementById('exportarHistorialEntregas');
  const mensaje = document.getElementById('estadoExportacionEntregas');
  const exportarDetallado = document.getElementById('exportarHistorialDetallado');
  const listado = document.getElementById('listaSolicitudes');
  if (!nueva || !registradas || !tabs.length || !estado || !listado) return;
  let vistaActual = '';
  let filtrosGuardados = null;

  function actualizarFiltros() {
    estado.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function activar(vista, actualizarHash = true) {
    if (!['registradas', 'nueva', 'historial'].includes(vista)) vista = 'registradas';
    if (vista === 'historial' && vistaActual !== 'historial') {
      filtrosGuardados = { estado: estado.value, prioridad: prioridad?.value || '', buscar: buscar?.value || '' };
    }
    if (vistaActual === 'historial' && vista !== 'historial' && filtrosGuardados) {
      estado.value = filtrosGuardados.estado;
      if (prioridad) prioridad.value = filtrosGuardados.prioridad;
      if (buscar) buscar.value = filtrosGuardados.buscar;
      filtrosGuardados = null;
    }
    const esNueva = vista === 'nueva';
    const esHistorial = vista === 'historial';
    nueva.hidden = !esNueva;
    registradas.hidden = esNueva;
    if (esHistorial) {
      estado.value = 'ENTREGADA';
      if (prioridad) prioridad.value = '';
    }
    if (herramientas) herramientas.hidden = !esHistorial;
    if (titulo) titulo.textContent = esHistorial ? 'Historial de entregas' : 'Solicitudes registradas';
    tabs.forEach(b => {
      const activo = b.dataset.tabSolicitud === vista;
      b.setAttribute('aria-selected', String(activo));
      b.classList.toggle('activo', activo);
    });
    if (botonNueva) botonNueva.hidden = esNueva;
    vistaActual = vista;
    actualizarFiltros();
    if (actualizarHash && history.replaceState) history.replaceState(null, '', '#' + (esNueva ? 'nueva-solicitud' : esHistorial ? 'historial-entregas' : 'solicitudes-registradas'));
  }
  tabs.forEach(b => b.addEventListener('click', () => activar(b.dataset.tabSolicitud)));
  if (botonNueva) botonNueva.addEventListener('click', () => activar('nueva'));
  function vistaDesdeHash() {
    return location.hash === '#nueva-solicitud' ? 'nueva' : location.hash === '#historial-entregas' ? 'historial' : 'registradas';
  }
  window.addEventListener('hashchange', () => activar(vistaDesdeHash(), false));
  activar(vistaDesdeHash(), false);

  // CSV seguro: neutraliza fórmulas y escapa comillas, comas y saltos de línea.
  function celda(valor) {
    let texto = String(valor ?? '').replace(/\r?\n/g, ' ').trim();
    if (/^[\s]*[=+@-]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  // Exporta eventos persistidos, sin inventar datos de receptor o ubicación.
  exportarDetallado?.addEventListener('click', async () => {
    const tarjetas = Array.from(listado.querySelectorAll('.solicitud-registrada'))
      .filter(t => !t.hidden && t.dataset.estado === 'ENTREGADA');
    if (!tarjetas.length) {
      if (mensaje) mensaje.textContent = 'No hay entregas visibles para exportar.';
      return;
    }
    exportarDetallado.disabled = true;
    const filas = [['Solicitud', 'Acción', 'Fecha registrada', 'Usuario registrado']];
    let errores = 0;
    let completadas = 0;
    try {
      // Consultas en lotes para evitar saturar el servidor.
      for (let i = 0; i < tarjetas.length; i += 4) {
        await Promise.all(tarjetas.slice(i, i + 4).map(async tarjeta => {
          const id = tarjeta.dataset.solicitudId;
          if (!/^\d+$/.test(String(id || ''))) { errores++; return; }
          try {
            const respuesta = await fetch(`/api/solicitudes/${encodeURIComponent(id)}/historial`, {
              credentials: 'same-origin', headers: { Accept: 'application/json' }
            });
            if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
            const eventos = await respuesta.json();
            if (!Array.isArray(eventos)) throw new Error('Historial inválido');
            eventos.forEach(e => filas.push([id, e.accion || '', e.fecha || '', e.usuario || '']));
            completadas++;
          } catch (_) { errores++; }
        }));
        if (mensaje) mensaje.textContent = `Consultadas ${Math.min(i + 4, tarjetas.length)} de ${tarjetas.length} solicitudes...`;
      }
      if (errores) {
        if (mensaje) mensaje.textContent = `No se descargó el archivo: falló la consulta de ${errores} solicitud(es). Intenta nuevamente.`;
        return; // Nunca presentar un informe parcial como completo.
      }
      const csv = '\uFEFF' + filas.map(f => f.map(celda).join(';')).join('\r\n');
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'trazabilidad-entregas-' + new Date().toISOString().slice(0, 10) + '.csv';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (mensaje) mensaje.textContent = `${completadas} solicitudes consultadas; ${filas.length - 1} eventos exportados.`;
    } finally {
      exportarDetallado.disabled = false;
    }
  });

  // Comprobante imprimible. El documento distingue cantidades solicitadas
  // de entregas parciales registradas: no supone cantidades finales inexistentes.
  const imprimirComprobante = document.getElementById('imprimirComprobanteEntrega');
  function textoCampo(tarjeta, etiqueta) {
    const parrafo = Array.from(tarjeta.querySelectorAll('p')).find(p =>
      p.querySelector('strong')?.textContent.trim().replace(/:$/, '') === etiqueta);
    return parrafo?.textContent.replace(/\s+/g, ' ').replace(new RegExp('^' + etiqueta + ':\\s*'), '').trim() || 'No registrado';
  }
  function escaparHtml(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, c => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    })[c]);
  }
  imprimirComprobante?.addEventListener('click', async () => {
    const seleccion = Array.from(listado.querySelectorAll('.solicitud-registrada'))
      .filter(t => !t.hidden && t.dataset.estado === 'ENTREGADA');
    if (!seleccion.length) {
      if (mensaje) mensaje.textContent = 'No hay solicitudes entregadas visibles para generar un comprobante.';
      return;
    }
    const numero = prompt('Número de solicitud entregada para imprimir:', seleccion[0].dataset.solicitudId);
    if (numero === null) return;
    const tarjeta = seleccion.find(t => t.dataset.solicitudId === numero.trim());
    if (!tarjeta) {
      if (mensaje) mensaje.textContent = 'Selecciona el número de una solicitud entregada visible.';
      return;
    }
    const ventana = window.open('', '_blank');
    if (!ventana) {
      if (mensaje) mensaje.textContent = 'Habilita las ventanas emergentes para generar el comprobante.';
      return;
    }
    ventana.document.write('<!doctype html><html lang="es"><meta charset="utf-8"><title>Preparando comprobante</title><p>Verificando entregas registradas...</p></html>');
    imprimirComprobante.disabled = true;
    try {
      const respuesta = await fetch(`/api/solicitudes/${encodeURIComponent(numero.trim())}/entregas-parciales`, {
        credentials: 'same-origin', headers: { Accept: 'application/json' }, cache: 'no-store'
      });
      if (!respuesta.ok) throw new Error('No se pudo verificar el historial de entregas (HTTP ' + respuesta.status + ').');
      const datos = await respuesta.json();
      if (String(datos.solicitudId) !== numero.trim() || !Array.isArray(datos.entregas))
        throw new Error('La respuesta del historial de entregas no es válida.');
      const productos = Array.from(tarjeta.querySelectorAll('.producto-solicitud-registrada'))
        .map(el => el.textContent.replace(/\s+/g, ' ').trim());
      const parciales = datos.entregas.flatMap(entrega =>
        (entrega.productos || []).map(p => ({ fecha: entrega.fecha || 'No disponible',
          producto: 'Producto #' + p.productoId, cantidad: p.cantidad,
          usuario: entrega.usuarioId ?? 'No disponible' })));
      const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Comprobante solicitud #${escaparHtml(numero)}</title>
<style>body{font:14px Arial,sans-serif;color:#17253b;max-width:820px;margin:35px auto;padding:20px}
header{border-bottom:3px solid #2453a0;padding-bottom:16px}h1{font-size:24px;margin-bottom:4px}
h2{font-size:17px;margin-top:28px}.sub{color:#52657e}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.info{padding:10px;background:#f4f7fb;border-radius:6px}table{border-collapse:collapse;width:100%;margin-top:12px}
th,td{text-align:left;padding:10px;border-bottom:1px solid #d9e0ea}th{background:#eef3fa}
.firmas{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:85px}
.firma{border-top:1px solid #333;text-align:center;padding-top:8px}.nota{font-size:12px;color:#536273;margin-top:15px}
@media print{body{margin:0;max-width:none}.info{print-color-adjust:exact}}</style></head><body>
<header><h1>Comprobante de entrega</h1><div class="sub">Mapa Bodega AP Empresarial · Solicitud #${escaparHtml(numero)} · Estado: ENTREGADA</div></header>
<h2>Información de la solicitud</h2><div class="grid">
<div class="info"><strong>Proyecto</strong><div>${escaparHtml(textoCampo(tarjeta, 'Proyecto'))}</div></div>
<div class="info"><strong>Supervisor</strong><div>${escaparHtml(textoCampo(tarjeta, 'Supervisor'))}</div></div>
<div class="info"><strong>Solicitado para</strong><div>${escaparHtml(textoCampo(tarjeta, 'Solicitado para'))}</div></div>
<div class="info"><strong>Fecha de solicitud</strong><div>${escaparHtml(textoCampo(tarjeta, 'Fecha'))}</div></div></div>
<h2>Productos de la solicitud</h2><table><thead><tr><th>Descripción y cantidad solicitada</th></tr></thead>
<tbody>${productos.map(p => `<tr><td>${escaparHtml(p)}</td></tr>`).join('')}</tbody></table>
<p class="nota">Estas cantidades corresponden a lo solicitado. El estado ENTREGADA se consulta del registro de la solicitud; este comprobante no reemplaza el registro de movimientos de inventario.</p>
<h2>Entregas parciales registradas</h2>
${parciales.length ? `<table><thead><tr><th>Fecha</th><th>Producto</th><th>Cantidad</th><th>Usuario ID</th></tr></thead><tbody>${parciales.map(e => `<tr><td>${escaparHtml(e.fecha)}</td><td>${escaparHtml(e.producto)}</td><td>${escaparHtml(e.cantidad)}</td><td>${escaparHtml(e.usuario)}</td></tr>`).join('')}</tbody></table>` : '<p>No hay entregas parciales registradas para esta solicitud.</p>'}
<div class="firmas"><div class="firma">Firma de quien entrega</div><div class="firma">Firma de quien recibe</div></div>
<p class="nota">Documento generado el ${escaparHtml(new Date().toLocaleString('es-CL'))}. Las firmas son espacios para completar al momento de la recepción; no representan una recepción firmada.</p>
</body></html>`;
      ventana.document.open(); ventana.document.write(html); ventana.document.close();
      ventana.focus();
      if (mensaje) mensaje.textContent = `Comprobante de solicitud #${numero} abierto para imprimir o guardar como PDF.`;
    } catch (error) {
      ventana.close();
      if (mensaje) mensaje.textContent = error.message || 'No se pudo generar el comprobante.';
    } finally {
      imprimirComprobante.disabled = false;
    }
  });

  exportar?.addEventListener('click', () => {
    const tarjetas = Array.from(listado.querySelectorAll('.solicitud-registrada'))
      .filter(t => !t.hidden && t.dataset.estado === 'ENTREGADA');
    if (!tarjetas.length) {
      if (mensaje) mensaje.textContent = 'No hay entregas visibles para exportar.';
      return;
    }
    const filas = [['Solicitud', 'Estado', 'Prioridad', 'Resumen visible']];
    tarjetas.forEach(t => {
      const id = t.dataset.solicitudId || '';
      const resumen = Array.from(t.querySelectorAll('.producto-solicitud-registrada'))
        .map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
      filas.push([id, t.dataset.estado, t.dataset.prioridad || '', resumen]);
    });
    const csv = '\uFEFF' + filas.map(f => f.map(celda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'historial-entregas-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    if (mensaje) mensaje.textContent = `${tarjetas.length} entregas exportadas.`;
  });
})();
