"use strict";

/* ====================================================================
   MÓDULO: CONSUMOS Y VALIDACIÓN SEMESTRAL
   - Importa la hoja CONSUMOS de archivos generados por el aplicativo.
   - Reconstruye el stock inicial (stock del archivo + consumos).
   - Valida registros por periodo académico (FEFO, centro de costo…).
   ==================================================================== */

const SEMESTER_DEFS = {
  S1: { label: "Semestre 1 · Ene–Jun", fromMonth: "01", fromDay: "01", toMonth: "06", toDay: "30" },
  S2: { label: "Semestre 2 · Jul–Dic", fromMonth: "07", fromDay: "01", toMonth: "12", toDay: "31" }
};

/* ---------- Normalización de la hoja CONSUMOS ---------- */

function canonicalConsumptionHeader(value) {
  const normalized = normalizeHeader(value);
  return CONSUMPTION_COLUMNS.find(c => normalizeHeader(c) === normalized) || normalized;
}

function normalizeConsumptionFecha(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const iso = excelSerialToISO(value);
    return iso ? `${iso}T12:00:00.000Z` : "";
  }
  return sanitizeText(value);
}

function createConsumptionRow(headers, rawRow) {
  const obj = {};
  CONSUMPTION_COLUMNS.forEach(col => { obj[col] = ""; });

  headers.forEach((rawHeader, colIndex) => {
    const canonical = canonicalConsumptionHeader(rawHeader);
    if (CONSUMPTION_COLUMNS.includes(canonical)) {
      obj[canonical] = rawRow[colIndex] ?? "";
    }
  });

  obj.FECHA = normalizeConsumptionFecha(obj.FECHA);
  obj["CANTIDAD CONSUMIDA"] = parseNumber(obj["CANTIDAD CONSUMIDA"]);
  ["CODIGO INSUMO", "CODIGO", "PRESENTACIÓN", "LOTE", "CENTRO DE COSTO DE CONSUMO", "OBSERVACION", "SEDE", "PROVEEDOR"]
    .forEach(col => { obj[col] = sanitizeText(obj[col]); });

  return obj;
}

/**
 * El KARDEX de un archivo exportado ya viene con las salidas descontadas:
 * reconstruye el stock inicial como stock actual + total consumido del lote.
 */
function applyImportedConsumptionBaseline() {
  if (!app.consumptions.length) return;
  const totals = globalConsumedByKey();
  app.rows.forEach(row => {
    const key = consumptionKey(row["CODIGO INSUMO"], row["CODIGO"], row["LOTE"]);
    const consumed = totals.get(key) || 0;
    if (consumed > 0) {
      row.__initialQty = roundQuantity(parseNumber(row["CANTIDAD"]) + consumed);
    }
  });
}

function recordDateISO(rec) {
  const raw = sanitizeText(rec.FECHA);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? "" : toISODate(d);
}

function globalConsumedByKey() {
  const map = new Map();
  app.consumptions.forEach(rec => {
    const key = consumptionKey(rec["CODIGO INSUMO"], rec["CODIGO"], rec["LOTE"]);
    map.set(key, (map.get(key) || 0) + parseNumber(rec["CANTIDAD CONSUMIDA"]));
  });
  return map;
}

/** Un mismo lote puede estar repartido en varias filas del KARDEX. */
function kardexRowsForKey(rec) {
  const ci = sanitizeText(rec["CODIGO INSUMO"]);
  const co = sanitizeText(rec["CODIGO"]);
  const lo = sanitizeText(rec["LOTE"]);
  return app.rows.filter(r =>
    sanitizeText(r["CODIGO INSUMO"]) === ci &&
    sanitizeText(r["CODIGO"]) === co &&
    sanitizeText(r["LOTE"]) === lo
  );
}

/* ---------- Selector de periodo ---------- */

function buildSemesterOptionsHTML() {
  const years = new Set([new Date().getFullYear()]);
  app.consumptions.forEach(rec => {
    const iso = recordDateISO(rec);
    if (iso) years.add(Number(iso.slice(0, 4)));
  });

  const sorted = [...years].filter(y => Number.isFinite(y)).sort((a, b) => b - a);

  let html = `<option value="all">Todo el historial</option>`;
  sorted.forEach(y => {
    html += `<option value="${y}-S1">${SEMESTER_DEFS.S1.label} · ${y}</option>`;
    html += `<option value="${y}-S2">${SEMESTER_DEFS.S2.label} · ${y}</option>`;
  });
  html += `<option value="custom">Rango personalizado…</option>`;
  return html;
}

function detectDefaultSelection(values) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${now.getMonth() >= 6 ? "S2" : "S1"}`;
  if (values.includes(currentKey)) return currentKey;

  const firstPeriod = values.find(v => /^\d{4}-S[12]$/.test(v));
  return firstPeriod || "all";
}

const elsSemesterSelect = () => document.getElementById("semesterSelect");
const elsCustomRangeWrap = () => document.getElementById("customRangeWrap");
const elsConsFrom = () => document.getElementById("consFrom");
const elsConsTo = () => document.getElementById("consTo");

function rebuildConsumptionControls() {
  const select = elsSemesterSelect();
  if (!select) return;

  const prev = select.value;
  select.innerHTML = buildSemesterOptionsHTML();

  const values = [...select.options].map(o => o.value);
  select.value = prev && values.includes(prev) ? prev : detectDefaultSelection(values);

  syncCustomRangeVisibility();
}

function syncCustomRangeVisibility() {
  const wrap = elsCustomRangeWrap();
  if (!wrap) return;
  const isCustom = elsSemesterSelect().value === "custom";
  wrap.classList.toggle("hidden", !isCustom);
  wrap.classList.toggle("flex", isCustom);
}

function getSelectedRange() {
  const value = elsSemesterSelect() ? elsSemesterSelect().value : "all";

  if (value === "all") {
    return { from: "0000-01-01", to: "9999-12-31", label: "historial" };
  }

  if (value === "custom") {
    const from = parseDate(elsConsFrom()?.value) || "0000-01-01";
    const to = parseDate(elsConsTo()?.value) || "9999-12-31";
    return { from, to, label: `personalizado_${from}_a_${to}` };
  }

  const match = value.match(/^(\d{4})-S([12])$/);
  if (!match) return { from: "0000-01-01", to: "9999-12-31", label: "historial" };

  const [, year, sem] = match;
  const def = SEMESTER_DEFS[`S${sem}`];
  return {
    from: `${year}-${def.fromMonth}-${def.fromDay}`,
    to: `${year}-${def.toMonth}-${def.toDay}`,
    label: `${year}_S${sem}`
  };
}

/* ---------- Filtrado y validación ---------- */

function filterConsumptionRecords(range) {
  return app.consumptions
    .map((rec, i) => ({ rec, i, dateISO: recordDateISO(rec) }))
    .filter(vm => vm.dateISO && vm.dateISO >= range.from && vm.dateISO <= range.to)
    .sort((a, b) => (b.dateISO.localeCompare(a.dateISO)) || (b.i - a.i));
}

function validateViewModel(vm, globalMap) {
  const issues = [];
  const qty = parseNumber(vm.rec["CANTIDAD CONSUMIDA"]);

  if (!vm.dateISO) issues.push("Fecha inválida o ausente.");
  if (!(qty > 0)) issues.push("La cantidad consumida debe ser mayor que cero.");
  if (!sanitizeText(vm.rec["CENTRO DE COSTO DE CONSUMO"])) issues.push("Falta el centro de costo de consumo.");

  const rowsForKey = kardexRowsForKey(vm.rec);
  let initial = null;
  let actual = null;

  if (!rowsForKey.length) {
    issues.push("El insumo/lote no se encuentra en el Kardex actual.");
  } else {
    let sumInitial = 0;
    let sumActual = 0;
    rowsForKey.forEach(r => {
      sumActual += parseNumber(r["CANTIDAD"]);
      sumInitial += Number.isFinite(r.__initialQty) ? r.__initialQty : parseNumber(r["CANTIDAD"]);
    });
    initial = roundQuantity(sumInitial);
    actual = roundQuantity(sumActual);

    const key = consumptionKey(vm.rec["CODIGO INSUMO"], vm.rec["CODIGO"], vm.rec["LOTE"]);
    const total = globalMap.get(key) || 0;
    if (total > initial + 1e-4) {
      issues.push(`Consumo acumulado (${formatQuantity(total)}) supera el stock inicial (${formatQuantity(initial)}).`);
    }
  }

  vm.row = rowsForKey[0] || null;
  vm.initial = initial;
  vm.actual = actual;
  vm.qty = qty;
  vm.issues = issues;
  return vm;
}

function aggregateByItem(validatedVms) {
  const map = new Map();

  validatedVms.forEach(vm => {
    const key = consumptionKey(vm.rec["CODIGO INSUMO"], vm.rec["CODIGO"], vm.rec["LOTE"]);
    let entry = map.get(key) || {
      key,
      nombre: sanitizeText(vm.rec["CODIGO"]),
      id: sanitizeText(vm.rec["CODIGO INSUMO"]),
      presentacion: sanitizeText(vm.rec["PRESENTACIÓN"]),
      lote: sanitizeText(vm.rec["LOTE"]),
      total: 0,
      registros: 0,
      actual: null,
      initial: null
    };

    entry.total += vm.qty || 0;
    entry.registros += 1;
    if (vm.actual !== null) {
      entry.actual = vm.actual;
      entry.initial = vm.initial;
    }
    map.set(key, entry);
  });

  return [...map.values()].sort((a, b) => b.total - a.total);
}

/* ---------- Render del panel ---------- */

const consEl = (id) => document.getElementById(id);

function renderConsumptionPanel() {
  const badge = consEl("validationBadge");
  if (!badge) return;

  if (!app.consumptions.length) {
    setConsumptionEmptyState();
    renderConsumptionCharts([]);
    return;
  }

  const range = getSelectedRange();
  const globalMap = globalConsumedByKey();
  const vms = filterConsumptionRecords(range).map(vm => validateViewModel(vm, globalMap));

  const totalUnits = vms.reduce((s, vm) => s + (vm.qty || 0), 0);
  const aggregates = aggregateByItem(vms);
  const flagged = vms.filter(vm => vm.issues.length > 0);

  consEl("consKpiRecords").textContent = new Intl.NumberFormat("es-CO").format(vms.length);
  consEl("consKpiUnits").textContent = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(totalUnits);
  consEl("consKpiItems").textContent = new Intl.NumberFormat("es-CO").format(aggregates.length);
  consEl("consKpiAlerts").textContent = new Intl.NumberFormat("es-CO").format(flagged.reduce((s, vm) => s + vm.issues.length, 0));

  renderValidation(flagged, vms.length);
  renderAggregate(aggregates);
  renderDetailTable(vms);

  const exportBtn = consEl("exportReportButton");
  if (exportBtn) exportBtn.disabled = vms.length === 0;

  renderConsumptionCharts(vms);
}

function setConsumptionEmptyState() {
  ["consKpiRecords", "consKpiUnits", "consKpiItems"].forEach(id => {
    const el = consEl(id);
    if (el) el.textContent = "0";
  });
  const alerts = consEl("consKpiAlerts");
  if (alerts) alerts.textContent = "0";

  const list = consEl("validationList");
  if (list) list.innerHTML = "";
  const okMsg = consEl("validationOkMessage");
  if (okMsg) okMsg.classList.add("hidden");
  const badge = consEl("validationBadge");
  if (badge) {
    badge.textContent = "Sin datos";
    badge.className = "status-pill bg-slate-100 text-slate-600 ring-1 ring-slate-200";
  }

  const aggBody = consEl("aggTableBody");
  if (aggBody) aggBody.innerHTML = "";
  const consBody = consEl("consTableBody");
  if (consBody) consBody.innerHTML = "";

  const aggEmpty = consEl("aggEmptyState");
  if (aggEmpty) aggEmpty.classList.remove("hidden");
  const consEmpty = consEl("consEmptyState");
  if (consEmpty) consEmpty.classList.remove("hidden");

  const exportBtn = consEl("exportReportButton");
  if (exportBtn) exportBtn.disabled = true;
}

function renderValidation(flagged, totalRecords) {
  const list = consEl("validationList");
  const okMsg = consEl("validationOkMessage");
  const badge = consEl("validationBadge");
  if (!list || !badge) return;

  if (!totalRecords) {
    list.innerHTML = "";
    okMsg?.classList.add("hidden");
    badge.textContent = "Sin datos";
    badge.className = "status-pill bg-slate-100 text-slate-600 ring-1 ring-slate-200";
    return;
  }

  if (!flagged.length) {
    list.innerHTML = "";
    okMsg?.classList.remove("hidden");
    badge.textContent = "Todo válido";
    badge.className = "status-pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    return;
  }

  okMsg?.classList.add("hidden");
  badge.textContent = `${flagged.length} con alertas`;
  badge.className = "status-pill bg-rose-50 text-rose-700 ring-1 ring-rose-200";

  const maxShown = 50;
  const items = flagged.slice(0, maxShown).map(vm => {
    const detail = vm.issues.map(i => escapeHTML(i)).join(" · ");
    return `
      <li class="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2 text-xs text-rose-800">
        <span class="font-extrabold">${escapeHTML(formatDate(vm.dateISO))}</span> ·
        ${escapeHTML(sanitizeText(vm.rec["CODIGO"]) || "Insumo")} · Lote ${escapeHTML(sanitizeText(vm.rec["LOTE"]) || "—")}
        <span class="mt-0.5 block font-semibold">${detail}</span>
      </li>`;  }).join("");

  const extra = flagged.length > maxShown
    ? `<li class="text-xs text-slate-400">…y ${flagged.length - maxShown} registro(s) adicional(es) con alertas.</li>`
    : "";

  list.innerHTML = items + extra;
}

function usagePill(entry) {
  if (!entry.initial || entry.initial <= 0) return `<span class="text-slate-400">—</span>`;
  const pct = (entry.total / entry.initial) * 100;
  const color =
    pct >= 90 ? "bg-rose-50 text-rose-700 ring-rose-200" :
    pct >= 60 ? "bg-amber-50 text-amber-700 ring-amber-200" :
    "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return `<span class="status-pill ring-1 ${color}">${pct.toFixed(1)}%</span>`;
}

function renderAggregate(aggregates) {
  const body = consEl("aggTableBody");
  const empty = consEl("aggEmptyState");
  if (!body) return;

  empty?.classList.toggle("hidden", aggregates.length > 0);
  body.innerHTML = aggregates.map(e => `
    <tr class="transition hover:bg-[#F0F7E8]/30">
      <td class="border-b border-slate-100 px-3 py-2.5 font-bold text-slate-900" title="${escapeHTML(e.nombre)}">${escapeHTML(e.nombre || "—")}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(e.id || "—")}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(e.presentacion || "—")}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(e.lote || "—")}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 font-bold text-[#557D29]">${escapeHTML(formatQuantity(e.total))}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${e.registros}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${e.initial !== null ? escapeHTML(formatQuantity(e.initial)) : "—"}</td>
      <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${e.actual !== null ? escapeHTML(formatQuantity(e.actual)) : "—"}</td>
      <td class="border-b border-slate-100 px-3 py-2.5">${usagePill(e)}</td>
    </tr>`).join("");
}

function renderDetailTable(vms) {
  const body = consEl("consTableBody");
  const empty = consEl("consEmptyState");
  if (!body) return;

  empty?.classList.toggle("hidden", vms.length > 0);

  body.innerHTML = vms.map(vm => {
    const validCell = vm.issues.length
      ? `<span class="status-pill bg-rose-50 text-rose-700 ring-1 ring-rose-200 cursor-help" title="${escapeHTML(vm.issues.join("\n"))}">${vm.issues.length} alerta${vm.issues.length > 1 ? "s" : ""}</span>`
      : `<span class="status-pill bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">OK</span>`;

    return `
      <tr class="transition hover:bg-[#F0F7E8]/30">
        <td class="border-b border-slate-100 px-3 py-2.5 whitespace-nowrap text-slate-700">${escapeHTML(formatDate(vm.dateISO))}</td>
        <td class="border-b border-slate-100 max-w-[260px] truncate px-3 py-2.5 font-bold text-slate-900" title="${escapeHTML(sanitizeText(vm.rec["CODIGO"]))}">${escapeHTML(sanitizeText(vm.rec["CODIGO"]) || "—")}</td>
        <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(sanitizeText(vm.rec["CODIGO INSUMO"]) || "—")}</td>
        <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(sanitizeText(vm.rec["LOTE"]) || "—")}</td>
        <td class="border-b border-slate-100 px-3 py-2.5 font-semibold text-slate-900">${escapeHTML(formatQuantity(vm.qty))}</td>
        <td class="border-b border-slate-100 px-3 py-2.5 text-slate-700">${escapeHTML(sanitizeText(vm.rec["CENTRO DE COSTO DE CONSUMO"]) || "—")}</td>
        <td class="border-b border-slate-100 max-w-[240px] truncate px-3 py-2.5 text-slate-500" title="${escapeHTML(sanitizeText(vm.rec["OBSERVACION"]))}">${escapeHTML(sanitizeText(vm.rec["OBSERVACION"]) || "—")}</td>
        <td class="border-b border-slate-100 px-3 py-2.5">${validCell}</td>
      </tr>`;
  }).join("");
}

/* ---------- Exportar reporte del periodo ---------- */

function exportConsumptionReport() {
  if (!app.consumptions.length) {
    showToast("No hay consumos registrados para exportar.", "error");
    return;
  }

  try {
    const range = getSelectedRange();
    const globalMap = globalConsumedByKey();
    const vms = filterConsumptionRecords(range).map(vm => validateViewModel(vm, globalMap));
    if (!vms.length) {
      showToast("El periodo seleccionado no tiene consumos.", "error");
      return;
    }

    const aggregates = aggregateByItem(vms);

    const detailHeaders = [
      "FECHA", "INSUMO", "CODIGO", "PRESENTACION", "LOTE",
      "CANTIDAD CONSUMIDA", "CENTRO DE COSTO DE CONSUMO", "OBSERVACION",
      "SEDE", "PROVEEDOR", "ESTADO VALIDACION", "DETALLE VALIDACION"
    ];

    const detailRows = vms.map(vm => [
      vm.dateISO,
      sanitizeText(vm.rec["CODIGO"]),
      sanitizeText(vm.rec["CODIGO INSUMO"]),
      sanitizeText(vm.rec["PRESENTACIÓN"]),
      sanitizeText(vm.rec["LOTE"]),
      parseNumber(vm.rec["CANTIDAD CONSUMIDA"]),
      sanitizeText(vm.rec["CENTRO DE COSTO DE CONSUMO"]),
      sanitizeText(vm.rec["OBSERVACION"]),
      sanitizeText(vm.rec["SEDE"]),
      sanitizeText(vm.rec["PROVEEDOR"]),
      vm.issues.length ? "CON ALERTAS" : "VÁLIDO",
      vm.issues.join(" | ")
    ]);

    const summaryHeaders = [
      "INSUMO", "ID", "PRESENTACION", "LOTE",
      "UNIDADES CONSUMIDAS", "REGISTROS",
      "STOCK INICIAL", "STOCK ACTUAL", "% USO SOBRE INICIAL"
    ];

    const summaryRows = aggregates.map(e => [
      e.nombre, e.id, e.presentacion, e.lote,
      roundQuantity(e.total), e.registros,
      e.initial ?? "", e.actual ?? "",
      e.initial ? Number(((e.total / e.initial) * 100).toFixed(2)) : ""
    ]);

    const wb = XLSX.utils.book_new();

    const dws = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
    dws["!cols"] = [
      { wch: 12 }, { wch: 40 }, { wch: 22 }, { wch: 16 }, { wch: 16 },
      { wch: 20 }, { wch: 26 }, { wch: 40 }, { wch: 10 }, { wch: 28 },
      { wch: 16 }, { wch: 60 }
    ];
    XLSX.utils.book_append_sheet(wb, dws, "CONSUMOS_DETALLE");

    const sws = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
    sws["!cols"] = [
      { wch: 44 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
      { wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, sws, "RESUMEN_INSUMOS");

    const filename = `REPORTE_CONSUMOS_${range.label}_${todayISO()}.xlsx`;
    XLSX.writeFile(wb, filename);

    showToast(`Reporte generado: ${filename}`, "success", 5500);
  } catch (error) {
    console.error(error);
    showToast("No fue posible generar el reporte de consumos.", "error", 5500);
  }
}

/* ---------- Pestañas Inventario / Consumos ---------- */

function switchTab(tabName) {
  const inventory = document.getElementById("inventoryPanel");
  const consumption = document.getElementById("consumptionPanel");
  const tabInv = document.getElementById("tabInventory");
  const tabCon = document.getElementById("tabConsumption");
  if (!inventory || !consumption) return;

  const showInventory = tabName === "inventory";
  app.activeTab = tabName;

  inventory.classList.toggle("hidden", !showInventory);
  consumption.classList.toggle("hidden", showInventory);

  tabInv?.classList.toggle("tab-btn-active", showInventory);
  tabInv?.setAttribute("aria-selected", String(showInventory));

  tabCon?.classList.toggle("tab-btn-active", !showInventory);
  tabCon?.setAttribute("aria-selected", String(!showInventory));

  // Las gráficas solo se dibujan cuando el panel es visible.
  if (!showInventory) renderConsumptionPanel();
}
