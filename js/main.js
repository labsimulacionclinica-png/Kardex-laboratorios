"use strict";

/* ====================================================================
   MÓDULO: EVENTOS E INICIALIZACIÓN
   Cablea toda la interfaz y arranca la aplicación.
   ==================================================================== */

(function () {
  const boot = () => {
    wireFileLoading();
    wireHeaderButtons();
    wireFilters();
    wirePagination();
    wireTable();
    wireConsumeModal();
    wireNewItemModal();
    wireConsumptionTab();
    wireScanner();
    wireBackup();
    wireRestoreBanner();

    // Estado inicial limpio: se requiere cargar un Excel (o restaurar).
    renderHead();
    rebuildConsumptionControls();
    switchTab("inventory");
    els.dashboard.classList.add("hidden");
    els.uploadSection.classList.remove("hidden");
    els.exportButton.disabled = true;
    els.newItemButton.hidden = true;

    // Ofrece restaurar la última sesión guardada en IndexedDB.
    loadPersistedState().then((payload) => {
      if (payload && Array.isArray(payload.rows) && payload.rows.length) {
        showRestoreBanner(payload);
      }
    }).catch(() => {});

    // Autoguardado periódico defensivo.
    setInterval(() => { if (app.rows.length) saveLocalData(); }, 30000);

    // Diagnóstico CDN sin conexión.
    if (typeof XLSX === "undefined") {
      setTimeout(() => showToast("SheetJS no disponible. Conéctate una vez para que quede en caché offline.", "error", 8000), 800);
    }
  };

  /* ---------- Carga de archivos ---------- */
  function wireFileLoading() {
    els.fileInput.addEventListener("change", (e) => handleFile(e.target.files[0]));
    els.fileInputMobile.addEventListener("change", (e) => handleFile(e.target.files[0]));

    els.mobileLoadButton.addEventListener("click", (e) => {
      e.stopPropagation();
      els.fileInputMobile.click();
    });

    els.dropZone.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      els.fileInputMobile.click();
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.dropZone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      els.dropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.dropZone.classList.remove("dragover");
      });
    });

    els.dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    });
  }

  /* ---------- Botones del encabezado ---------- */
  function wireHeaderButtons() {
    els.exportButton.addEventListener("click", exportWorkbook);
    els.newItemButton.addEventListener("click", openNewItemModal);
  }

  /* ---------- Filtros ---------- */
  function wireFilters() {
    els.searchInput.addEventListener("input", (e) => {
      app.search = e.target.value.trim();
      app.page = 1;
      render();
    });

    els.sedeFilter.addEventListener("change", (e) => { app.sede = e.target.value; app.page = 1; render(); });
    els.statusFilter.addEventListener("change", (e) => { app.status = e.target.value; app.page = 1; render(); });
    els.subgrupoFilter.addEventListener("change", (e) => { app.subgrupo = e.target.value; app.page = 1; render(); });

    els.expFrom.addEventListener("change", (e) => { app.expFrom = parseDate(e.target.value); app.page = 1; render(); });
    els.expTo.addEventListener("change", (e) => { app.expTo = parseDate(e.target.value); app.page = 1; render(); });

    els.clearFilters.addEventListener("click", () => resetFilters());
  }

  /* ---------- Paginación ---------- */
  function wirePagination() {
    els.prevPage.addEventListener("click", () => {
      if (app.page > 1) { app.page--; render(); scrollToTable(); }
    });
    els.nextPage.addEventListener("click", () => {
      const totalPages = Math.max(1, Math.ceil(app.filteredRows.length / PAGE_SIZE));
      if (app.page < totalPages) { app.page++; render(); scrollToTable(); }
    });
    els.pageNumbers.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn) return;
      app.page = Number(btn.dataset.page);
      render();
      scrollToTable();
    });
  }

  function scrollToTable() {
    window.scrollTo({ top: 300, behavior: "smooth" });
  }

  /* ---------- Tabla: orden por columna y acciones ---------- */
  function wireTable() {
    els.tableHead.addEventListener("click", (e) => {
      const th = e.target.closest("[data-sort-key]");
      if (!th) return;
      toggleSort(th.dataset.sortKey);
    });

    els.tableHead.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const th = e.target.closest("[data-sort-key]");
      if (!th) return;
      e.preventDefault();
      toggleSort(th.dataset.sortKey);
    });

    els.tableBody.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn || btn.disabled) return;
      const rowId = btn.dataset.rowId;

      switch (btn.dataset.action) {
        case "consume": openConsumeModal(rowId); break;
        case "entry": openEntryModal(rowId); break;
        case "edit": openEditModal(rowId); break;
        case "delete": deleteRow(rowId); break;
      }
    });
  }

  function toggleSort(key) {
    if (app.sortKey === key) {
      app.sortDir = app.sortDir === "asc" ? "desc" : "asc";
    } else {
      app.sortKey = key;
      app.sortDir = "asc";
    }
    render();
  }

  /* ---------- Modal de consumo ---------- */
  function wireConsumeModal() {
    $("confirmConsume").addEventListener("click", confirmConsume);
    $("cancelConsume").addEventListener("click", closeConsumeModal);
    $("closeModal").addEventListener("click", closeConsumeModal);
    $("openScannerButton")?.addEventListener("click", openScanner);

    els.consumeModal.addEventListener("click", (e) => {
      if (e.target === els.consumeModal) closeConsumeModal();
    });
  }

  /* ---------- Modal nuevo insumo ---------- */
  function wireNewItemModal() {
    els.closeNewItemModal.addEventListener("click", closeNewItemModal);
    els.cancelNewItem.addEventListener("click", closeNewItemModal);
    els.newItemForm.addEventListener("submit", addNewItem);
    els.newItemModal.addEventListener("click", (e) => {
      if (e.target === els.newItemModal) closeNewItemModal();
    });
  }

  /* ---------- Pestaña de consumos ---------- */
  function wireConsumptionTab() {
    document.getElementById("tabInventory")?.addEventListener("click", () => switchTab("inventory"));
    document.getElementById("tabConsumption")?.addEventListener("click", () => switchTab("consumption"));

    const semesterSelect = document.getElementById("semesterSelect");
    semesterSelect?.addEventListener("change", () => {
      syncCustomRangeVisibility();
      renderConsumptionPanel();
    });

    document.getElementById("consFrom")?.addEventListener("change", () => {
      if (semesterSelect.value === "custom") renderConsumptionPanel();
    });
    document.getElementById("consTo")?.addEventListener("change", () => {
      if (semesterSelect.value === "custom") renderConsumptionPanel();
    });

    document.getElementById("exportReportButton")?.addEventListener("click", exportConsumptionReport);
  }

  /* ---------- Escáner ---------- */
  function wireScanner() {
    document.getElementById("closeScannerModal")?.addEventListener("click", closeScanner);
    document.getElementById("scannerManualGo")?.addEventListener("click", () => {
      const input = document.getElementById("scannerManualInput");
      handleScanValue(input.value);
      input.select();
    });
    document.getElementById("scannerManualInput")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleScanValue(e.target.value);
      }
    });
    document.getElementById("scannerMatches")?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-scan-row-id]");
      if (!btn) return;
      selectScannedRow(btn.dataset.scanRowId);
    });
    document.getElementById("scannerModal")?.addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closeScanner();
    });
  }

  /* ---------- Respaldo / Restauración ---------- */
  function wireBackup() {
    document.getElementById("backupButton")?.addEventListener("click", downloadBackup);

    const input = document.getElementById("restoreBackupInput");
    document.getElementById("restoreBackupButton")?.addEventListener("click", () => input?.click());
    input?.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) restoreBackupFile(file);
      input.value = "";
    });
  }

  /* ---------- Banner de restauración ---------- */
  function wireRestoreBanner() {
    document.getElementById("restoreBannerBtn")?.addEventListener("click", restoreFromBanner);
    document.getElementById("restoreBannerDismiss")?.addEventListener("click", () => {
      window.__pendingRestorePayload = null;
      hideRestoreBanner();
    });
  }

  /* ---------- Tecla Escape cierra cualquier modal ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    ["consumeModal", "newItemModal", "entryModal", "editModal", "scannerModal"].forEach((id) => {
      const modal = document.getElementById(id);
      if (modal && !modal.classList.contains("hidden")) {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
        if (id === "scannerModal") closeScanner();
        if (id === "consumeModal") app.selectedRowId = null;
        if (id === "entryModal") app.selectedRowId = null;
      }
    });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
