"use strict";

/******************************************************************
 * KARDEX DE CONTROL DE INSUMOS - NÚCLEO
 * SPA modular: idb.js · app.js · consumos.js · entradas.js ·
 * editor.js · charts.js · scanner.js · backup.js · extras.js
 ******************************************************************/

const STORAGE_KEY = "kardex_control_insumos_v3";
const PAGE_SIZE = 25;
const EXPIRY_WARN_DAYS = [30, 60, 90];

const REQUIRED_COLUMNS = [
  "CODIGO INSUMO",
  "CODIGO",
  "PRESENTACIÓN",
  "FECHA INGRESO",
  "CANTIDAD",
  "LOTE",
  "FECHA DE VENCIMIENTO",
  "UBICACIÓN",
  "SEDE",
  "STATUS",
  "PROVEEDOR",
  "SUBGRUPO",
  "PRECIO",
  "REGISTRO SANITARIO",
  "CLASIFICACIÓN DEL RIESGO",
  "CENTRO DE COSTO",
  "OBSERVACION"
];

const HEADER_ALIASES = {
  "FECHA INGRESO INVENTARIO O COMPRA": "FECHA INGRESO",
  "FECHA INGRESO INVENTARIO- O COMPRA": "FECHA INGRESO",
  "CENTRO DE COSTO DONDE SE CONSUME": "CENTRO DE COSTO",
  "OBSERVACIÓN": "OBSERVACION",
  "PRESENTACION": "PRESENTACIÓN",
  "CLASIFICACION DEL RIESGO": "CLASIFICACIÓN DEL RIESGO"
};

// Columnas de la hoja CONSUMOS que genera el propio aplicativo.
const CONSUMPTION_COLUMNS = [
  "FECHA", "CODIGO INSUMO", "CODIGO", "PRESENTACIÓN", "LOTE",
  "CANTIDAD CONSUMIDA", "CENTRO DE COSTO DE CONSUMO", "OBSERVACION",
  "SEDE", "PROVEEDOR"
];

// Columnas del registro de ENTRADAS de stock.
const ENTRY_COLUMNS = [
  "FECHA", "CODIGO INSUMO", "CODIGO", "PRESENTACIÓN", "LOTE",
  "CANTIDAD INGRESADA", "FACTURA / OC", "PROVEEDOR", "OBSERVACION", "SEDE"
];

const DATE_FIELDS = new Set(["FECHA INGRESO", "FECHA DE VENCIMIENTO"]);
const NUMBER_FIELDS = new Set(["CANTIDAD", "PRECIO"]);

const NEW_ITEM_TYPES = {
  "CODIGO INSUMO": "text",
  "CODIGO": "text",
  "PRESENTACIÓN": "text",
  "FECHA INGRESO": "date",
  "CANTIDAD": "number",
  "LOTE": "text",
  "FECHA DE VENCIMIENTO": "date",
  "UBICACIÓN": "text",
  "SEDE": "text",
  "STATUS": "text",
  "PROVEEDOR": "text",
  "SUBGRUPO": "text",
  "PRECIO": "number",
  "REGISTRO SANITARIO": "text",
  "CLASIFICACIÓN DEL RIESGO": "text",
  "CENTRO DE COSTO": "text",
  "OBSERVACION": "textarea"
};

const SORTABLE_EXCLUDED = new Set(["__ACTIONS__"]);

const app = {
  rows: [],
  filteredRows: [],
  consumptions: [],
  entradas: [],
  page: 1,
  search: "",
  sede: "",
  status: "",
  subgrupo: "",
  expFrom: "",
  expTo: "",
  sortKey: null,
  sortDir: "asc",
  selectedRowId: null,
  fileName: "",
  lastSavedAt: null,
  activeTab: "inventory",
  dirty: false
};

const $ = (id) => document.getElementById(id);

const els = {
  fileInput: $("fileInput"),
  fileInputMobile: $("fileInputMobile"),
  mobileLoadButton: $("mobileLoadButton"),
  dropZone: $("dropZone"),
  uploadSection: $("uploadSection"),
  dashboard: $("dashboard"),
  exportButton: $("exportButton"),
  newItemButton: $("newItemButton"),
  fileNameLabel: $("fileNameLabel"),
  restoreBanner: $("restoreBanner"),
  restoreBannerDate: $("restoreBannerDate"),
  restoreBannerBtn: $("restoreBannerBtn"),
  restoreBannerDismiss: $("restoreBannerDismiss"),
  searchInput: $("searchInput"),
  sedeFilter: $("sedeFilter"),
  statusFilter: $("statusFilter"),
  subgrupoFilter: $("subgrupoFilter"),
  expFrom: $("expFrom"),
  expTo: $("expTo"),
  clearFilters: $("clearFilters"),
  resultInfo: $("resultInfo"),
  autosaveStatus: $("autosaveStatus"),
  tableHead: $("tableHead"),
  tableBody: $("tableBody"),
  emptyState: $("emptyState"),
  pageInfo: $("pageInfo"),
  pageSummary: $("pageSummary"),
  prevPage: $("prevPage"),
  nextPage: $("nextPage"),
  pageNumbers: $("pageNumbers"),
  kpiRecords: $("kpiRecords"),
  kpiUnits: $("kpiUnits"),
  kpiExpired: $("kpiExpired"),
  kpiLowStock: $("kpiLowStock"),
  kpiExpiringSoon: $("kpiExpiringSoon"),
  consumeModal: $("consumeModal"),
  consumeTitle: $("consumeTitle"),
  consumeItemLabel: $("consumeItemLabel"),
  availableStock: $("availableStock"),
  consumeQuantity: $("consumeQuantity"),
  quantityHelp: $("quantityHelp"),
  consumeCostCenter: $("consumeCostCenter"),
  consumeObservation: $("consumeObservation"),
  openScannerButton: $("openScannerButton"),
  closeModal: $("closeModal"),
  cancelConsume: $("cancelConsume"),
  confirmConsume: $("confirmConsume"),
  toastContainer: $("toastContainer"),
  newItemModal: $("newItemModal"),
  newItemForm: $("newItemForm"),
  newItemFields: $("newItemFields"),
  closeNewItemModal: $("closeNewItemModal"),
  cancelNewItem: $("cancelNewItem")
};

/* ============================ UTILIDADES ============================ */

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function canonicalHeader(value) {
  const normalized = normalizeHeader(value);
  if (HEADER_ALIASES[normalized]) return HEADER_ALIASES[normalized];
  return REQUIRED_COLUMNS.find(c => normalizeHeader(c) === normalized) || normalized;
}

function sanitizeText(value) {
  return String(value ?? "").trim();
}

function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined || value === "") return 0;

  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return 0;

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length === 2 && parts[1].length <= 4) {
      text = text.replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(".")) {
    const parts = text.split(".");
    if (parts.length > 2) text = text.replace(/\./g, "");
  }

  const result = Number(text);
  return Number.isFinite(result) ? result : 0;
}

function excelSerialToISO(serial) {
  const parsed = XLSX.SSF.parse_date_code(Number(serial));
  if (!parsed) return "";
  return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function validDateParts(year, month, day) {
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return toISODate(value);
  if (typeof value === "number" && value > 20000 && value < 80000) return excelSerialToISO(value);

  const text = sanitizeText(value);
  if (!text) return "";

  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split("-").map(Number);
    return validDateParts(y, m, d)
      ? `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : "";
  }
  if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}$/.test(text)) {
    const [a, b, c] = text.split(/[\/\-]/).map(Number);
    return validDateParts(c, b, a)
      ? `${String(c).padStart(4, "0")}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}` : "";
  }

  const date = new Date(text);
  return !isNaN(date.getTime()) ? toISODate(date) : "";
}

function formatDate(value) {
  if (!value) return "—";
  const [y, m, d] = String(value).split("-");
  if (!y || !m || !d) return sanitizeText(value);
  return `${d}/${m}/${y}`;
}

function todayISO() {
  return toISODate(new Date());
}

function isExpired(value) {
  return Boolean(value) && value < todayISO();
}

/** Días restantes para vencer (negativo = vencido). null si no hay fecha. */
function daysToExpiry(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

/** Clase de alerta FEFO según días restantes. */
function expiryLevel(row) {
  const days = daysToExpiry(row["FECHA DE VENCIMIENTO"]);
  if (days === null) return "sin-fecha";
  if (days < 0) return "vencido";
  if (days <= 30) return "por-vencer-30";
  if (days <= 60) return "por-vencer-60";
  if (days <= 90) return "por-vencer-90";
  return "ok";
}

function expiryBadge(row) {
  const level = expiryLevel(row);
  const qty = parseNumber(row["CANTIDAD"]);
  if (level === "sin-fecha" || qty <= 0) return null;
  const days = daysToExpiry(row["FECHA DE VENCIMIENTO"]);
  const styles = {
    "vencido": "bg-rose-100 text-rose-800 ring-rose-300",
    "por-vencer-30": "bg-orange-100 text-orange-800 ring-orange-300",
    "por-vencer-60": "bg-amber-100 text-amber-800 ring-amber-300",
    "por-vencer-90": "bg-yellow-100 text-yellow-800 ring-yellow-300"
  };
  const style = styles[level];
  if (!style) return null;
  const label = days < 0 ? `vencido ${Math.abs(days)} d` : `${days} d`;
  return `<span class="status-pill ring-1 ${style}" title="Fecha de vencimiento">${label}</span>`;
}

function statusKey(row) {
  const quantity = parseNumber(row["CANTIDAD"]);
  if (quantity <= 0) return "AGOTADO";
  if (isExpired(row["FECHA DE VENCIMIENTO"])) return "VENCIDO";

  const original = normalizeHeader(row["STATUS"]);
  if (original === "AGOTADO") return "AGOTADO";
  if (original === "VENCIDO") return "VENCIDO";
  if (!original) return "DISPONIBLE";
  if (["DISPONIBLE", "ACTIVO", "OK"].includes(original)) return "DISPONIBLE";
  return "OTRO";
}

function matchesStatusFilter(row, filterValue) {
  if (!filterValue) return true;

  // Filtros FEFO: por vencer en N días (con stock).
  const soonMatch = filterValue.match(/^POR_VENCER_(\d+)$/);
  if (soonMatch) {
    const limit = Number(soonMatch[1]);
    if (parseNumber(row["CANTIDAD"]) <= 0) return false;
    const days = daysToExpiry(row["FECHA DE VENCIMIENTO"]);
    return days !== null && days >= 0 && days <= limit;
  }

  return statusKey(row) === filterValue;
}

function statusBadge(row) {
  const key = statusKey(row);
  const styles = {
    DISPONIBLE: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    AGOTADO: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
    VENCIDO: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    OTRO: "bg-slate-100 text-slate-700 ring-1 ring-slate-200"
  };
  const dots = {
    DISPONIBLE: "bg-emerald-500",
    AGOTADO: "bg-rose-500",
    VENCIDO: "bg-amber-500",
    OTRO: "bg-slate-400"
  };
  return `<span class="status-pill ${styles[key]}"><span class="h-1.5 w-1.5 rounded-full ${dots[key]}"></span>${escapeHTML(key)}</span>`;
}

function formatQuantity(value) {
  const n = parseNumber(value);
  if (!Number.isFinite(n)) return "0";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 4 }).format(n);
}

function formatCurrency(value) {
  const n = parseNumber(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency", currency: "COP", maximumFractionDigits: 0
  }).format(n);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function roundQuantity(value) {
  return Math.round((Number(value) + Number.EPSILON) * 10000) / 10000;
}

function localDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return sanitizeText(iso);
  return new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short" }).format(d);
}

function consumptionKey(ci, co, lo) {
  return `${sanitizeText(ci)}||${sanitizeText(co)}||${sanitizeText(lo)}`;
}

/** Detecta duplicados por código+insumo+lote (lote no vacío). */
function findDuplicateRow(ci, co, lote, excludeId) {
  if (!sanitizeText(lote)) return null;
  return app.rows.find(r =>
    r.__id !== excludeId &&
    sanitizeText(r["CODIGO INSUMO"]) === sanitizeText(ci) &&
    sanitizeText(r["CODIGO"]) === sanitizeText(co) &&
    sanitizeText(r["LOTE"]) === sanitizeText(lote)
  );
}

/* ======================= CARGA Y NORMALIZACIÓN ======================= */

function createRow(headers, rawRow, index) {
  const obj = {};
  REQUIRED_COLUMNS.forEach(col => { obj[col] = ""; });

  headers.forEach((rawHeader, colIndex) => {
    const canonical = canonicalHeader(rawHeader);
    if (REQUIRED_COLUMNS.includes(canonical)) {
      obj[canonical] = rawRow[colIndex] ?? "";
    }
  });

  REQUIRED_COLUMNS.forEach(col => {
    if (DATE_FIELDS.has(col)) obj[col] = parseDate(obj[col]);
    else if (NUMBER_FIELDS.has(col)) obj[col] = parseNumber(obj[col]);
    else obj[col] = sanitizeText(obj[col]);
  });

  obj.__initialQty = obj["CANTIDAD"];
  obj.__id = `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`;
  obj.__originalOrder = index;
  return obj;
}

function validateHeaders(headers) {
  const canonicalHeaders = headers.map(canonicalHeader);
  const missing = REQUIRED_COLUMNS.filter(col => !canonicalHeaders.includes(col));
  return { missing, canonicalHeaders };
}

async function handleFile(file) {
  if (!file) return;

  if (typeof XLSX === "undefined") {
    showToast("No se pudo cargar SheetJS. Verifica tu conexión o la caché del Service Worker.", "error", 7000);
    return;
  }
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    showToast("Selecciona un archivo .xlsx o .xls.", "error");
    return;
  }

  try {
    showToast("Procesando archivo Excel…", "info");

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: false, raw: true });

    const preferredSheet = workbook.SheetNames.find(name => normalizeHeader(name) === "KARDEX");
    const sheetName = preferredSheet || workbook.SheetNames[0];
    if (!sheetName) throw new Error("El libro no contiene hojas.");

    const ws = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
    if (!matrix.length) throw new Error("La hoja seleccionada está vacía.");

    const headers = matrix[0].map(sanitizeText);
    const validation = validateHeaders(headers);
    if (validation.missing.length) {
      throw new Error(`Faltan columnas requeridas: ${validation.missing.join(", ")}`);
    }

    const dataRows = matrix
      .slice(1)
      .filter(row => row.some(cell => sanitizeText(cell) !== ""))
      .map((row, i) => createRow(headers, row, i));

    if (!dataRows.length) throw new Error("No se encontraron registros después de los encabezados.");

    // Hoja CONSUMOS (historial generado por el aplicativo).
    let importedConsumptions = [];
    const consSheetName = workbook.SheetNames.find(name => normalizeHeader(name) === "CONSUMOS");
    if (consSheetName) {
      const cmatrix = XLSX.utils.sheet_to_json(workbook.Sheets[consSheetName], { header: 1, defval: "", raw: true });
      if (cmatrix.length > 1) {
        const cHeaders = cmatrix[0].map(sanitizeText);
        importedConsumptions = cmatrix
          .slice(1)
          .filter(row => row.some(cell => sanitizeText(cell) !== ""))
          .map((row, i) => createConsumptionRow(cHeaders, row, i));
      }
    }

    app.rows = dataRows;
    app.consumptions = importedConsumptions;
    app.entradas = [];
    app.page = 1;
    app.sortKey = null;
    app.sortDir = "asc";
    app.fileName = file.name;

    applyImportedConsumptionBaseline();

    populateFilters();
    resetFilters(false);
    rebuildConsumptionControls();
    hideRestoreBanner();
    showDashboard();
    await saveLocalData();
    render();

    showToast(
      importedConsumptions.length
        ? `Kardex cargado: ${dataRows.length} registros · ${importedConsumptions.length} consumos importados.`
        : `Kardex cargado: ${dataRows.length} registros.`,
      "success"
    );
  } catch (error) {
    console.error(error);
    showToast(error.message || "No fue posible procesar el archivo.", "error", 6500);
  }
}

function showDashboard() {
  els.uploadSection.classList.add("hidden");
  els.dashboard.classList.remove("hidden");
  els.exportButton.disabled = false;
  els.newItemButton.hidden = false;
  els.fileNameLabel.textContent = `${app.fileName || "Kardex cargado"} · ${app.rows.length} registros`;
}

/* ==================== FILTROS, ORDEN Y TABLA ==================== */

function populateFilters() {
  const unique = (field) => [...new Set(app.rows.map(r => sanitizeText(r[field])).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" }));

  els.sedeFilter.innerHTML = `<option value="">Todas</option>` +
    unique("SEDE").map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");

  els.subgrupoFilter.innerHTML = `<option value="">Todos</option>` +
    unique("SUBGRUPO").map(v => `<option value="${escapeHTML(v)}">${escapeHTML(v)}</option>`).join("");
}

function resetFilters(rerender = true) {
  app.search = "";
  app.sede = "";
  app.status = "";
  app.subgrupo = "";
  app.expFrom = "";
  app.expTo = "";
  app.page = 1;

  els.searchInput.value = "";
  els.sedeFilter.value = "";
  els.statusFilter.value = "";
  els.subgrupoFilter.value = "";
  els.expFrom.value = "";
  els.expTo.value = "";

  if (rerender) render();
}

function rowMatches(row) {
  const haystack = REQUIRED_COLUMNS.map(col => {
    if (DATE_FIELDS.has(col)) return formatDate(row[col]);
    return String(row[col] ?? "");
  }).join(" ").toLowerCase();

  const searchOk = !app.search || haystack.includes(app.search.toLowerCase());
  const sedeOk = !app.sede || String(row["SEDE"]) === app.sede;
  const statusOk = matchesStatusFilter(row, app.status);
  const subgrupoOk = !app.subgrupo || String(row["SUBGRUPO"]) === app.subgrupo;

  let expiryOk = true;
  if (app.expFrom || app.expTo) {
    const d = row["FECHA DE VENCIMIENTO"];
    if (!d) expiryOk = false;
    else {
      if (app.expFrom && d < app.expFrom) expiryOk = false;
      if (expiryOk && app.expTo && d > app.expTo) expiryOk = false;
    }
  }

  return searchOk && sedeOk && statusOk && subgrupoOk && expiryOk;
}

function compareValues(a, b) {
  const na = parseNumber(a), nb = parseNumber(b);
  const aIsNum = typeof a === "number" || (typeof a === "string" && a !== "" && !isNaN(Number(a)));
  const bIsNum = typeof b === "number" || (typeof b === "string" && b !== "" && !isNaN(Number(b)));
  if (aIsNum && bIsNum) return na - nb;

  const sa = String(a ?? ""), sb = String(b ?? "");
  if (!sa && sb) return 1;
  if (sa && !sb) return -1;
  return sa.localeCompare(sb, "es", { numeric: true, sensitivity: "base" });
}

function applyFilters() {
  app.filteredRows = app.rows.filter(rowMatches);

  if (app.sortKey) {
    const dir = app.sortDir === "asc" ? 1 : -1;
    const key = app.sortKey;
    app.filteredRows.sort((a, b) => compareValues(a[key], b[key]) * dir);
  } else {
    app.filteredRows.sort((a, b) => (a.__originalOrder ?? 0) - (b.__originalOrder ?? 0));
  }

  const maxPage = Math.max(1, Math.ceil(app.filteredRows.length / PAGE_SIZE));
  if (app.page > maxPage) app.page = maxPage;
}

function renderHead() {
  const headers = REQUIRED_COLUMNS.map((col, i) => {
    const sticky = i === 0 ? "sticky-col" : "";
    const active = app.sortKey === col;
    const arrow = active ? (app.sortDir === "asc" ? "▲" : "▼") : "↕";
    const ariaSort = active ? (app.sortDir === "asc" ? "ascending" : "descending") : "none";
    return `<th class="${sticky} th-sort border-b border-slate-600 bg-[#0f3d5e] px-3 py-3 text-[10px] font-extrabold uppercase tracking-wide text-white"
      data-sort-key="${escapeHTML(col)}" title="Ordenar por ${escapeHTML(col)}"
      aria-sort="${ariaSort}" tabindex="0" role="columnheader">
      <span class="inline-flex items-center gap-1">${escapeHTML(col)}<span class="sort-arrow ${active ? "" : "opacity-40"}">${arrow}</span></span></th>`;
  }).join("");

  els.tableHead.innerHTML =
    `<tr>${headers}<th class="sticky right-0 z-20 border-b border-slate-600 bg-[#0f3d5e] px-3 py-3 text-[10px] font-extrabold uppercase tracking-wide text-white">ACCIONES</th></tr>`;
}

function actionButtonsHTML(row) {
  const qty = parseNumber(row["CANTIDAD"]);
  const disabledConsume = qty <= 0;
  return `
    <div class="flex items-center justify-end gap-1">
      <button type="button" data-action="consume" data-row-id="${escapeHTML(row.__id)}"
        title="Consumir (salida de stock)" aria-label="Consumir lote ${escapeHTML(row["LOTE"] || "sin lote")}"
        class="inline-flex items-center rounded-lg px-2 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition ${disabledConsume ? "cursor-not-allowed bg-slate-400 opacity-40" : "bg-[#6F9F35] hover:bg-[#557D29]"}"
        ${disabledConsume ? "disabled" : ""}>−</button>
      <button type="button" data-action="entry" data-row-id="${escapeHTML(row.__id)}"
        title="Ingresar stock (entrada)" aria-label="Ingresar stock al lote ${escapeHTML(row["LOTE"] || "sin lote")}"
        class="inline-flex items-center rounded-lg bg-[#2F6FED] px-2 py-1.5 text-[11px] font-extrabold text-white shadow-sm transition hover:bg-[#1E56C8]">＋</button>
      <button type="button" data-action="edit" data-row-id="${escapeHTML(row.__id)}"
        title="Editar registro" aria-label="Editar registro del lote ${escapeHTML(row["LOTE"] || "sin lote")}"
        class="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-extrabold text-slate-700 transition hover:border-[#82B340] hover:text-[#557D29]">✎</button>
      <button type="button" data-action="delete" data-row-id="${escapeHTML(row.__id)}"
        title="Eliminar registro" aria-label="Eliminar registro del lote ${escapeHTML(row["LOTE"] || "sin lote")}"
        class="inline-flex items-center rounded-lg border border-rose-200 bg-white px-2 py-1.5 text-[11px] font-extrabold text-rose-600 transition hover:bg-rose-50">🗑</button>
    </div>`;
}

function renderBody() {
  const total = app.filteredRows.length;
  const start = (app.page - 1) * PAGE_SIZE;
  const pageRows = app.filteredRows.slice(start, start + PAGE_SIZE);

  els.emptyState.classList.toggle("hidden", pageRows.length > 0);
  els.tableBody.innerHTML = "";

  if (!pageRows.length) return;

  const fragment = document.createDocumentFragment();

  pageRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "group transition hover:bg-[#F0F7E8]/30";

    REQUIRED_COLUMNS.forEach((col, i) => {
      const td = document.createElement("td");
      td.className = [
        "border-b border-slate-100 px-3 py-2.5 align-top text-[11px] text-slate-700 dark-table-cell",
        i === 0 ? "sticky-col font-bold text-slate-900" : "",
        col === "OBSERVACION" ? "max-w-[260px]" : "",
        col === "PRESENTACIÓN" ? "min-w-[120px]" : ""
      ].join(" ");

      if (col === "STATUS") {
        td.innerHTML = statusBadge(row);
      } else if (col === "CANTIDAD") {
        const qty = parseNumber(row[col]);
        const low = qty > 0 && qty <= 5;
        td.innerHTML = `<span class="${low ? "font-extrabold text-amber-700" : "font-semibold text-slate-900"}">${escapeHTML(formatQuantity(qty))}</span>`;
      } else if (DATE_FIELDS.has(col)) {
        td.textContent = formatDate(row[col]);
        if (col === "FECHA DE VENCIMIENTO") {
          const badge = expiryBadge(row);
          if (badge) {
            td.innerHTML = `<div class="flex flex-col gap-1"><span>${formatDate(row[col])}</span>${badge}</div>`;
          }
        }
      } else if (col === "PRECIO") {
        td.textContent = formatCurrency(row[col]);
      } else {
        td.textContent = sanitizeText(row[col]) || "—";
        if (col === "OBSERVACION") td.title = sanitizeText(row[col]);
      }

      tr.appendChild(td);
    });

    const actionTd = document.createElement("td");
    actionTd.className = "sticky right-0 z-10 border-b border-slate-100 bg-white px-3 py-2.5 group-hover:bg-[#F0F7E8]/30";
    actionTd.innerHTML = actionButtonsHTML(row);
    tr.appendChild(actionTd);

    fragment.appendChild(tr);
  });

  els.tableBody.appendChild(fragment);
}

function getPageWindow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const result = [1];
  if (current > 4) result.push("…");

  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  for (let i = from; i <= to; i++) result.push(i);

  if (current < total - 3) result.push("…");
  result.push(total);
  return result;
}

function renderPagination() {
  const total = app.filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total ? (app.page - 1) * PAGE_SIZE + 1 : 0;
  const end = Math.min(app.page * PAGE_SIZE, total);

  els.resultInfo.textContent = `${new Intl.NumberFormat("es-CO").format(total)} resultado${total === 1 ? "" : "s"}`;
  els.pageInfo.textContent = `Página ${app.page} de ${totalPages}`;
  els.pageSummary.textContent = total ? `Mostrando ${start}–${end} de ${new Intl.NumberFormat("es-CO").format(total)}` : "Sin resultados";
  els.prevPage.disabled = app.page <= 1;
  els.nextPage.disabled = app.page >= totalPages;

  const pages = getPageWindow(app.page, totalPages);
  els.pageNumbers.innerHTML = pages.map(p => {
    if (p === "…") return `<span class="grid h-8 w-8 place-items-center text-xs text-slate-400">…</span>`;
    const active = p === app.page;
    return `<button type="button" data-page="${p}" aria-label="Ir a página ${p}" class="grid h-8 w-8 place-items-center rounded-lg text-xs font-bold ${active ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}">${p}</button>`;
  }).join("");
}

function renderKPIs() {
  const units = app.rows.reduce((sum, row) => sum + parseNumber(row["CANTIDAD"]), 0);
  const expired = app.rows.filter(row => isExpired(row["FECHA DE VENCIMIENTO"]) && parseNumber(row["CANTIDAD"]) > 0).length;
  const low = app.rows.filter(row => {
    const q = parseNumber(row["CANTIDAD"]);
    return q > 0 && q <= 5;
  }).length;
  const expiringSoon = app.rows.filter(row => {
    if (parseNumber(row["CANTIDAD"]) <= 0) return false;
    const days = daysToExpiry(row["FECHA DE VENCIMIENTO"]);
    return days !== null && days >= 0 && days <= 90;
  }).length;

  els.kpiRecords.textContent = new Intl.NumberFormat("es-CO").format(app.rows.length);
  els.kpiUnits.textContent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(units);
  els.kpiExpired.textContent = new Intl.NumberFormat("es-CO").format(expired);
  els.kpiLowStock.textContent = new Intl.NumberFormat("es-CO").format(low);
  els.kpiExpiringSoon.textContent = new Intl.NumberFormat("es-CO").format(expiringSoon);
}

function render() {
  applyFilters();
  renderHead();
  renderBody();
  renderPagination();
  renderKPIs();
  renderConsumptionPanel();
  els.exportButton.disabled = app.rows.length === 0;
}

/* ========================= MODAL DE CONSUMO ========================= */

function setConsumeTarget(row) {
  const available = parseNumber(row["CANTIDAD"]);
  els.consumeItemLabel.textContent = `${sanitizeText(row["CODIGO INSUMO"]) || "Insumo"} · Lote ${sanitizeText(row["LOTE"]) || "—"}`;
  els.availableStock.textContent = formatQuantity(available);
  els.quantityHelp.textContent = `Máximo permitido: ${formatQuantity(available)} ${sanitizeText(row["PRESENTACIÓN"]) || "unidades"}`;
  els.consumeQuantity.value = "";
  els.consumeQuantity.max = String(available);
  els.consumeCostCenter.value = "";
  els.consumeObservation.value = "";
}

function openConsumeModal(rowId) {
  const row = app.rows.find(r => r.__id === rowId);
  if (!row) return;

  app.selectedRowId = rowId;
  setConsumeTarget(row);
  els.consumeModal.classList.remove("hidden");
  els.consumeModal.classList.add("flex");
  setTimeout(() => els.consumeQuantity.focus(), 50);
}

function closeConsumeModal() {
  app.selectedRowId = null;
  els.consumeModal.classList.add("hidden");
  els.consumeModal.classList.remove("flex");
}

function confirmConsume() {
  const row = app.rows.find(r => r.__id === app.selectedRowId);
  if (!row) return;

  const quantity = parseNumber(els.consumeQuantity.value);
  const costCenter = sanitizeText(els.consumeCostCenter.value);
  const observation = sanitizeText(els.consumeObservation.value);
  const available = parseNumber(row["CANTIDAD"]);

  if (!quantity || quantity <= 0) {
    showToast("La cantidad a consumir debe ser mayor que cero.", "error");
    return;
  }
  if (quantity > available) {
    showToast(`No puedes consumir ${formatQuantity(quantity)}. Stock disponible: ${formatQuantity(available)}.`, "error", 5500);
    return;
  }
  if (!costCenter) {
    showToast("Indica el centro de costo de consumo.", "error");
    els.consumeCostCenter.focus();
    return;
  }

  row["CANTIDAD"] = roundQuantity(available - quantity);

  app.consumptions.push({
    FECHA: new Date().toISOString(),
    "CODIGO INSUMO": row["CODIGO INSUMO"],
    "CODIGO": row["CODIGO"],
    "PRESENTACIÓN": row["PRESENTACIÓN"],
    "LOTE": row["LOTE"],
    "CANTIDAD CONSUMIDA": quantity,
    "CENTRO DE COSTO DE CONSUMO": costCenter,
    "OBSERVACION": observation,
    "SEDE": row["SEDE"],
    "PROVEEDOR": row["PROVEEDOR"]
  });

  rebuildConsumptionControls();
  closeConsumeModal();
  saveLocalData();
  render();

  showToast(`Consumo registrado: ${formatQuantity(quantity)}. Stock restante: ${formatQuantity(row["CANTIDAD"])}.`, "success", 5000);
}

/* ====================== MODAL NUEVO INSUMO ====================== */

const FIELD_INPUT_CLASS = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#82B340] focus:ring-4 focus:ring-[#82B340]/10";

/** Genera los campos del formulario de insumo. values opcional para edición. */
function buildItemFields(container, values = {}, idPrefix = "new") {
  container.innerHTML = REQUIRED_COLUMNS.map(column => {
    const type = NEW_ITEM_TYPES[column] || "text";
    const required = ["CODIGO INSUMO", "CANTIDAD"].includes(column);
    const value = values[column] ?? "";
    const fieldValue = DATE_FIELDS.has(column)
      ? (parseDate(value) || "")
      : NUMBER_FIELDS.has(column)
        ? (values[column] ?? "")
        : sanitizeText(value);
    const label = `${escapeHTML(column)}${required ? ' <span class="text-rose-500">*</span>' : ''}`;
    const common = `name="${escapeHTML(column)}" id="${idPrefix}-${escapeHTML(column)}" aria-label="${escapeHTML(column)}" class="${FIELD_INPUT_CLASS}" ${required ? "required" : ""}`;

    if (type === "textarea") {
      return `
        <div class="md:col-span-2 xl:col-span-3">
          <label for="${idPrefix}-${escapeHTML(column)}" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">${label}</label>
          <textarea ${common} rows="3" maxlength="500" placeholder="Observación opcional">${escapeHTML(fieldValue)}</textarea>
        </div>`;
    }

    const placeholder =
      column === "STATUS" ? "Ej. Disponible" :
      column === "CANTIDAD" ? "0" :
      column === "PRECIO" ? "0" :
      column === "SEDE" ? "Ej. 104" :
      column === "CENTRO DE COSTO" ? "Ej. CC-SALUD" : "";

    const colSpan = ["CODIGO INSUMO", "PRESENTACIÓN", "PROVEEDOR", "REGISTRO SANITARIO", "CLASIFICACIÓN DEL RIESGO"].includes(column)
      ? "md:col-span-2 xl:col-span-1" : "";

    return `
      <div class="${colSpan}">
        <label for="${idPrefix}-${escapeHTML(column)}" class="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">${label}</label>
        <input type="${type}" ${common}
          value="${escapeHTML(fieldValue)}"
          ${placeholder ? `placeholder="${escapeHTML(placeholder)}"` : ""}
          ${type === "number" ? 'min="0" step="any" inputmode="decimal"' : ""} />
      </div>`;
  }).join("");

  if (!values["STATUS"]) {
    const f = container.querySelector(`[name="STATUS"]`);
    if (f) f.value = "Disponible";
  }
  if (!values["FECHA INGRESO"]) {
    const f = container.querySelector(`[name="FECHA INGRESO"]`);
    if (f) f.value = todayISO();
  }
}

function readItemFields(formRoot) {
  const result = {};
  REQUIRED_COLUMNS.forEach(column => {
    const field = formRoot.querySelector(`[name="${column}"]`);
    if (!field) { result[column] = ""; return; }
    if (DATE_FIELDS.has(column)) result[column] = parseDate(field.value);
    else if (NUMBER_FIELDS.has(column)) result[column] = parseNumber(field.value);
    else result[column] = sanitizeText(field.value);
  });
  return result;
}

function openNewItemModal() {
  if (!app.rows.length) {
    showToast("Primero carga un Kardex para poder añadir un insumo.", "error");
    return;
  }
  buildItemFields(els.newItemFields);
  els.newItemModal.classList.remove("hidden");
  els.newItemModal.classList.add("flex");
  setTimeout(() => {
    const field = els.newItemForm.elements["CODIGO INSUMO"];
    if (field) field.focus();
  }, 50);
}

function closeNewItemModal() {
  els.newItemModal.classList.add("hidden");
  els.newItemModal.classList.remove("flex");
}

function addNewItem(event) {
  event.preventDefault();

  if (!app.rows.length) {
    showToast("Primero carga un Kardex.", "error");
    return;
  }

  const newRow = readItemFields(els.newItemForm);

  if (!newRow["CODIGO INSUMO"]) {
    showToast("El campo CODIGO INSUMO es obligatorio.", "error");
    return;
  }
  if (newRow["CANTIDAD"] < 0) {
    showToast("La cantidad no puede ser negativa.", "error");
    return;
  }

  // Detección de duplicados (mismo insumo + código + lote).
  const dup = findDuplicateRow(newRow["CODIGO INSUMO"], newRow["CODIGO"], newRow["LOTE"], null);
  if (dup) {
    showToast(`Ya existe un registro con ese insumo/código y lote "${sanitizeText(newRow["LOTE"])}". Usa “Ingresar stock” sobre el existente o cambia el lote.`, "error", 6500);
    return;
  }

  if (!newRow["STATUS"]) {
    newRow["STATUS"] = newRow["CANTIDAD"] > 0 ? "Disponible" : "Agotado";
  }

  const maxOrder = app.rows.reduce(
    (max, row) => Math.max(max, Number(row.__originalOrder) || 0), -1
  );

  newRow.__initialQty = newRow["CANTIDAD"];
  newRow.__originalOrder = maxOrder + 1;
  newRow.__id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  app.rows.push(newRow);
  app.page = Math.max(1, Math.ceil(app.rows.length / PAGE_SIZE));

  populateFilters();
  closeNewItemModal();
  saveLocalData();
  render();

  showToast(`Nuevo insumo añadido: ${newRow["CODIGO INSUMO"]}.`, "success", 4500);
}

/* ===================== PERSISTENCIA (IndexedDB) ===================== */

let _saveSequence = 0;

function snapshotPayload() {
  return {
    version: 3,
    savedAt: new Date().toISOString(),
    fileName: app.fileName,
    rows: app.rows,
    consumptions: app.consumptions,
    entradas: app.entradas
  };
}

async function saveLocalData() {
  if (!app.rows.length) return;
  app.dirty = true;
  const seq = ++_saveSequence;

  try {
    const payload = snapshotPayload();
    const where = await persistState(payload);

    // Ignora respuestas de guardados obsoletos.
    if (seq !== _saveSequence) return;

    app.lastSavedAt = payload.savedAt;
    app.dirty = false;
    const whereLabel = where === "idb" ? "IndexedDB" : where === "local" ? "localStorage" : "—";
    els.autosaveStatus.textContent = where
      ? `Guardado (${whereLabel}): ${localDateTime(payload.savedAt)}`
      : "Almacenamiento no disponible";
  } catch (error) {
    console.warn("Error al guardar:", error);
    if (seq === _saveSequence) {
      els.autosaveStatus.textContent = "Error al guardar";
    }
  }
}

/** Normaliza filas provenientes de respaldo/IndexedDB. */
function normalizeRestoredRows(rawRows) {
  return rawRows.map((row, i) => {
    const restored = {};
    REQUIRED_COLUMNS.forEach(col => {
      restored[col] = row[col] ?? "";
      if (DATE_FIELDS.has(col)) restored[col] = parseDate(restored[col]);
      if (NUMBER_FIELDS.has(col)) restored[col] = parseNumber(restored[col]);
    });
    restored.__initialQty = Number.isFinite(row.__initialQty)
      ? row.__initialQty
      : parseNumber(restored["CANTIDAD"]);
    restored.__id = row.__id || `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`;
    restored.__originalOrder = row.__originalOrder ?? i;
    return restored;
  });
}

function applyPersistedPayload(payload) {
  app.rows = normalizeRestoredRows(payload.rows);
  app.consumptions = Array.isArray(payload.consumptions) ? payload.consumptions : [];
  app.entradas = Array.isArray(payload.entradas) ? payload.entradas : [];
  app.fileName = payload.fileName || "Kardex restaurado";
  app.lastSavedAt = payload.savedAt || null;
  app.dirty = false;

  populateFilters();
  resetFilters(false);
  rebuildConsumptionControls();
  hideRestoreBanner();
  showDashboard();
  render();
  els.autosaveStatus.textContent = `Restaurado: ${localDateTime(app.lastSavedAt)}`;
}

function hideRestoreBanner() {
  if (els.restoreBanner) els.restoreBanner.classList.add("hidden");
}

/* ============================ EXPORTAR ============================ */

function toExportRow(row) {
  return REQUIRED_COLUMNS.map(col => {
    if (DATE_FIELDS.has(col)) {
      return row[col] ? new Date(`${row[col]}T00:00:00`) : "";
    }
    if (NUMBER_FIELDS.has(col)) return parseNumber(row[col]);
    if (col === "STATUS") {
      const key = statusKey(row);
      if (key === "AGOTADO" || key === "VENCIDO") return key;
      return sanitizeText(row[col]) || "DISPONIBLE";
    }
    return sanitizeText(row[col]);
  });
}

function exportWorkbook() {
  if (!app.rows.length) {
    showToast("No hay registros para exportar.", "error");
    return;
  }

  try {
    const exportData = [
      REQUIRED_COLUMNS,
      ...app.rows
        .slice()
        .sort((a, b) => (a.__originalOrder ?? 0) - (b.__originalOrder ?? 0))
        .map(toExportRow)
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(exportData);

    ws["!cols"] = [
      { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 14 }, { wch: 12 },
      { wch: 16 }, { wch: 18 }, { wch: 20 }, { wch: 10 }, { wch: 14 },
      { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 26 }, { wch: 24 },
      { wch: 22 }, { wch: 36 }
    ];

    for (let r = 1; r < exportData.length; r++) {
      for (const c of [3, 6]) {
        const address = XLSX.utils.encode_cell({ r, c });
        if (ws[address] && ws[address].v instanceof Date) ws[address].z = "dd/mm/yyyy";
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, "KARDEX");

    if (app.consumptions.length) {
      const consumptionHeaders = [...CONSUMPTION_COLUMNS];
      const consumptionRows = app.consumptions.map(item => consumptionHeaders.map(h => item[h] ?? ""));
      const cws = XLSX.utils.aoa_to_sheet([consumptionHeaders, ...consumptionRows]);
      cws["!cols"] = [
        { wch: 20 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 16 },
        { wch: 20 }, { wch: 30 }, { wch: 45 }, { wch: 10 }, { wch: 28 }
      ];
      XLSX.utils.book_append_sheet(wb, cws, "CONSUMOS");
    }

    if (app.entradas.length) {
      const entryHeaders = [...ENTRY_COLUMNS];
      const entryRows = app.entradas.map(item => entryHeaders.map(h => item[h] ?? ""));
      const ews = XLSX.utils.aoa_to_sheet([entryHeaders, ...entryRows]);
      ews["!cols"] = [
        { wch: 20 }, { wch: 24 }, { wch: 22 }, { wch: 18 }, { wch: 16 },
        { wch: 20 }, { wch: 22 }, { wch: 26 }, { wch: 40 }, { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, ews, "ENTRADAS");
    }

    const base = (app.fileName || "kardex").replace(/\.[^.]+$/, "");
    const filename = `${base}_ACTUALIZADO_${todayISO()}.xlsx`;
    XLSX.writeFile(wb, filename);

    showToast(`Archivo exportado: ${filename}`, "success", 5500);
  } catch (error) {
    console.error(error);
    showToast("No fue posible generar el archivo Excel.", "error", 5500);
  }
}

/* ============================== TOAST ============================== */

function showToast(message, type = "info", duration = 3800) {
  const colors = {
    success: "border-emerald-200 bg-white text-emerald-800",
    error: "border-rose-200 bg-white text-rose-800",
    info: "border-cyan-200 bg-white text-cyan-800"
  };

  const icon = { success: "✓", error: "!", info: "i" }[type] || "i";

  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.className = `pointer-events-auto flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl shadow-slate-900/10 ${colors[type] || colors.info}`;
  el.innerHTML = `
    <span class="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-extrabold">${icon}</span>
    <span class="leading-5">${escapeHTML(message)}</span>
  `;

  els.toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(4px)";
    el.style.transition = "all .2s ease";
    setTimeout(() => el.remove(), 220);
  }, duration);
}
