'use strict';
// Valida la carga completa antes de iniciar una transacción de entrega.
// Rechaza series repetidas y filas repetidas que podrían duplicar descuentos.
module.exports = function validarEntrega(productos) {
  if (!Array.isArray(productos) || productos.length === 0) return 'No existen productos para entregar.';
  if (productos.length > 500) return 'La entrega supera el máximo de 500 líneas.';
  const enteroPositivo = valor =>
    (typeof valor === 'string' && /^[1-9][0-9]*$/.test(valor) ||
     typeof valor === 'number' && Number.isSafeInteger(valor)) &&
    Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
  const cantidades = new Set();
  const series = new Set();
  const tiposPorProducto = new Map();
  const totalPorProducto = new Map();
  for (const item of productos) {
    if (!item || !enteroPositivo(item.productoId) || !enteroPositivo(item.cantidad) ||
        !['CANTIDAD', 'SERIE'].includes(item.tipoControl)) return 'Hay productos o cantidades no válidos.';
    const productoId = Number(item.productoId);
    if (tiposPorProducto.has(productoId) && tiposPorProducto.get(productoId) !== item.tipoControl) {
      return 'Un mismo producto no puede mezclar control por cantidad y por serie.';
    }
    tiposPorProducto.set(productoId, item.tipoControl);
    const total = (totalPorProducto.get(productoId) || 0) + Number(item.cantidad);
    if (!Number.isSafeInteger(total)) return 'La cantidad total del producto supera el límite permitido.';
    totalPorProducto.set(productoId, total);
    if (item.tipoControl === 'CANTIDAD') {
      if (cantidades.has(productoId)) return 'El producto está repetido en la entrega; agrupa las cantidades en una sola línea.';
      cantidades.add(productoId);
    } else {
      // Una serie debe ser texto real; no convertir objetos ni valores booleanos.
      if (typeof item.numeroSerie !== 'string') return 'Cada herramienta seriada debe tener una serie de texto válida.';
      const numeroSerie = item.numeroSerie.trim();
      if (!numeroSerie || numeroSerie.length > 200 || /[\x00-\x1f\x7f-\x9f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/u.test(numeroSerie) || Number(item.cantidad) !== 1) return 'Cada herramienta seriada debe tener una serie y cantidad igual a 1.';
      // Unicode can encode the same visible serial in composed or decomposed form.
      // Compare their canonical forms to avoid discounting one serial twice.
      const clave = numeroSerie.normalize('NFC');
      if (series.has(clave)) return 'La misma herramienta seriada aparece más de una vez en la entrega.';
      series.add(clave);
    }
  }
  return null;
};
