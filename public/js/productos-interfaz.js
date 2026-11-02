// Navegación visual del inventario. No modifica datos ni las peticiones existentes.
(() => {
  const consultar = document.getElementById('apTabConsultar');
  const registrar = document.getElementById('apTabRegistrar');
  const panelConsulta = document.getElementById('apPanelConsultar');
  const panelRegistro = document.getElementById('apPanelRegistrar');
  const acceso = document.getElementById('apAbrirRegistroProducto');
  if (!consultar || !registrar || !panelConsulta || !panelRegistro || !acceso) return;
  function mostrarRegistro(activar, enfocar = false) {
    panelConsulta.hidden = activar;
    panelRegistro.hidden = !activar;
    consultar.setAttribute('aria-selected', String(!activar));
    registrar.setAttribute('aria-selected', String(activar));
    if (enfocar) (activar ? registrar : consultar).focus();
  }
  consultar.addEventListener('click', () => mostrarRegistro(false));
  registrar.addEventListener('click', () => mostrarRegistro(true));
  acceso.addEventListener('click', () => { mostrarRegistro(true); registrar.focus(); });
  [consultar, registrar].forEach((tab, indice) => {
    tab.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        mostrarRegistro(event.key === 'ArrowRight' ? indice === 0 : indice !== 0, true);
      }
    });
  });
})();
