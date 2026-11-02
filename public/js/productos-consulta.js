// Consulta de solo lectura: no altera el formulario de registro existente.
(() => {
  const entrada = document.getElementById('buscarConsultaProductos');
  const lista = document.getElementById('listaConsultaProductos');
  const estado = document.getElementById('estadoConsultaProductos');
  const actualizar = document.getElementById('actualizarConsultaProductos');
  const filtroVencimiento = document.getElementById('filtroVencimientoProductos');
  const resumenVencimiento = document.getElementById('resumenVencimientoProductos');
  const panelAlertas = document.getElementById('panelAlertasVencimientoProductos');
  const filtroStock = document.getElementById('filtroStockProductos');
  const ordenProductos = document.getElementById('ordenProductos');
  const limpiarFiltros = document.getElementById('limpiarFiltrosProductos');
  const estadoFiltros = document.getElementById('estadoFiltrosProductos');
  const exportarFiltrados = document.getElementById('exportarProductosFiltrados');
  if (!entrada || !lista || !estado || !actualizar) return;
  let productos = [];
  let disponibilidad = new Map();
  let minimos = new Map();
  let vencimientos = new Map();
  let vencimientosSeries = new Map();
  let solicitud = 0;
  let productosVisibles = [];
  const kpis = {
    total: document.getElementById('kpiTotalProductos'),
    disponibles: document.getElementById('kpiConStock'),
    sinStock: document.getElementById('kpiSinStock'),
    reposicion: document.getElementById('kpiReposicion')
  };
  const estadoResumen = document.getElementById('estadoResumenExistencias');
  let stockActualizado = false;
  let minimosActualizados = false;
  function actualizarIndicadores() {
    if (!kpis.total) return;
    kpis.total.textContent = String(productos.length);
    const conDatos = productos.filter(p => {
      const n = Number(disponibilidad.get(Number(p.id))?.libre);
      return disponibilidad.has(Number(p.id)) && Number.isFinite(n);
    });
    const libres = p => Number(disponibilidad.get(Number(p.id)).libre);
    kpis.disponibles.textContent = stockActualizado ? String(conDatos.filter(p => libres(p) > 0).length) : '—';
    kpis.sinStock.textContent = stockActualizado ? String(conDatos.filter(p => libres(p) <= 0).length) : '—';
    kpis.reposicion.textContent = stockActualizado && minimosActualizados
      ? String(conDatos.filter(p => { const minimo = minimos.get(Number(p.id)); return Number.isFinite(minimo) && minimo > 0 && libres(p) <= minimo; }).length)
      : '—';
    if (estadoResumen) estadoResumen.textContent = !stockActualizado
      ? 'Disponibilidad no disponible: los indicadores de stock se muestran sin dato.'
      : !minimosActualizados
        ? 'Mínimos no disponibles: no se puede calcular la reposición.'
        : conDatos.length < productos.length
          ? `Disponibilidad informada para ${conDatos.length} de ${productos.length} productos.`
          : 'Indicadores calculados con las existencias actuales.';
  }
  document.querySelectorAll('#resumenExistencias [data-filtro-stock]').forEach(boton => {
    boton.addEventListener('click', () => {
      if (!filtroStock) return;
      filtroStock.value = boton.dataset.filtroStock;
      renderizar();
      document.getElementById('estadoFiltrosProductos')?.scrollIntoView({behavior:'smooth',block:'nearest'});
    });
  });

  const normalizar = valor => String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function clasificarFecha(fechaTexto, aviso, hoy) {
    if (!fechaTexto) return 'sin-fecha';
    const fecha = new Date(`${fechaTexto}T00:00:00`);
    if (Number.isNaN(fecha.getTime())) return 'sin-fecha';
    const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
    if (dias < 0) return 'vencidos';
    if (dias <= Number(aviso ?? 30)) return 'proximos';
    return 'vigentes';
  }
  function estadosVencimiento(p, hoy) {
    const estados = [];
    const ficha = vencimientos.get(Number(p.id));
    if (ficha?.fechaVencimiento) estados.push(clasificarFecha(ficha.fechaVencimiento, ficha.avisoDias, hoy));
    for (const serie of vencimientosSeries.get(Number(p.id)) || []) {
      estados.push(clasificarFecha(serie.fechaVencimiento, serie.avisoDias, hoy));
    }
    return estados.length ? estados : ['sin-fecha'];
  }
  function estadoVencimiento(p, hoy) {
    const estados = estadosVencimiento(p, hoy);
    return ['vencidos', 'proximos', 'vigentes', 'sin-fecha'].find(e => estados.includes(e));
  }
  function renderizar() {
    const texto = normalizar(entrada.value.trim());
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const filtro = filtroVencimiento?.value || 'todos';
    const stockLibre = p => {
      const dato = disponibilidad.get(Number(p.id));
      return dato ? Number(dato.libre) : null;
    };
    const cumpleStock = p => {
      const modo = filtroStock?.value || 'todos';
      const libre = stockLibre(p);
      if (modo === 'todos') return true;
      if (libre === null || !Number.isFinite(libre)) return false;
      if (modo === 'disponibles') return libre > 0;
      if (modo === 'sin-stock') return libre <= 0;
      if (modo === 'bajo-minimo') {
        const minimo = minimos.get(Number(p.id));
        return Number.isFinite(minimo) && minimo > 0 && libre <= minimo;
      }
      return true;
    };
    const visibles = productos.filter(p => normalizar([p.codigo, p.nombre, p.descripcion, p.ubicacion].join(' ')).includes(texto) && (filtro === 'todos' || estadosVencimiento(p, hoy).includes(filtro)) && cumpleStock(p));
    const comparadorTexto = (a,b) => String(a ?? '').localeCompare(String(b ?? ''), 'es', {numeric:true, sensitivity:'base'});
    const orden = ordenProductos?.value || 'nombre';
    visibles.sort((a,b) => {
      if (orden === 'nombre-desc') return comparadorTexto(b.nombre,a.nombre);
      if (orden === 'codigo') return comparadorTexto(a.codigo,b.codigo);
      if (orden === 'stock-asc' || orden === 'stock-desc') {
        const sa = stockLibre(a), sb = stockLibre(b);
        if (sa === null) return sb === null ? comparadorTexto(a.nombre,b.nombre) : 1;
        if (sb === null) return -1;
        return (orden === 'stock-asc' ? sa - sb : sb - sa) || comparadorTexto(a.nombre,b.nombre);
      }
      return comparadorTexto(a.nombre,b.nombre);
    });
    productosVisibles = visibles;
    if (estadoFiltros) estadoFiltros.textContent = `Mostrando ${visibles.length} de ${productos.length} productos`;

    if (resumenVencimiento) {
      const conteo = {vencidos:0,proximos:0,vigentes:0,'sin-fecha':0};
      productos.forEach(p => { for (const estado of new Set(estadosVencimiento(p,hoy))) conteo[estado]++; });
      resumenVencimiento.textContent = 'Resumen de vencimientos por producto (un producto puede aparecer en más de una categoría).';
      if (panelAlertas) {
        panelAlertas.replaceChildren();
        for (const [clave, titulo, clase] of [['vencidos','Vencidos','critico'], ['proximos','Próximos a vencer','advertencia'], ['vigentes','Vigentes','correcto'], ['sin-fecha','Sin fecha','neutro']]) {
          const boton = document.createElement('button');
          boton.type = 'button';
          boton.className = `ap-alerta-resumen ap-alerta-${clase}`;
          boton.setAttribute('aria-pressed', String(filtro === clave));
          boton.setAttribute('aria-label', `Mostrar productos ${titulo.toLowerCase()}: ${conteo[clave]}`);
          const cantidad = document.createElement('b'); cantidad.textContent = String(conteo[clave]);
          const etiqueta = document.createElement('span'); etiqueta.textContent = titulo;
          boton.append(cantidad, etiqueta);
          boton.addEventListener('click', () => { filtroVencimiento.value = filtroVencimiento.value === clave ? 'todos' : clave; renderizar(); });
          panelAlertas.append(boton);
        }
      }
    }
    lista.replaceChildren();
    for (const p of visibles) {
      const tarjeta = document.createElement('article');
      tarjeta.className = 'ap-inventario-item';
      const estados = estadosVencimiento(p, hoy);
      if (estados.includes('vencidos')) tarjeta.classList.add('ap-inventario-vencido');
      else if (estados.includes('proximos')) tarjeta.classList.add('ap-inventario-proximo');
      const nombre = document.createElement('strong');
      nombre.textContent = p.nombre || 'Sin nombre';
      const codigo = document.createElement('span');
      codigo.textContent = `Código: ${p.codigo || 'Sin código'}`;
      const tipo = document.createElement('span');
      tipo.textContent = `Control: ${p.tipo_control === 'SERIE' ? 'Por serie' : p.tipo_control === 'CANTIDAD' ? 'Por cantidad' : 'No indicado'}`;
      tarjeta.append(nombre, codigo, tipo);
      if (estados.includes('vencidos') || estados.includes('proximos')) {
        const aviso = document.createElement('p');
        aviso.className = estados.includes('vencidos') ? 'ap-estado-vencimiento ap-estado-critico' : 'ap-estado-vencimiento ap-estado-advertencia';
        aviso.textContent = estados.includes('vencidos') ? 'Requiere revisión: contiene vencimientos expirados' : 'Atención: contiene vencimientos próximos';
        tarjeta.append(aviso);
      }
      const stock = disponibilidad.get(Number(p.id));
      if (stock) {
        const cifras = document.createElement('div');
        cifras.className = 'ap-inventario-stock';
        for (const [etiqueta, valor] of [['Físico', stock.total], ['Reservado', stock.reservado], ['Libre', stock.libre]]) {
          const celda = document.createElement('div');
          const titulo = document.createElement('small');
          titulo.textContent = etiqueta;
          const numero = document.createElement('b');
          numero.textContent = String(valor);
          celda.append(titulo, numero);
          cifras.append(celda);
        }
        tarjeta.append(cifras);
      }
      const series = vencimientosSeries.get(Number(p.id)) || [];
      if (series.length) {
        const conteoSeries = {vencidos:0,proximos:0,vigentes:0};
        for (const serie of series) {
          const estadoSerie = clasificarFecha(serie.fechaVencimiento, serie.avisoDias, hoy);
          if (conteoSeries[estadoSerie] !== undefined) conteoSeries[estadoSerie]++;
        }
        const resumen = document.createElement('p');
        resumen.className = 'ap-stock-alerta';
        resumen.textContent = `Series con fecha: ${series.length} · Vencidas: ${conteoSeries.vencidos} · Próximas: ${conteoSeries.proximos} · Vigentes: ${conteoSeries.vigentes}`;
        tarjeta.append(resumen);
      }
      const minimo = minimos.get(Number(p.id)) ?? 0;
      const stockLibre = stock ? Number(stock.libre) : null;
      if (minimo > 0 && stockLibre !== null && stockLibre <= minimo) {
        const alerta = document.createElement('p');
        alerta.className = 'ap-stock-alerta';
        alerta.textContent = stockLibre === 0 ? `Sin stock libre · mínimo ${minimo}` : `Reposición necesaria · ${stockLibre} libres, mínimo ${minimo}`;
        tarjeta.append(alerta);
      }
      // Control opcional de vencimiento por ficha; no altera el registro original.
      const vencimiento = vencimientos.get(Number(p.id));
      if (vencimiento) {
        const hoy = new Date(); hoy.setHours(0,0,0,0);
        const fecha = new Date(`${vencimiento.fechaVencimiento}T00:00:00`);
        const dias = Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
        if (dias <= Number(vencimiento.avisoDias)) {
          const alertaVencimiento = document.createElement('p');
          alertaVencimiento.className = 'ap-stock-alerta';
          alertaVencimiento.textContent = dias < 0 ? `Vencido hace ${-dias} días (${vencimiento.fechaVencimiento})` : dias === 0 ? 'Vence hoy' : `Vence en ${dias} días (${vencimiento.fechaVencimiento})`;
          tarjeta.append(alertaVencimiento);
        }
      }
      const formVencimiento = document.createElement('form');
      formVencimiento.className = 'ap-minimo-form';
      const etiquetaFecha = document.createElement('label'); etiquetaFecha.textContent = 'Fecha de vencimiento (opcional)';
      const fechaInput = document.createElement('input'); fechaInput.type = 'date'; fechaInput.value = vencimiento?.fechaVencimiento || '';
      etiquetaFecha.append(fechaInput);
      const etiquetaAviso = document.createElement('label'); etiquetaAviso.textContent = 'Avisar con días de anticipación';
      const avisoInput = document.createElement('input'); avisoInput.type = 'number'; avisoInput.min = '0'; avisoInput.max = '3650'; avisoInput.required = true; avisoInput.value = String(vencimiento?.avisoDias ?? 30);
      etiquetaAviso.append(avisoInput);
      const guardarVenc = document.createElement('button'); guardarVenc.type = 'submit'; guardarVenc.textContent = 'Guardar vencimiento';
      const mensajeVenc = document.createElement('small'); mensajeVenc.setAttribute('role', 'status');
      formVencimiento.append(etiquetaFecha, etiquetaAviso, guardarVenc, mensajeVenc);
      formVencimiento.addEventListener('submit', async evento => {
        evento.preventDefault();
        const avisoDias = Number(avisoInput.value);
        if (!Number.isSafeInteger(avisoDias) || avisoDias < 0 || avisoDias > 3650) { mensajeVenc.textContent = 'Días de aviso no válidos.'; return; }
        guardarVenc.disabled = true;
        try {
          const url = `/api/productos/${encodeURIComponent(p.id)}/vencimiento`;
          const respuesta = await fetch(url, fechaInput.value ? {
            method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fechaVencimiento:fechaInput.value, avisoDias})
          } : { method:'DELETE' });
          const datos = await respuesta.json();
          if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo guardar.');
          if (fechaInput.value) vencimientos.set(Number(p.id), {fechaVencimiento:fechaInput.value,avisoDias});
          else vencimientos.delete(Number(p.id));
          renderizar();
        } catch(error) { mensajeVenc.textContent = error.message; }
        finally { guardarVenc.disabled = false; }
      });
      tarjeta.append(formVencimiento);
      if (p.tipo_control === 'SERIE') {
        const botonSeries = document.createElement('button');
        botonSeries.type = 'button';
        botonSeries.textContent = 'Vencimientos por número de serie';
        const panelSeries = document.createElement('div');
        panelSeries.className = 'ap-series-vencimientos';
        let soloAlertas = false;
        const seriesAlertadas = (vencimientosSeries.get(Number(p.id)) || []).filter(s =>
          ['vencidos', 'proximos'].includes(clasificarFecha(s.fechaVencimiento, s.avisoDias, hoy)));
        if (seriesAlertadas.length) {
          const revisar = document.createElement('button');
          revisar.type = 'button';
          revisar.textContent = `Revisar ${seriesAlertadas.length} serie(s) con alerta`;
          revisar.className = 'ap-inventario-actualizar';
          revisar.addEventListener('click', () => {
            soloAlertas = true;
            panelSeries.hidden = true;
            panelSeries.replaceChildren();
            botonSeries.click();
            panelSeries.scrollIntoView({behavior:'smooth',block:'nearest'});
          });
          tarjeta.append(revisar);
        }
        botonSeries.addEventListener('click', async () => {
          if (!panelSeries.hidden && panelSeries.childElementCount) { panelSeries.hidden = true; return; }
          if (!soloAlertas) panelSeries.replaceChildren();
          panelSeries.hidden = false;
          panelSeries.textContent = 'Consultando series…';
          botonSeries.disabled = true;
          try {
            const respuesta = await fetch(`/api/productos/${encodeURIComponent(p.id)}/series-vencimientos`, {cache:'no-store'});
            const filas = await respuesta.json();
            if (!respuesta.ok || !Array.isArray(filas)) throw new Error(filas.mensaje || 'No se pudieron cargar las series.');
            panelSeries.replaceChildren();
            if (!filas.length) panelSeries.textContent = 'Este producto aún no tiene números de serie registrados.';
            const ordenadas = [...filas].sort((a,b) => {
              const prioridad = x => ({vencidos:0,proximos:1,vigentes:2,'sin-fecha':3})[clasificarFecha(x.fechaVencimiento,x.avisoDias,new Date(new Date().setHours(0,0,0,0)))];
              return prioridad(a)-prioridad(b) || String(a.fechaVencimiento || '9999').localeCompare(String(b.fechaVencimiento || '9999'));
            });
            const seleccionadas = soloAlertas ? ordenadas.filter(s => ['vencidos','proximos'].includes(clasificarFecha(s.fechaVencimiento,s.avisoDias,new Date(new Date().setHours(0,0,0,0))))) : ordenadas;
            if (soloAlertas) {
              const encabezado = document.createElement('p');
              encabezado.textContent = `${seleccionadas.length} serie(s) requieren revisión`;
              panelSeries.append(encabezado);
            }
            if (!seleccionadas.length) panelSeries.textContent = 'No hay series con alertas en este momento.';
            for (const serie of seleccionadas) {
              const formulario = document.createElement('form');
              formulario.className = 'ap-minimo-form';
              const titulo = document.createElement('strong');
              titulo.textContent = `Serie: ${serie.numeroSerie} · ${serie.estado || 'Sin estado'}`;
              const fecha = document.createElement('input'); fecha.type='date'; fecha.value=serie.fechaVencimiento || '';
              fecha.setAttribute('aria-label', `Vencimiento de serie ${serie.numeroSerie}`);
              const dias = document.createElement('input'); dias.type='number'; dias.min='0'; dias.max='3650'; dias.required=true;
              dias.value=String(serie.avisoDias ?? 30); dias.setAttribute('aria-label','Días de aviso');
              const guardar = document.createElement('button'); guardar.type='submit'; guardar.textContent='Guardar serie';
              const mensaje = document.createElement('small'); mensaje.setAttribute('role','status');
              const hoy = new Date(); hoy.setHours(0,0,0,0);
              if (serie.fechaVencimiento) {
                const faltan = Math.round((new Date(`${serie.fechaVencimiento}T00:00:00`) - hoy) / 86400000);
                const estado = document.createElement('span');
                estado.textContent = faltan < 0 ? `Vencida hace ${-faltan} días` : faltan <= Number(serie.avisoDias ?? 30) ? `Próxima a vencer: ${faltan} días` : `Vigente: ${faltan} días`;
                formulario.append(estado);
              }
              formulario.append(titulo,fecha,dias,guardar,mensaje);
              formulario.addEventListener('submit', async evento => {
                evento.preventDefault();
                const avisoDias=Number(dias.value);
                if (!Number.isSafeInteger(avisoDias) || avisoDias<0 || avisoDias>3650) {mensaje.textContent='Días no válidos.';return;}
                guardar.disabled=true;
                try {
                  const url=`/api/productos/${encodeURIComponent(p.id)}/series/${encodeURIComponent(serie.serieId)}/vencimiento`;
                  const respuesta=await fetch(url,fecha.value ? {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({fechaVencimiento:fecha.value,avisoDias})} : {method:'DELETE'});
                  const datos=await respuesta.json();
                  if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo guardar.');
                  mensaje.textContent='Vencimiento actualizado.';
                  await cargar();
                } catch(error) {mensaje.textContent=error.message;}
                finally {guardar.disabled=false;}
              });
              // Bitácora de inspecciones: no altera stock ni fecha de vencimiento.
              const inspeccion = document.createElement('section');
              inspeccion.className = 'ap-revisiones-serie';
              const verRevisiones = document.createElement('button');
              verRevisiones.type='button'; verRevisiones.textContent='Revisiones de esta serie';
              const contenidoRevision = document.createElement('div'); contenidoRevision.hidden=true;
              const formularioRevision = document.createElement('form'); formularioRevision.className='ap-minimo-form';
              const resultadoRevision=document.createElement('select'); resultadoRevision.setAttribute('aria-label','Resultado de revisión');
              for (const valor of ['APROBADA','OBSERVADA','RECHAZADA']) {
                const opcion=document.createElement('option'); opcion.value=valor; opcion.textContent=valor; resultadoRevision.append(opcion);
              }
              const observacionesRevision=document.createElement('input'); observacionesRevision.type='text';
              observacionesRevision.maxLength=1000; observacionesRevision.placeholder='Observaciones de inspección';
              const guardarRevision=document.createElement('button'); guardarRevision.type='submit'; guardarRevision.textContent='Registrar revisión';
              const estadoRevision=document.createElement('small'); estadoRevision.setAttribute('role','status');
              const historialRevision=document.createElement('ul');
              const urlRevision=`/api/productos/${encodeURIComponent(p.id)}/series/${encodeURIComponent(serie.serieId)}/revisiones`;
              async function cargarRevisiones() {
                const respuesta=await fetch(urlRevision,{cache:'no-store'});
                const datos=await respuesta.json();
                if (!respuesta.ok || !Array.isArray(datos)) throw new Error(datos.mensaje || 'No se pudo consultar las revisiones.');
                historialRevision.replaceChildren();
                if (!datos.length) {const item=document.createElement('li'); item.textContent='Sin revisiones registradas.'; historialRevision.append(item);}
                for (const revision of datos) {
                  const item=document.createElement('li');
                  item.textContent=`${revision.fechaRevision} · ${revision.resultado}${revision.observaciones ? ' · '+revision.observaciones : ''}`;
                  historialRevision.append(item);
                }
              }
              verRevisiones.addEventListener('click',async()=>{
                contenidoRevision.hidden=!contenidoRevision.hidden;
                if (!contenidoRevision.hidden) {try {await cargarRevisiones();} catch(error) {estadoRevision.textContent=error.message;}}
              });
              formularioRevision.addEventListener('submit',async evento=>{
                evento.preventDefault(); guardarRevision.disabled=true; estadoRevision.textContent='Guardando revisión…';
                try {
                  const respuesta=await fetch(urlRevision,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resultado:resultadoRevision.value,observaciones:observacionesRevision.value})});
                  const datos=await respuesta.json();
                  if (!respuesta.ok) throw new Error(datos.mensaje || 'No se pudo registrar la revisión.');
                  observacionesRevision.value=''; estadoRevision.textContent='Revisión registrada.';
                  await cargarRevisiones();
                } catch(error) {estadoRevision.textContent=error.message;}
                finally {guardarRevision.disabled=false;}
              });
              formularioRevision.append(resultadoRevision,observacionesRevision,guardarRevision,estadoRevision);
              contenidoRevision.append(formularioRevision,historialRevision);
              inspeccion.append(verRevisiones,contenidoRevision);
              panelSeries.append(formulario,inspeccion);
            }
          } catch(error) {panelSeries.textContent=error.message;}
          finally {botonSeries.disabled=false;}
        });
        panelSeries.hidden=true;
        tarjeta.append(botonSeries,panelSeries);
      }
      const configurar = document.createElement('form');
      configurar.className = 'ap-minimo-form';
      const etiquetaMinimo = document.createElement('label');
      etiquetaMinimo.textContent = 'Stock mínimo';
      const entradaMinimo = document.createElement('input');
      entradaMinimo.type = 'number'; entradaMinimo.min = '0'; entradaMinimo.max = '100000000';
      entradaMinimo.step = '1'; entradaMinimo.required = true; entradaMinimo.value = String(minimo);
      etiquetaMinimo.append(entradaMinimo);
      const botonMinimo = document.createElement('button'); botonMinimo.type = 'submit'; botonMinimo.textContent = 'Guardar mínimo';
      const avisoMinimo = document.createElement('small'); avisoMinimo.setAttribute('role','status');
      configurar.append(etiquetaMinimo, botonMinimo, avisoMinimo);
      configurar.addEventListener('submit', async evento => {
        evento.preventDefault();
        const valor = Number(entradaMinimo.value);
        if (!Number.isSafeInteger(valor) || valor < 0 || valor > 100000000) { avisoMinimo.textContent = 'Ingresa un entero válido.'; return; }
        botonMinimo.disabled = true;
        try {
          const respuesta = await fetch(`/api/productos/${encodeURIComponent(p.id)}/stock-minimo`, {
            method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({minimo:valor})
          });
          const resultado = await respuesta.json();
          if (!respuesta.ok) throw new Error(resultado.mensaje || 'No se pudo guardar');
          minimos.set(Number(p.id),valor);
          renderizar();
        } catch (error) { avisoMinimo.textContent = error.message; }
        finally { botonMinimo.disabled = false; }
      });
      tarjeta.append(configurar);
      const detalle = document.createElement('details');
      const abrir = document.createElement('summary');
      abrir.textContent = 'Ver detalle del producto';
      detalle.append(abrir);
      const datos = document.createElement('div');
      datos.className = 'ap-inventario-detalle';
      const identificador = document.createElement('p');
      identificador.textContent = `Identificador: ${p.id}`;
      datos.append(identificador);
      if (p.foto && /^\/uploads\/productos\/[a-zA-Z0-9_.-]+$/.test(p.foto)) {
        const imagen = document.createElement('img');
        imagen.src = p.foto;
        imagen.alt = `Fotografía de ${p.nombre || 'producto'}`;
        imagen.loading = 'lazy';
        datos.append(imagen);
      }
      detalle.append(datos);
      tarjeta.append(detalle);
      const editar = document.createElement('details');
      editar.className = 'ap-inventario-editar';
      const resumenEditar = document.createElement('summary');
      resumenEditar.textContent = 'Editar producto';
      editar.append(resumenEditar);
      const formulario = document.createElement('form');
      formulario.className = 'ap-inventario-form-editar';
      const campo = (etiqueta, control) => {
        const label = document.createElement('label');
        label.textContent = etiqueta;
        label.append(control);
        formulario.append(label);
      };
      const nombreEditar = document.createElement('input');
      nombreEditar.required = true;
      nombreEditar.maxLength = 200;
      nombreEditar.value = p.nombre || '';
      campo('Nombre', nombreEditar);
      const descripcionEditar = document.createElement('textarea');
      descripcionEditar.maxLength = 2000;
      descripcionEditar.value = p.descripcion || '';
      campo('Descripción', descripcionEditar);
      const tipoEditar = document.createElement('select');
      for (const [valor, titulo] of [['CANTIDAD', 'Por cantidad'], ['SERIE', 'Por número de serie']]) {
        const opcion = document.createElement('option');
        opcion.value = valor;
        opcion.textContent = titulo;
        tipoEditar.append(opcion);
      }
      tipoEditar.value = p.tipo_control;
      campo('Tipo de control', tipoEditar);
      const fotoEditar = document.createElement('input');
      fotoEditar.type = 'file';
      fotoEditar.accept = 'image/*';
      campo('Reemplazar fotografía (opcional)', fotoEditar);
      const guardar = document.createElement('button');
      guardar.type = 'submit';
      guardar.textContent = 'Guardar cambios';
      const mensaje = document.createElement('p');
      mensaje.setAttribute('role', 'status');
      formulario.append(guardar, mensaje);
      formulario.addEventListener('submit', async event => {
        event.preventDefault();
        guardar.disabled = true;
        mensaje.textContent = 'Guardando cambios...';
        try {
          const datos = new FormData();
          datos.set('nombre', nombreEditar.value.trim());
          datos.set('descripcion', descripcionEditar.value.trim());
          datos.set('tipoControl', tipoEditar.value);
          if (fotoEditar.files[0]) datos.set('foto', fotoEditar.files[0]);
          const respuesta = await fetch(`/api/productos/${encodeURIComponent(p.id)}/ficha`, {
            method: 'PUT', body: datos
          });
          const resultado = await respuesta.json();
          if (!respuesta.ok) throw new Error(resultado.mensaje || 'Error al guardar');
          mensaje.textContent = 'Cambios guardados correctamente.';
          await cargar();
        } catch (error) {
          mensaje.textContent = error.message || 'No se pudo actualizar.';
        } finally { guardar.disabled = false; }
      });
      editar.append(formulario);
      tarjeta.append(editar);

      if (p.descripcion) {
        const descripcion = document.createElement('span');
        descripcion.textContent = p.descripcion;
        tarjeta.append(descripcion);
      }
      lista.append(tarjeta);
    }
    estado.textContent = `${visibles.length} de ${productos.length} productos registrados`;
  }
  async function cargar() {
    const actual = ++solicitud;
    actualizar.disabled = true;
    estado.textContent = 'Actualizando productos...';
    try {
      const respuesta = await fetch('/api/productos', { cache: 'no-store' });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      if (!Array.isArray(datos)) throw new Error('Formato de respuesta no válido');
      if (actual !== solicitud) return;
      productos = datos;
      disponibilidad = new Map(); minimos = new Map();
      stockActualizado = false; minimosActualizados = false;
      try {
        const respuestaStock = await fetch('/api/productos/disponibilidad', { cache: 'no-store' });
        if (respuestaStock.ok) {
          const stock = await respuestaStock.json();
          if (Array.isArray(stock)) { disponibilidad = new Map(stock.map(item => [Number(item.productoId), item])); stockActualizado = true; }
        }
      } catch (errorStock) {
        console.warn('No se pudo actualizar el stock informativo:', errorStock);
      }
      try {
        const respuestaMinimos = await fetch('/api/productos/stock-minimo', {cache:'no-store'});
        if (respuestaMinimos.ok) {
          const filas = await respuestaMinimos.json();
          if (Array.isArray(filas)) { minimos = new Map(filas.map(f => [Number(f.productoId),Number(f.minimo)])); minimosActualizados = true; }
        }
      } catch (errorMinimos) { console.warn('No se pudieron cargar mínimos:', errorMinimos); }
      try {
        const respuestaVenc = await fetch('/api/productos/vencimientos', {cache:'no-store'});
        if (respuestaVenc.ok) {
          const filas = await respuestaVenc.json();
          if (Array.isArray(filas)) vencimientos = new Map(filas.map(f => [Number(f.productoId),f]));
        }
      } catch(errorVenc) { console.warn('No se pudieron cargar vencimientos:', errorVenc); }
      try {
        const respuestaSeries = await fetch('/api/productos/vencimientos-series/resumen', {cache:'no-store'});
        if (respuestaSeries.ok) {
          const filas = await respuestaSeries.json();
          if (Array.isArray(filas)) {
            const agrupadas = new Map();
            for (const fila of filas) {
              const id = Number(fila.productoId);
              if (!agrupadas.has(id)) agrupadas.set(id, []);
              agrupadas.get(id).push(fila);
            }
            vencimientosSeries = agrupadas;
          }
        }
      } catch(errorSeries) { console.warn('No se pudieron cargar vencimientos por serie:', errorSeries); }
      if (actual !== solicitud) return;
      actualizarIndicadores();
      renderizar();
    } catch (error) {
      if (actual !== solicitud) return;
      estado.textContent = `No se pudo actualizar la lista. ${productos.length ? 'Se mantienen los últimos resultados.' : 'Intenta nuevamente.'}`;
      console.error('Consulta de productos:', error);
    } finally {
      if (actual === solicitud) actualizar.disabled = false;
    }
  }
  // Exportación de solo lectura: respeta los filtros y el orden que ve el usuario.
  // Se escapan fórmulas para impedir que Excel/Calc interpreten datos como comandos.
  function celdaCSV(valor) {
    let texto = String(valor ?? '');
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(texto)) texto = "'" + texto;
    return '"' + texto.replace(/"/g, '""') + '"';
  }
  function exportarResultados() {
    if (!productosVisibles.length) {
      if (estadoFiltros) estadoFiltros.textContent = 'No hay productos para exportar con los filtros actuales.';
      return;
    }
    const columnas = ['Código', 'Nombre', 'Descripción', 'Ubicación', 'Control', 'Stock físico', 'Reservado', 'Stock libre', 'Stock mínimo', 'Vencimiento'];
    const filas = productosVisibles.map(p => {
      const stock = disponibilidad.get(Number(p.id));
      const minimo = minimos.get(Number(p.id));
      const vencimiento = vencimientos.get(Number(p.id));
      return [p.codigo, p.nombre, p.descripcion, p.ubicacion, p.tipo_control,
        stock?.total ?? '', stock?.reservado ?? '', stock?.libre ?? '', minimo ?? '', vencimiento?.fechaVencimiento ?? ''];
    });
    const contenido = '\uFEFF' + [columnas, ...filas].map(f => f.map(celdaCSV).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob([contenido], {type:'text/csv;charset=utf-8'}));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `inventario-filtrado-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (estadoFiltros) estadoFiltros.textContent = `CSV generado con ${filas.length} productos visibles.`;
  }
  exportarFiltrados?.addEventListener('click', exportarResultados);
  entrada.addEventListener('input', renderizar);
  filtroVencimiento?.addEventListener('change', renderizar);
  filtroStock?.addEventListener('change', renderizar);
  ordenProductos?.addEventListener('change', renderizar);
  limpiarFiltros?.addEventListener('click', () => {
    entrada.value = '';
    if (filtroVencimiento) filtroVencimiento.value = 'todos';
    if (filtroStock) filtroStock.value = 'todos';
    if (ordenProductos) ordenProductos.value = 'nombre';
    renderizar();
    entrada.focus();
  });
  actualizar.addEventListener('click', cargar);
  document.getElementById('formProducto')?.addEventListener('submit', () => {
    // Espera a que el registro existente termine; el botón permite actualizar sin alterar ese flujo.
  });
  cargar();
})();
