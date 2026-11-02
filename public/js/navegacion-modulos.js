/* Menú único para todas las pantallas. No modifica formularios ni datos. */
(() => {
  if (document.querySelector('#ap-menu-principal')) return;
  // La página de redirección de Movimientos no necesita cabecera.
  // Los estilos del menú se mantienen en css/styles.css.
  const oldHeader = document.querySelector('body > header');
  if (!oldHeader) return;
  document.querySelectorAll('.ap-nav-contenedor, .ap-navegacion-global').forEach(el => el.remove());
  const current = location.pathname.split('/').pop() || 'index.html';
  if (current === 'login.html') return;
  const links = [
    ['Inicio','index.html','⌂'],['Inventario','productos.html','▣'],
    ['Bodegas','bodegas.html','⌂'],['Movimientos','movimientos-unificado.html','⇄'],
    ['Proyectos','proyectos.html','▤'],['Solicitudes','solicitudes.html','▧'],
    ['Personas','personal.html','♟'],['Reportes','reportes-v5.html','▥'],
    ['Notificaciones','notificaciones-admin.html','♧'],['Configuración','usuarios.html','⚙']
  ];
  const aliases = {
    'mapa.html':'bodegas.html','ubicaciones.html':'bodegas.html','estructuras-v6.html':'bodegas.html',
    'movimientos.html':'movimientos-unificado.html','operaciones-integrales.html':'movimientos-unificado.html',
    'stock-proyectos.html':'proyectos.html','series-proyectos.html':'proyectos.html',
    'auditoria-inventario.html':'reportes-v5.html'
  };
  const active = aliases[current] || current;
  const header = document.createElement('header');
  header.id = 'ap-menu-principal';
  const brand = document.createElement('a');
  brand.className = 'ap-menu-brand';brand.href='index.html';
  brand.innerHTML='<span class="ap-menu-mark" aria-hidden="true">▰</span><span class="ap-menu-brand-copy"><strong>Mapa Bodega AP</strong><small>Inventario y Control de Herramientas</small></span>';
  const toggle = document.createElement('button');
  toggle.type='button';toggle.className='ap-menu-toggle';toggle.setAttribute('aria-label','Abrir menú');
  toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','ap-menu-enlaces');toggle.textContent='☰';toggle.setAttribute('title','Abrir navegación');
  const nav = document.createElement('nav');nav.id='ap-menu-enlaces';nav.setAttribute('aria-label','Módulos de la aplicación');
  links.forEach(([name,url,icon])=>{
    const a=document.createElement('a');a.href=url;a.className='ap-menu-link';
    const symbol=document.createElement('span');symbol.className='ap-menu-icon';symbol.setAttribute('aria-hidden','true');symbol.textContent=icon;
    const label=document.createElement('span');label.textContent=name;
    a.append(symbol,label);
    if (url===active) a.setAttribute('aria-current','page');
    nav.append(a);
  });
  const account=document.createElement('div');account.className='ap-menu-account';
  account.setAttribute('aria-label','Cuenta y sesión');
  // Preservar botones y sus listeners existentes, sin duplicarlos.
  const actions=oldHeader.querySelector('.ap-acciones-sesion');
  if (actions) account.append(actions);
  oldHeader.querySelectorAll('button').forEach(b=>{if(!account.contains(b))account.append(b);});
  header.append(brand,toggle,nav,account);
  header.style.setProperty('isolation','isolate','important');
  // Un único menú principal: no duplicar enlaces ni cabeceras existentes.
  oldHeader.replaceWith(header);
  // Las pestañas del módulo pertenecen al contenido, nunca encima del menú global.
  const sectionNav = document.querySelector('body > nav.mov-nav');
  if (sectionNav) header.insertAdjacentElement('afterend', sectionNav);
  const close=()=>{header.classList.remove('ap-menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menú');toggle.setAttribute('title','Abrir navegación');};
  toggle.addEventListener('click',()=>{
    const open=header.classList.toggle('ap-menu-open');
    toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Cerrar menú':'Abrir menú');toggle.setAttribute('title',open?'Cerrar navegación':'Abrir navegación');
  });
  nav.addEventListener('click',e=>{if(e.target.closest('a'))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('click',e=>{if(!header.contains(e.target))close();});
  const desktopQuery=window.matchMedia('(min-width: 1351px)');
  if (desktopQuery.addEventListener) desktopQuery.addEventListener('change',close);
  else if (desktopQuery.addListener) desktopQuery.addListener(close);
  fetch('/api/auth/me',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(user=>{
    if(!user)return;
    const name=user.nombre||user.name||user.usuario||user.username||'Usuario';
    const role=user.rol||user.role||'';
    const profile=document.createElement('div');profile.className='ap-menu-profile';
    const initials=document.createElement('span');initials.className='ap-menu-avatar';initials.textContent=String(name).trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
    const info=document.createElement('span');info.className='ap-menu-profile-info';
    const strong=document.createElement('strong');strong.textContent=name;
    const small=document.createElement('small');small.textContent=role;
    info.append(strong,small);profile.append(initials,info);account.prepend(profile);
  }).catch(()=>{});
})();
