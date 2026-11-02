// Cierre de sesión compartido por las pantallas protegidas.
(() => {
  if (document.getElementById('boton-cerrar-sesion')) return;
  const button = document.createElement('button');
  button.id = 'boton-cerrar-sesion';
  button.type = 'button';
  (button.querySelector('.ap-etiqueta-sesion') || button).textContent = 'Cerrar sesión';
  button.setAttribute('aria-label', 'Cerrar sesión de Mapa Bodega AP');
  Object.assign(button.style, {
    position: 'static', flexShrink: '0',
    padding: '10px 15px', borderRadius: '9px', border: '1px solid #b9c6d8',
    background: '#173b67', color: '#fff', fontWeight: '600',
    cursor: 'pointer', boxShadow: '0 2px 8px #0002'
  });
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    (button.querySelector('.ap-etiqueta-sesion') || button).textContent = 'Cerrando sesión…';
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store'
      });
      if (!response.ok && response.status !== 401) throw new Error('No se pudo cerrar la sesión');
      for (const key of Object.keys(sessionStorage)) {
        if (key.toLowerCase().includes('entrega') && key.toLowerCase().includes('parcial')) sessionStorage.removeItem(key);
      }
      window.location.replace('/login.html');
    } catch (error) {
      button.disabled = false;
      (button.querySelector('.ap-etiqueta-sesion') || button).textContent = 'Cerrar sesión';
      window.alert(error.message || 'No se pudo cerrar la sesión');
    }
  });
  // Integrar el botón en el encabezado, junto a los controles existentes.
  // No utilizar posición fija: tapa el perfil y otros botones en móviles.
  const header = document.querySelector('body > header');
  if (header) {
    let actions = header.querySelector('.ap-acciones-sesion');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'ap-acciones-sesion';
      header.appendChild(actions);
    }
    // El usuario autenticado puede actualizar su propia contraseña sin intervención de ADMIN.
    const passwordButton = document.createElement('button');
    passwordButton.type = 'button';
    passwordButton.textContent = 'Cambiar contraseña';
    passwordButton.setAttribute('aria-label', 'Cambiar mi contraseña');
    Object.assign(passwordButton.style, {
      padding: '10px 12px', borderRadius: '9px', border: '1px solid #b9c6d8',
      background: 'transparent', color: '#fff', cursor: 'pointer', flexShrink: '0'
    });
    passwordButton.addEventListener('click', () => {
      if (document.getElementById('ap-dialogo-password')) return;
      const dialog = document.createElement('dialog');
      dialog.id = 'ap-dialogo-password';
      dialog.setAttribute('aria-label', 'Cambiar mi contraseña');
      Object.assign(dialog.style, {
        border: '1px solid #d4deec', borderRadius: '14px', padding: '24px',
        width: 'min(420px, calc(100% - 32px))', boxShadow: '0 12px 35px #0003'
      });
      const title = document.createElement('h2');
      title.textContent = 'Cambiar contraseña';
      const description = document.createElement('p');
      description.textContent = 'Al cambiarla, se cerrarán todas tus sesiones.';
      const form = document.createElement('form');
      const inputs = [];
      for (const [labelText, autocomplete] of [
        ['Contraseña actual', 'current-password'],
        ['Nueva contraseña', 'new-password'],
        ['Confirmar contraseña nueva', 'new-password']
      ]) {
        const label = document.createElement('label');
        label.textContent = labelText;
        label.style.display = 'block';
        label.style.marginTop = '12px';
        const input = document.createElement('input');
        input.type = 'password';
        input.required = true;
        input.autocomplete = autocomplete;
        input.minLength = autocomplete === 'current-password' ? 1 : 12;
        input.maxLength = 256;
        Object.assign(input.style, { display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px', marginTop: '5px' });
        label.append(input);
        form.append(label);
        inputs.push(input);
      }
      const error = document.createElement('p');
      error.setAttribute('role', 'alert');
      error.style.color = '#a42323';
      const buttons = document.createElement('div');
      Object.assign(buttons.style, { display: 'flex', gap: '10px', marginTop: '16px' });
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = 'Cancelar';
      cancel.addEventListener('click', () => dialog.close());
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.textContent = 'Guardar contraseña';
      buttons.append(cancel, submit);
      form.append(error, buttons);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (inputs[1].value !== inputs[2].value) {
          error.textContent = 'Las contraseñas nuevas no coinciden.';
          return;
        }
        submit.disabled = true;
        error.textContent = '';
        try {
          const response = await fetch('/api/auth/cambiar-password', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actual: inputs[0].value, nueva: inputs[1].value })
          });
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'No se pudo cambiar la contraseña');
          window.location.replace('/login.html');
        } catch (e) {
          error.textContent = e.message;
          submit.disabled = false;
        }
      });
      dialog.addEventListener('close', () => dialog.remove());
      dialog.append(title, description, form);
      document.body.append(dialog);
      dialog.showModal();
      inputs[0].focus();
    });
    // Iconos SVG reales: no dependen de pseudo-elementos CSS ni del orden de botones.
    const setIcon = (element, svg, accessibleName) => {
      element.classList.add('ap-boton-icono-sesion');
      element.setAttribute('aria-label', accessibleName);
      element.setAttribute('title', accessibleName);
      const label = document.createElement('span');
      label.className = 'ap-etiqueta-sesion';
      label.textContent = element.textContent;
      const icon = document.createElement('span');
      icon.className = 'ap-icono-sesion';
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = svg;
      element.replaceChildren(icon, label);
    };
    setIcon(passwordButton, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="5"/><path d="m11.5 11.5 9-9 2 2-2.5 2.5 2 2-3 3-2-2-2.5 2.5"/></svg>', 'Cambiar contraseña');
    setIcon(button, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>', 'Cerrar sesión');
    // Las dimensiones se fijan también en el DOM: Safari y CSS antiguos no
    // pueden volver a convertir estos iconos en botones de ancho completo.
    const fijarDimension = (el, width, height) => {
      el.style.setProperty('width', width + 'px', 'important');
      el.style.setProperty('height', height + 'px', 'important');
      el.style.setProperty('min-width', width + 'px', 'important');
      el.style.setProperty('max-width', width + 'px', 'important');
      el.style.setProperty('min-height', height + 'px', 'important');
      el.style.setProperty('max-height', height + 'px', 'important');
      el.style.setProperty('flex', '0 0 ' + width + 'px', 'important');
    };
    const dimensionarIconos = () => {
      const movil = window.matchMedia('(max-width: 700px)').matches;
      const ancho = movil ? 36 : 38;
      actions.style.setProperty('display', 'flex', 'important');
      actions.style.setProperty('flex-direction', 'row', 'important');
      actions.style.setProperty('flex-wrap', 'nowrap', 'important');
      actions.style.setProperty('width', 'auto', 'important');
      actions.style.setProperty('flex', '0 0 auto', 'important');
      for (const el of [passwordButton, button]) {
        fijarDimension(el, ancho, ancho);
        el.style.setProperty('display', 'inline-flex', 'important');
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('font-size', '0', 'important');
        el.style.setProperty('overflow', 'hidden', 'important');
        const icon = el.querySelector('.ap-icono-sesion');
        const svg = icon?.querySelector('svg');
        const label = el.querySelector('.ap-etiqueta-sesion');
        if (label) label.style.setProperty('display', 'none', 'important');
        if (icon) {
          fijarDimension(icon, 18, 18);
          icon.style.setProperty('display', 'block', 'important');
        }
        if (svg) {
          svg.setAttribute('width', '18');
          svg.setAttribute('height', '18');
          fijarDimension(svg, 18, 18);
          svg.style.setProperty('display', 'block', 'important');
        }
      }
    };
    // El encabezado se compone explícitamente en una sola fila.
    // Los estilos inline evitan reglas antiguas que estiran los controles en móviles.
    header.style.setProperty('display', 'flex', 'important');
    header.style.setProperty('flex-direction', 'row', 'important');
    header.style.setProperty('flex-wrap', 'nowrap', 'important');
    header.style.setProperty('align-items', 'center', 'important');
    header.style.setProperty('justify-content', 'space-between', 'important');
    header.style.setProperty('gap', '8px', 'important');
    const brand = header.querySelector('.inicio-marca, .ap-header-identidad') || header.firstElementChild;
    if (brand && brand !== actions) {
      brand.style.setProperty('flex', '1 1 0', 'important');
      brand.style.setProperty('min-width', '0', 'important');
      brand.style.setProperty('max-width', 'calc(100% - 84px)', 'important');
      brand.style.setProperty('margin', '0', 'important');
      brand.style.setProperty('text-align', 'left', 'important');
    }
    actions.style.setProperty('flex', '0 0 76px', 'important');
    actions.style.setProperty('width', '76px', 'important');
    actions.style.setProperty('max-width', '76px', 'important');
    actions.style.setProperty('min-width', '76px', 'important');
    actions.style.setProperty('gap', '4px', 'important');
    actions.style.setProperty('margin', '0', 'important');
    actions.append(passwordButton, button);
    dimensionarIconos();
    window.addEventListener('resize', dimensionarIconos, { passive: true });
  } else {
    // Pantallas sin encabezado: botón en flujo normal, sin superposiciones.
    document.body.insertBefore(button, document.body.firstChild);
  }
})();
