/* Avisos accesibles para respuestas existentes; no modifica solicitudes ni guardados. */
(() => {
  'use strict';
  const mobile = window.matchMedia('(max-width: 700px)');
  const selectors = ['#mensaje', '[data-ap-validation-message]'];
  let timer;
  let last = '';
  function notify(message, isError) {
    if (!mobile.matches || !message || message === last) return;
    last = message;
    let toast = document.getElementById('ap-aviso-movil');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ap-aviso-movil';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.toggle('ap-aviso-error', isError);
    toast.classList.add('ap-aviso-visible');
    clearTimeout(timer);
    timer = setTimeout(() => { toast.classList.remove('ap-aviso-visible'); last = ''; }, 4500);
  }
  function watch(node) {
    let previous = node.textContent.trim();
    const observer = new MutationObserver(() => {
      const message = node.textContent.trim();
      if (node.hidden || !message || message === previous) { previous = message; return; }
      previous = message;
      const isError = node.hasAttribute('data-ap-validation-message') ||
        node.classList.contains('error') || node.getAttribute('role') === 'alert' ||
        /^(error|faltan|revisa|no se pudo|debes)/i.test(message);
      notify(message.slice(0, 240), isError);
    });
    observer.observe(node, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(selectors.join(',')).forEach(watch);
  });
})();
