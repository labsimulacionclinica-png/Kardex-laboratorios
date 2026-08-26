"use strict";

/* ====================================================================
   MÓDULO: GRÁFICAS DE CONSUMOS (Chart.js)
   1. Consumo mensual del periodo seleccionado (barras).
   2. Top 10 insumos más consumidos (barras horizontales).
   3. Distribución por centro de costo (dona).
   Se dibujan solo cuando la pestaña de consumos está visible.
   ==================================================================== */

const CHART_COLORS = [
  "#6F9F35", "#2F6FED", "#E69324", "#D91978", "#0E7490",
  "#7C3AED", "#CA8A04", "#DC2626", "#059669", "#475569"
];

const _chartRefs = { monthly: null, topItems: null, costCenters: null };

function destroyChart(refKey) {
  if (_chartRefs[refKey]) {
    _chartRefs[refKey].destroy();
    _chartRefs[refKey] = null;
  }
}

function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { padding: 10 }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#64748b", font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { color: "#64748b", font: { size: 10 }, precision: 0 }, grid: { color: "rgba(100,116,139,.15)" } }
    }
  };
}

function renderConsumptionCharts(vms) {
  const canvasMonthly = document.getElementById("chartMonthly");
  if (!canvasMonthly) return;

  // Chart.js no cargó (sin conexión en primera visita): mostrar aviso.
  const wrapper = document.getElementById("chartsSection");
  if (!wrapper) return;

  if (typeof Chart === "undefined") {
    wrapper.querySelectorAll(".chart-fallback").forEach(el => el.classList.remove("hidden"));
    return;
  }

  // Sin datos visibles: limpiar y salir.
  if (!vms || !vms.length) {
    ["monthly", "topItems", "costCenters"].forEach(destroyChart);
    return;
  }

  renderMonthlyChart(vms);
  renderTopItemsChart(vms);
  renderCostCenterChart(vms);
}

/* 1. Consumo mensual */
function renderMonthlyChart(vms) {
  const byMonth = new Map();
  vms.forEach(vm => {
    if (!vm.dateISO || !(vm.qty > 0)) return;
    const month = vm.dateISO.slice(0, 7); // YYYY-MM
    byMonth.set(month, (byMonth.get(month) || 0) + vm.qty);
  });

  const labels = [...byMonth.keys()].sort();
  const data = labels.map(m => roundQuantity(byMonth.get(m)));
  const monthNames = labels.map(m => {
    const [y, mo] = m.split("-");
    const date = new Date(Number(y), Number(mo) - 1, 1);
    return new Intl.DateTimeFormat("es-CO", { month: "short", year: "2-digit" }).format(date);
  });

  destroyChart("monthly");
  _chartRefs.monthly = new Chart(document.getElementById("chartMonthly"), {
    type: "bar",
    data: {
      labels: monthNames,
      datasets: [{
        label: "Unidades consumidas",
        data,
        backgroundColor: "rgba(111, 159, 53, .85)",
        hoverBackgroundColor: "#557D29",
        borderRadius: 6,
        maxBarThickness: 42
      }]
    },
    options: {
      ...chartBaseOptions(),
      plugins: { legend: { display: false }, tooltip: { padding: 10 } }
    }
  });
}

/* 2. Top 10 insumos consumidos */
function renderTopItemsChart(vms) {
  const byItem = new Map();
  vms.forEach(vm => {
    if (!(vm.qty > 0)) return;
    const label = sanitizeText(vm.rec["CODIGO"]) || sanitizeText(vm.rec["CODIGO INSUMO"]) || "—";
    byItem.set(label, (byItem.get(label) || 0) + vm.qty);
  });

  const top = [...byItem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const labels = top.map(([label]) => label.length > 34 ? `${label.slice(0, 33)}…` : label);
  const data = top.map(([, total]) => roundQuantity(total));

  destroyChart("topItems");
  _chartRefs.topItems = new Chart(document.getElementById("chartTopItems"), {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Unidades",
        data,
        backgroundColor: "rgba(47, 111, 237, .85)",
        hoverBackgroundColor: "#1E56C8",
        borderRadius: 6,
        maxBarThickness: 22
      }]
    },
    options: {
      ...chartBaseOptions(),
      indexAxis: "y",
      scales: {
        x: { beginAtZero: true, ticks: { color: "#64748b", font: { size: 10 }, precision: 0 }, grid: { color: "rgba(100,116,139,.15)" } },
        y: { grid: { display: false }, ticks: { color: "#475569", font: { size: 10 } } }
      }
    }
  });
}

/* 3. Distribución por centro de costo */
function renderCostCenterChart(vms) {
  const byCC = new Map();
  vms.forEach(vm => {
    if (!(vm.qty > 0)) return;
    const cc = sanitizeText(vm.rec["CENTRO DE COSTO DE CONSUMO"]) || "(sin centro de costo)";
    byCC.set(cc, (byCC.get(cc) || 0) + vm.qty);
  });

  const sorted = [...byCC.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 8);
  const restTotal = sorted.slice(8).reduce((s, [, v]) => s + v, 0);
  if (restTotal > 0) top.push(["Otros", restTotal]);

  destroyChart("costCenters");
  _chartRefs.costCenters = new Chart(document.getElementById("chartCostCenters"), {
    type: "doughnut",
    data: {
      labels: top.map(([cc]) => cc.length > 26 ? `${cc.slice(0, 25)}…` : cc),
      datasets: [{
        data: top.map(([, v]) => roundQuantity(v)),
        backgroundColor: CHART_COLORS,
        borderColor: "#ffffff",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: {
          position: "right",
          labels: { color: "#475569", boxWidth: 12, font: { size: 10 } }
        },
        tooltip: { padding: 10 }
      }
    }
  });
}
