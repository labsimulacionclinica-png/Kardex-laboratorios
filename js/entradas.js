"use strict";

/* ====================================================================
   MÓDULO: ENTRADAS DE STOCK
   Registra ingresos de inventario (compras / devoluciones) con factura
   y proveedor. Entradas − Consumos = Saldo. Cada entrada queda en el
   registro app.entradas y se exporta en la hoja "ENTRADAS".
   ==================================================================== */

function openEntryModal(rowId) {
  const row = app.rows.find(r => r.__id === rowId);
  if (!row) return;

  app.selectedRowId = rowId;
  const current = parseNumber(row["CANTIDAD"]);

  $("entryItemLabel").textContent = `${sanitizeText(row["CODIGO INSUMO"]) || "Insumo"} · Lote ${sanitizeText(row["LOTE"]) || "—"}`;
  $("entryCurrentStock").textContent = formatQuantity(current);
  const qtyInput = $("entryQuantity");
  qtyInput.value = "";
  qtyInput.max = "";
  $("entryFactura").value = "";
  $("entryProveedor").value = sanitizeText(row["PROVEEDOR"]) || "";
  $("entryObservacion").value = "";

  const modal = $("entryModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  setTimeout(() => qtyInput.focus(), 50);
}

function closeEntryModal() {
  app.selectedRowId = null;
  const modal = $("entryModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function confirmEntry() {
  const row = app.rows.find(r => r.__id === app.selectedRowId);
  if (!row) return;

  const quantity = parseNumber($("entryQuantity").value);
  const factura = sanitizeText($("entryFactura").value);
  const proveedor = sanitizeText($("entryProveedor").value) || sanitizeText(row["PROVEEDOR"]);
  const observation = sanitizeText($("entryObservacion").value);

  if (!quantity || quantity <= 0) {
    showToast("La cantidad a ingresar debe ser mayor que cero.", "error");
    return;
  }

  row["CANTIDAD"] = roundQuantity(parseNumber(row["CANTIDAD"]) + quantity);
  if (!row["STATUS"] && row["CANTIDAD"] > 0) {
    row["STATUS"] = "Disponible";
  }

  app.entradas.push({
    FECHA: new Date().toISOString(),
    "CODIGO INSUMO": row["CODIGO INSUMO"],
    "CODIGO": row["CODIGO"],
    "PRESENTACIÓN": row["PRESENTACIÓN"],
    "LOTE": row["LOTE"],
    "CANTIDAD INGRESADA": quantity,
    "FACTURA / OC": factura,
    "PROVEEDOR": proveedor,
    "OBSERVACION": observation,
    "SEDE": row["SEDE"]
  });

  closeEntryModal();
  saveLocalData();
  render();

  showToast(`Entrada registrada: +${formatQuantity(quantity)}. Nuevo stock: ${formatQuantity(row["CANTIDAD"])}.`, "success", 5000);
}

/* ---------- Eventos ---------- */
(function wireEntradas() {
  document.addEventListener("DOMContentLoaded", () => {});
  const confirmBtn = document.getElementById("confirmEntry");
  const cancelBtn = document.getElementById("cancelEntry");
  const closeBtn = document.getElementById("closeEntryModal");
  const modal = document.getElementById("entryModal");

  confirmBtn?.addEventListener("click", confirmEntry);
  cancelBtn?.addEventListener("click", closeEntryModal);
  closeBtn?.addEventListener("click", closeEntryModal);
  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeEntryModal();
  });
})();
