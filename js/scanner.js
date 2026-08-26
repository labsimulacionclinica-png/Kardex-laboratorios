"use strict";

/* ====================================================================
   MÓDULO: ESCÁNER DE CÓDIGO DE BARRAS / QR
   Usa la API nativa BarcodeDetector (Chrome/Edge/Android, sin
   dependencias). Escanea el lote y abre el modal de consumo del
   registro coincidente. Incluye búsqueda manual de respaldo.
   ==================================================================== */

let _scannerStream = null;
let _scannerTimer = null;
let _scannerDetector = null;

function scannerSupported() {
  return "BarcodeDetector" in window;
}

async function openScanner() {
  const modal = document.getElementById("scannerModal");
  const video = document.getElementById("scannerVideo");
  const status = document.getElementById("scannerStatus");
  if (!modal || !video) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Este navegador no permite acceso a la cámara.", "error");
    return;
  }
  if (!scannerSupported()) {
    showToast("El escáner requiere Chrome/Edge con BarcodeDetector. Usa la búsqueda manual.", "error", 6000);
    return;
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
  document.getElementById("scannerMatches").innerHTML = "";
  document.getElementById("scannerManualInput").value = "";
  if (status) { status.textContent = "Iniciando cámara…"; status.classList.remove("hidden"); }

  try {
    _scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = _scannerStream;
    await video.play();

    _scannerDetector = new BarcodeDetector({
      formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"]
    });

    if (status) status.textContent = "Apunta al código de barras o QR del lote…";
    scanLoop();
  } catch (error) {
    console.error(error);
    closeScanner();
    showToast("No se pudo acceder a la cámara. Revisa permisos o usa la búsqueda manual.", "error", 6000);
  }
}

function scanLoop() {
  const video = document.getElementById("scannerVideo");
  if (!_scannerStream || !video || video.readyState < 2) {
    _scannerTimer = setTimeout(scanLoop, 300);
    return;
  }

  _scannerDetector.detect(video)
    .then((codes) => {
      if (codes && codes.length) {
        handleScanValue(codes[0].rawValue);
        return; // detiene el ciclo hasta nueva apertura
      }
      _scannerTimer = setTimeout(scanLoop, 250);
    })
    .catch(() => {
      _scannerTimer = setTimeout(scanLoop, 400);
    });
}

function closeScanner() {
  if (_scannerTimer) { clearTimeout(_scannerTimer); _scannerTimer = null; }
  if (_scannerStream) {
    _scannerStream.getTracks().forEach(t => t.stop());
    _scannerStream = null;
  }
  const modal = document.getElementById("scannerModal");
  modal?.classList.add("hidden");
  modal?.classList.remove("flex");
}

/**
 * Busca el valor escaneado contra LOTE, CODIGO e INSUMO.
 * Prioridad: lote exacto → código exacto → insumo que contiene el texto.
 */
function findRowsByScan(value) {
  const v = sanitizeText(value);
  if (!v) return [];
  const vl = v.toLowerCase();

  const byLote = app.rows.filter(r => sanitizeText(r["LOTE"]).toLowerCase() === vl);
  if (byLote.length) return byLote;

  const byCodigo = app.rows.filter(r => sanitizeText(r["CODIGO"]).toLowerCase() === vl);
  if (byCodigo.length) return byCodigo;

  return app.rows.filter(r =>
    sanitizeText(r["CODIGO INSUMO"]).toLowerCase().includes(vl)
  );
}

function handleScanValue(value) {
  stopScanLoopOnly();
  const matches = findRowsByScan(value);
  const container = document.getElementById("scannerMatches");

  if (!matches.length) {
    if (container) {
      container.innerHTML = `<li class="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
        Sin coincidencias para “${escapeHTML(sanitizeText(value))}”. Verifica el lote o usa la búsqueda manual.</li>`;
    }
    resumeScan();
    return;
  }

  if (container) {
    container.innerHTML = matches.slice(0, 8).map(row => `
      <li>
        <button type="button" data-scan-row-id="${escapeHTML(row.__id)}"
          class="w-full rounded-xl border border-[#82B340]/40 bg-white px-3 py-2 text-left text-xs transition hover:bg-[#F0F7E8]">
          <span class="font-extrabold text-slate-900">${escapeHTML(sanitizeText(row["CODIGO"]) || row["CODIGO INSUMO"])}</span>
          <span class="block text-slate-500">Lote ${escapeHTML(sanitizeText(row["LOTE"]) || "—")} · Stock: ${formatQuantity(row["CANTIDAD"])}</span>
        </button>
      </li>`).join("");
  }
}

function stopScanLoopOnly() {
  if (_scannerTimer) { clearTimeout(_scannerTimer); _scannerTimer = null; }
}

function resumeScan() {
  if (_scannerStream) scanLoop();
}

/** Selección desde resultados → abre consumo directamente. */
function selectScannedRow(rowId) {
  closeScanner();
  openConsumeModal(rowId);
}
