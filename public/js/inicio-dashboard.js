(() => {
  const buscador = document.getElementById('buscarModulo');
  const tarjetas = [...document.querySelectorAll('#listaModulos .modulo')];
  const sinResultados = document.getElementById('sinModulos');
  if (!buscador || !sinResultados) return;
  const normalizar = texto => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  buscador.addEventListener('input', () => {
    const filtro = normalizar(buscador.value.trim());
    let visibles = 0;
    for (const tarjeta of tarjetas) {
      const mostrar = normalizar(tarjeta.textContent).includes(filtro);
      tarjeta.hidden = !mostrar;
      if (mostrar) visibles++;
    }
    sinResultados.hidden = visibles !== 0;
  });
})();

// Indicadores del inicio: datos reales del servidor; nunca se inventan cifras.
(() => {
  const status = document.getElementById('resumenEstado');
  const boton = document.getElementById('actualizarResumen');
  const alertas = document.getElementById('resumenAlertas');
  if (!status || !boton) return;
  const ids = {productos:'kpiProductos', pendientes:'kpiPendientes', unidades:'kpiUnidades', movimientos:'kpiMovimientos'};
  const numero = valor => Number.isFinite(Number(valor)) && Number(valor) >= 0
    ? Number(valor).toLocaleString('es-CL') : '—';
  let cargando = false;
  async function actualizar() {
    if (cargando) return;
    cargando = true;
    boton.disabled = true;
    status.textContent = 'Actualizando indicadores…';
    try {
      const respuesta = await fetch('/api/v5/resumen', {credentials:'same-origin', cache:'no-store'});
      if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
      const datos = await respuesta.json();
      for (const [campo,id] of Object.entries(ids)) {
        const el = document.getElementById(id);
        if (el) el.textContent = numero(datos[campo]);
      }
      status.textContent = 'Datos actuales del sistema';
      // Alertas complementarias; si fallan no se ocultan los indicadores válidos.
      try {
        const respuestaAlertas = await fetch('/api/v5/alertas', {credentials:'same-origin', cache:'no-store'});
        if (!respuestaAlertas.ok) throw new Error('Alertas no disponibles');
        const datosAlertas = await respuestaAlertas.json();
        const negativos = Array.isArray(datosAlertas.negativos) ? datosAlertas.negativos.length : 0;
        const duplicados = Array.isArray(datosAlertas.duplicados) ? datosAlertas.duplicados.length : 0;
        alertas.hidden = false;
        alertas.replaceChildren();
        const mensaje = document.createElement('p');
        mensaje.textContent = negativos || duplicados
          ? `Atención: ${negativos} registros con stock negativo y ${duplicados} grupos de stock duplicado. Revisa la auditoría.`
          : 'Sin alertas de stock negativo ni registros duplicados detectados.';
        alertas.appendChild(mensaje);
        if (negativos || duplicados) {
          const enlace = document.createElement('a');
          enlace.href = 'auditoria-inventario.html';
          enlace.textContent = 'Revisar auditoría →';
          alertas.appendChild(enlace);
          alertas.classList.add('ap-panel-alertas-advertencia');
        } else alertas.classList.remove('ap-panel-alertas-advertencia');
      } catch (_) { alertas.hidden = true; }
    } catch (_) {
      status.textContent = 'No se pudieron cargar los indicadores. Comprueba la conexión o tu sesión e intenta actualizar.';
      // Los datos previos permanecen visibles; no se reemplazan por ceros falsos.
    } finally {
      cargando = false;
      boton.disabled = false;
    }
  }
  boton.addEventListener('click', actualizar);
  actualizar();
})();
