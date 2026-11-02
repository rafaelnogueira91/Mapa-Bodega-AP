'use strict';
(() => {
  const el = id => document.getElementById(id);
  let resultado = null;
  let solicitudHistorial = 0;
  let filtrado = { cantidades: [], series: [], entregasSeries: [], trazabilidadSeries: [], devolucionesPorRevisar: [] };
  const normalizar = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function aplicarFiltros() {
    if (!resultado) return;
    const buscar = normalizar(el('buscar').value.trim());
    const ubicacion = normalizar(el('ubicacion').value.trim());
    const tipo = el('tipo').value;
    const problema = normalizar(el('problema').value.trim());
    filtrado.cantidades = (tipo === 'SERIE' || tipo === 'ENTREGA' || tipo === 'TRAZABILIDAD' || tipo === 'DEVOLUCION') ? [] : resultado.cantidades.filter(c =>
      (!buscar || normalizar([c.producto, c.codigo, c.producto_codigo].join(' ')).includes(buscar)) &&
      (!ubicacion || normalizar(c.ubicacion).includes(ubicacion)) && (!problema || normalizar('Diferencia de inventario').includes(problema)));
    filtrado.series = (tipo === 'CANTIDAD' || tipo === 'ENTREGA' || tipo === 'TRAZABILIDAD' || tipo === 'DEVOLUCION') ? [] : resultado.series.filter(c =>
      (!buscar || normalizar([c.numero_serie, c.producto, c.codigo].join(' ')).includes(buscar)) &&
      (!ubicacion || normalizar(c.ubicacion_codigo).includes(ubicacion)) &&
      (!problema || normalizar(c.problema).includes(problema)));
    filtrado.entregasSeries = (tipo === 'CANTIDAD' || tipo === 'SERIE' || tipo === 'TRAZABILIDAD' || tipo === 'DEVOLUCION') ? [] : resultado.entregasSeries.filter(c =>
      (!buscar || normalizar([c.numero_serie, c.entrega_id, c.proyecto_id, c.personal_id].join(' ')).includes(buscar)) &&
      (!ubicacion || normalizar([c.ubicacion_codigo, c.ubicacion_id].join(' ')).includes(ubicacion)) &&
      (!problema || normalizar(c.problema).includes(problema)));
    filtrado.trazabilidadSeries = (tipo !== 'TODOS' && tipo !== 'TRAZABILIDAD') ? [] : resultado.trazabilidadSeries.filter(c =>
      (!buscar || normalizar(c.numero_serie).includes(buscar)) &&
      (!ubicacion || normalizar(c.ubicacion_codigo).includes(ubicacion)) &&
      (!problema || normalizar(c.problema).includes(problema)));
    filtrado.devolucionesPorRevisar = (tipo !== 'TODOS' && tipo !== 'DEVOLUCION') ? [] : resultado.devolucionesPorRevisar.filter(c =>
      (!buscar || normalizar([c.numero_serie, c.ultima_entrega_id, c.proyecto_id, c.personal_id].join(' ')).includes(buscar)) &&
      (!ubicacion || normalizar(c.ubicacion_codigo).includes(ubicacion)) &&
      (!problema || normalizar(c.problema).includes(problema)));
    mostrarFilas('devolucionesPorRevisar', filtrado.devolucionesPorRevisar, ['numero_serie', 'estado', 'ultima_entrega_id', 'proyecto_id', 'personal_id', 'fecha_devolucion', 'ubicacion_codigo', 'problema']);
    mostrarFilas('trazabilidadSeries', filtrado.trazabilidadSeries, ['numero_serie', 'estado', 'ultimo_movimiento', 'origen_movimiento', 'fecha_movimiento', 'ubicacion_codigo', 'problema']);
    mostrarFilas('cantidades', filtrado.cantidades, ['producto', 'ubicacion', 'fisico', 'reservado', 'libre']);
    mostrarFilas('series', filtrado.series, ['numero_serie', 'estado', 'ubicacion_codigo', 'problema']);
    mostrarFilas('entregasSeries', filtrado.entregasSeries, ['numero_serie', 'entrega_id', 'proyecto_id', 'personal_id', 'estado', 'ubicacion_codigo', 'problema']);
    const visibles = filtrado.cantidades.length + filtrado.series.length + filtrado.entregasSeries.length + filtrado.trazabilidadSeries.length + filtrado.devolucionesPorRevisar.length;
    el('visibles').textContent = `Mostrando ${visibles} de ${resultado.cantidades.length + resultado.series.length + resultado.entregasSeries.length + resultado.trazabilidadSeries.length + resultado.devolucionesPorRevisar.length} inconsistencias cargadas`;
    el('exportar').disabled = visibles === 0;
  }
  function celda(tr, valor) {
    const td = document.createElement('td');
    td.textContent = valor == null || valor === '' ? '—' : String(valor);
    tr.appendChild(td);
  }
  async function verHistorial(serie) {
    const solicitud = ++solicitudHistorial;
    const panel = el('panelHistorial');
    panel.hidden = false;
    el('estadoHistorial').textContent = 'Consultando historial de ' + serie + '...';
    el('detalleHistorial').replaceChildren();
    try {
      const res = await fetch('/api/admin/auditoria-inventario/historial-serie?serie=' + encodeURIComponent(serie),
        { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) throw new Error(res.status === 403 ? 'Sin permisos para consultar el historial' : 'No fue posible obtener el historial');
      const datos = await res.json();
      if (solicitud !== solicitudHistorial || panel.hidden) return;
      if (!datos?.herramienta || !Array.isArray(datos.movimientos) || !Array.isArray(datos.entregas))
        throw new Error('El servidor devolvió un historial incompleto.');
      el('estadoHistorial').textContent = datos.herramienta.numero_serie + ' · ' + datos.herramienta.estado + ' · ' + (datos.herramienta.ubicacion || 'Sin ubicación');
      const contenedor = el('detalleHistorial');
      if (Array.isArray(datos.eventos)) {
        const titulo = document.createElement('h3'); titulo.textContent = 'Cronología de movimientos y entregas (más reciente primero)';
        contenedor.appendChild(titulo);
        const tabla = document.createElement('table');
        const thead = document.createElement('thead'), cabecera = document.createElement('tr');
        for (const texto of ['Fecha', 'Evento', 'Detalle', 'Trabajador', 'Ubicación']) {
          const th = document.createElement('th'); th.textContent = texto; cabecera.appendChild(th);
        }
        thead.appendChild(cabecera); tabla.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const evento of datos.eventos) {
          const tr = document.createElement('tr');
          for (const valor of [evento.fecha, evento.tipo, evento.descripcion, evento.personal_id, evento.ubicacion]) celda(tr, valor);
          tbody.appendChild(tr);
        }
        if (!datos.eventos.length) {
          const tr = document.createElement('tr'), td = document.createElement('td');
          td.colSpan = 5; td.textContent = 'Sin eventos registrados'; tr.appendChild(td); tbody.appendChild(tr);
        }
        tabla.appendChild(tbody); contenedor.appendChild(tabla);
      }
      for (const [titulo, filas, campos] of [
        ['Movimientos recientes', datos.movimientos, ['id', 'tipo_movimiento', 'fecha_movimiento', 'personal_id', 'ubicacion']],
        ['Entregas a proyectos', datos.entregas, ['id', 'proyecto_id', 'personal_id', 'fecha_entrega', 'fecha_devolucion']]
      ]) {
        const h = document.createElement('h3'); h.textContent = titulo; contenedor.appendChild(h);
        const tabla = document.createElement('table');
        const encabezado = document.createElement('tr');
        for (const campo of campos) { const th = document.createElement('th'); th.textContent = campo.replace(/_/g, ' '); encabezado.appendChild(th); }
        const thead = document.createElement('thead'); thead.appendChild(encabezado); tabla.appendChild(thead);
        const tbody = document.createElement('tbody');
        for (const fila of filas) {
          const tr = document.createElement('tr');
          for (const campo of campos) celda(tr, fila[campo]);
          tbody.appendChild(tr);
        }
        if (!filas.length) {
          const tr = document.createElement('tr'), td = document.createElement('td');
          td.colSpan = campos.length; td.textContent = 'Sin registros'; tr.appendChild(td); tbody.appendChild(tr);
        }
        tabla.appendChild(tbody); contenedor.appendChild(tabla);
      }
      if (datos.movimientos.length === 100 || datos.entregas.length === 100) {
        const nota = document.createElement('p');
        nota.textContent = 'Se muestran los últimos 100 registros por historial.';
        contenedor.appendChild(nota);
      }
    } catch (error) {
      if (solicitud === solicitudHistorial && !panel.hidden)
        el('estadoHistorial').textContent = error.message;
    }
  }
  function mostrarFilas(id, filas, campos) {
    const cuerpo = el(id);
    cuerpo.replaceChildren();
    if (!filas.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = campos.length + (id === 'cantidades' ? 0 : 1);
      td.className = 'empty';
      td.textContent = 'Sin inconsistencias detectadas';
      tr.appendChild(td);
      cuerpo.appendChild(tr);
      return;
    }
    for (const fila of filas) {
      const tr = document.createElement('tr');
      for (const campo of campos) celda(tr, fila[campo]);
      if (id !== 'cantidades' && fila.numero_serie) {
        const td = document.createElement('td'), boton = document.createElement('button');
        boton.type = 'button'; boton.textContent = 'Ver historial';
        boton.addEventListener('click', () => verHistorial(fila.numero_serie));
        td.appendChild(boton); tr.appendChild(td);
      }
      cuerpo.appendChild(tr);
    }
  }
  async function actualizar() {
    const boton = el('actualizar');
    boton.disabled = true;
    el('mensaje').className = '';
    el('mensaje').textContent = 'Consultando inventario...';
    try {
      const res = await fetch('/api/admin/auditoria-inventario', { credentials: 'same-origin', cache: 'no-store' });
      if (res.status === 401) throw new Error('La sesión expiró. Inicia sesión nuevamente.');
      if (res.status === 403) throw new Error('Solo los roles ADMIN y BODEGA pueden ver la auditoría.');
      if (!res.ok) throw new Error('No fue posible consultar la auditoría. Comprueba que las tablas de proyectos estén inicializadas.');
      const datos = await res.json();
      if (!Array.isArray(datos.cantidades) || !Array.isArray(datos.series) || !Array.isArray(datos.entregasSeries) || !Array.isArray(datos.trazabilidadSeries) || !Array.isArray(datos.devolucionesPorRevisar)) throw new Error('Respuesta inesperada del servidor.');
      resultado = datos;
      el('totalCant').textContent = datos.resumen?.inconsistencias_cantidad ?? datos.cantidades.length;
      el('totalSerie').textContent = datos.resumen?.inconsistencias_series ?? datos.series.length;
      el('totalEntrega').textContent = datos.resumen?.inconsistencias_entregas_series ?? datos.entregasSeries.length;
      el('totalDevol').textContent = datos.resumen?.devoluciones_por_revisar ?? datos.devolucionesPorRevisar.length;
      el('totalTraza').textContent = datos.resumen?.inconsistencias_trazabilidad ?? datos.trazabilidadSeries.length;
      el('total').textContent = datos.cantidades.length + datos.series.length + datos.entregasSeries.length + datos.trazabilidadSeries.length + datos.devolucionesPorRevisar.length;
      el('fecha').textContent = 'Generado: ' + new Date(datos.generado_en).toLocaleString('es-CL');
      aplicarFiltros();
      const limite = Number(datos.limite_por_categoria) || 500;
      const truncado = datos.cantidades.length >= limite || datos.series.length >= limite || datos.entregasSeries.length >= limite || datos.trazabilidadSeries.length >= limite || datos.devolucionesPorRevisar.length >= limite;
      el('mensaje').className = truncado ? 'error' : 'ok';
      el('mensaje').textContent = truncado ? 'Atención: se alcanzó el límite de resultados. El listado puede estar incompleto.' : 'Auditoría completada. No se modificaron existencias.';
    } catch (error) {
      resultado = null;
      el('exportar').disabled = true;
      el('visibles').textContent = '';
      el('mensaje').className = 'error';
      el('mensaje').textContent = error.message;
    } finally { boton.disabled = false; }
  }
  function csvCelda(valor) {
    let str = String(valor ?? '');
    if (/^\s*[=+@-]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  }
  function exportar() {
    if (!resultado) return;
    const encabezado = ['Tipo', 'Producto / Serie', 'Ubicación / Estado', 'Físico', 'Reservado', 'Libre', 'Problema'];
    const filas = [encabezado];
    for (const c of filtrado.cantidades) filas.push(['CANTIDAD', c.producto, c.ubicacion, c.fisico, c.reservado, c.libre, 'Diferencia de inventario']);
    for (const s of filtrado.series) filas.push(['SERIE', s.numero_serie, (s.ubicacion_codigo || 'Sin ubicación') + ' / ' + s.estado, '', '', '', s.problema]);
    for (const e of filtrado.entregasSeries) filas.push(['ENTREGA', e.numero_serie, 'Entrega ' + e.entrega_id + ' / proyecto ' + e.proyecto_id + ' / trabajador ' + e.personal_id + ' / ubicación ' + (e.ubicacion_codigo || 'Sin ubicación'), '', '', '', e.problema]);
    for (const t of filtrado.trazabilidadSeries) filas.push(['TRAZABILIDAD', t.numero_serie, (t.ubicacion_codigo || 'Sin ubicación') + ' / ' + t.estado, '', '', '', t.problema + ' (último movimiento: ' + t.ultimo_movimiento + '; origen: ' + t.origen_movimiento + ')']);
    for (const d of filtrado.devolucionesPorRevisar) filas.push(['DEVOLUCION POR REVISAR', d.numero_serie, 'Entrega ' + d.ultima_entrega_id + ' / proyecto ' + d.proyecto_id + ' / trabajador ' + d.personal_id + ' / fecha ' + d.fecha_devolucion, '', '', '', d.problema]);
    const csv = '\uFEFF' + filas.map(f => f.map(csvCelda).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = 'auditoria-inventario-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (const id of ['buscar', 'ubicacion', 'problema']) el(id).addEventListener('input', aplicarFiltros);
  el('tipo').addEventListener('change', aplicarFiltros);
  el('limpiar').addEventListener('click', () => { for (const id of ['buscar', 'ubicacion', 'problema']) el(id).value = ''; el('tipo').value = 'TODOS'; aplicarFiltros(); });
  el('cerrarHistorial').addEventListener('click', () => {
    ++solicitudHistorial;
    el('panelHistorial').hidden = true;
    el('detalleHistorial').replaceChildren();
  });
  el('actualizar').addEventListener('click', actualizar);
  el('exportar').addEventListener('click', exportar);
  actualizar();
})();
