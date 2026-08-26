"use strict";

/* ====================================================================
   MÓDULO: RESPALDO Y RESTAURACIÓN JSON
   Respaldo independiente del Excel: descarga todo el estado (kardex,
   consumos, entradas) en un .json y lo restaura cuando se necesite.
   ==================================================================== */

function downloadBackup() {
  if (!app.rows.length) {
    showToast("No hay datos para respaldar. Carga un Kardex primero.", "error");
    return;
  }

  try {
    const payload = snapshotPayload();
    payload.exportedAt = new Date().toISOString();

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RESPALDO_KARDEX_${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);

    showToast(`Respaldo descargado (${app.rows.length} registros · ${app.consumptions.length} consumos · ${app.entradas.length} entradas).`, "success", 5500);
  } catch (error) {
    console.error(error);
    showToast("No fue posible generar el respaldo.", "error");
  }
}

async function restoreBackupFile(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (!data || !Array.isArray(data.rows) || !data.rows.length) {
      throw new Error("El archivo no contiene un respaldo válido.");
    }

    app.rows = normalizeRestoredRows(data.rows);
    app.consumptions = Array.isArray(data.consumptions) ? data.consumptions : [];
    app.entradas = Array.isArray(data.entradas) ? data.entradas : [];
    app.fileName = data.fileName || `Respaldo ${todayISO()}`;
    app.lastSavedAt = data.savedAt || data.exportedAt || null;
    app.page = 1;
    app.sortKey = null;

    applyImportedConsumptionBaseline();
    populateFilters();
    resetFilters(false);
    rebuildConsumptionControls();
    hideRestoreBanner();
    showDashboard();
    await saveLocalData();
    render();

    showToast(`Respaldo restaurado: ${app.rows.length} registros · ${app.consumptions.length} consumos · ${app.entradas.length} entradas.`, "success", 6000);
  } catch (error) {
    console.error(error);
    showToast(`No se pudo restaurar el respaldo: ${error.message}`, "error", 6500);
  }
}

/* ---------- Banner de restauración automática al abrir ---------- */

function showRestoreBanner(payload) {
  if (!els.restoreBanner || !payload || !Array.isArray(payload.rows)) return;
  els.restoreBannerDate.textContent = localDateTime(payload.savedAt);
  els.restoreBanner.classList.remove("hidden");
  els.restoreBanner.dataset.payloadReady = "1";

  // Se guarda temporalmente para que el botón pueda usarla.
  window.__pendingRestorePayload = payload;
}

function restoreFromBanner() {
  const payload = window.__pendingRestorePayload;
  if (!payload) return;
  applyPersistedPayload(payload);
  window.__pendingRestorePayload = null;
  showToast("Sesión anterior restaurada.", "success", 4000);
}
