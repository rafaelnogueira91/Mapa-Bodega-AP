/* Mejora progresiva: mensajes nativos de validación sin intervenir el envío. */
(() => {
  'use strict';
  const selector = 'input, select, textarea';
  document.addEventListener('invalid', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLElement) || !field.matches(selector)) return;
    field.setAttribute('aria-invalid', 'true');
    const form = field.closest('form');
    if (!form) return;
    const message = form.querySelector('[data-ap-validation-message]');
    if (message) {
      message.textContent = 'Revisa los campos obligatorios o con formato incorrecto.';
      message.hidden = false;
    }
  }, true);
  document.addEventListener('input', (event) => {
    const field = event.target;
    if (!field?.matches?.(selector)) return;
    if (field.validity?.valid) field.removeAttribute('aria-invalid');
  });
  document.addEventListener('change', (event) => {
    const field = event.target;
    if (field?.matches?.(selector) && field.validity?.valid) field.removeAttribute('aria-invalid');
  });
})();
