"use strict";

/* ====================================================================
   MÓDULO: EXTRAS
   - Modo oscuro (persistente, respeta preferencia del sistema).
   - Confirmación beforeunload con cambios sin guardar.
   - Registro del Service Worker (PWA).
   ==================================================================== */

/* ---------- Modo oscro / claro ---------- */

const THEME_KEY = "kardex_theme";

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0f172a" : "#82B340");

  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.textContent = dark ? "☀️" : "🌙";
    toggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
    toggle.title = dark ? "Modo claro" : "Modo oscuro";
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains("dark");
  const next = isDark ? "light" : "dark";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem(THEME_KEY); } catch (_) { /* ignore */ }
  if (!saved) {
    saved = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  applyTheme(saved);
}

/* ---------- Advertencia al cerrar con cambios sin guardar ---------- */

function initBeforeUnload() {
  window.addEventListener("beforeunload", (event) => {
    if (app.rows.length && app.dirty) {
      event.preventDefault();
      event.returnValue = ""; // Requerido por Chrome para mostrar el diálogo.
      return "";
    }
  });
}

/* ---------- Service Worker (PWA) ---------- */

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!location.protocol.startsWith("http")) return; // file:// no soporta SW

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker no registrado:", error);
    });
  });
}

/* ---------- Inicialización del módulo ---------- */

(function initExtras() {
  const boot = () => {
    initTheme();
    initBeforeUnload();
    initServiceWorker();

    const themeToggle = document.getElementById("themeToggle");
    themeToggle?.addEventListener("click", toggleTheme);

    // Accesibilidad: atajo de teclado para alternar tema (Alt+D).
    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        toggleTheme();
      }
    });

    // Diagnóstico: SheetJS ausente (sin conexión en primera visita).
    if (typeof XLSX === "undefined") {
      setTimeout(() => {
        showToast("SheetJS/CDN no disponibles. Conéctate una vez para que la app quede en caché offline.", "error", 8000);
      }, 800);
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
