"use strict";

/* ====================================================================
   MÓDULO: EDITAR Y ELIMINAR REGISTROS DEL INVENTARIO
   - Editar: formulario precargado; valida duplicados excluyéndose a sí mismo.
   - Eliminar: confirmación nativa; el historial de consumos se conserva.
   ==================================================================== */

function openEditModal(rowId) {
  const row = app.rows.find(r => r.__id === rowId);
  if (!row) return;

  app.selectedRowId = rowId;
  $("editRowId").value = rowId;
  $("editItemLabel").textContent =
    `${sanitizeText(row["CODIGO INSUMO"]) || "Insumo"} · Lote ${sanitizeText(row["LOTE"]) || "—"}`;

  const values = {};
  REQUIRED_COLUMNS.forEach(col => { values[col] = row[col]; });

  buildItemFields(document.getElementById("editFields"), values, "edit");

  const modal = $("editModal");
  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeEditModal() {
  app.selectedRowId = null;
  const modal = $("editModal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function saveEditRow(event) {
  event.preventDefault();

  const rowId = $("editRowId").value;
  const row = app.rows.find(r => r.__id === rowId);
  if (!row) return closeEditModal();

  const form = document.getElementById("editForm");
  const updated = readItemFields(form);

  if (!updated["CODIGO INSUMO"]) {
    showToast("El campo CODIGO INSUMO es obligatorio.", "error");
    return;
  }
  if (updated["CANTIDAD"] < 0) {
    showToast("La cantidad no puede ser negativa.", "error");
    return;
  }

  // Duplicados: misma combinación insumo/código/lote en OTRA fila.
  const dup = findDuplicateRow(updated["CODIGO INSUMO"], updated["CODIGO"], updated["LOTE"], rowId);
  if (dup) {
    showToast(`Otro registro ya usa ese insumo/código con lote "${sanitizeText(updated["LOTE"])}". Cambia el lote para evitar duplicados.`, "error", 6500);
    return;
  }

  // Ajusta la línea base si cambió la cantidad (para % de uso coherente).
  const qtyDelta = roundQuantity(parseNumber(updated["CANTIDAD"]) - parseNumber(row["CANTIDAD"]));
  if (qtyDelta !== 0 && Number.isFinite(row.__initialQty)) {
    row.__initialQty = roundQuantity(row.__initialQty + qtyDelta);
  }

  REQUIRED_COLUMNS.forEach(col => { row[col] = updated[col]; });
  if (!row["STATUS"]) {
    row["STATUS"] = parseNumber(row["CANTIDAD"]) > 0 ? "Disponible" : "Agotado";
  }

  populateFilters();
  closeEditModal();
  saveLocalData();
  render();

  showToast("Registro actualizado correctamente.", "success", 3500);
}

function deleteRow(rowId) {
  const index = app.rows.findIndex(r => r.__id === rowId);
  if (index === -1) return;

  const row = app.rows[index];
  const label = `${sanitizeText(row["CODIGO INSUMO"]) || "Insumo"} · Lote ${sanitizeText(row["LOTE"]) || "—"}`;

  if (!window.confirm(`¿Eliminar este registro del inventario?\n\n${label}\n\nEl historial de consumos se conserva. Esta acción no se puede deshacer sin restaurar un respaldo.`)) {
    return;
  }

  app.rows.splice(index, 1);
  populateFilters();
  saveLocalData();
  render();

  showToast(`Registro eliminado: ${label}`, "info", 4500);
}
