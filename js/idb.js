"use strict";

/* ====================================================================
   PERSISTENCIA CON INDEXEDDB
   Reemplaza localStorage (límite ~5 MB y síncrono) por IndexedDB,
   más robusto para kardex grandes (~750+ filas) e historial largo.
   API mínima clave-valor con Promesas + respaldo en localStorage.
   ==================================================================== */

const DB_NAME = "kardex_control_insumos";
const DB_VERSION = 1;
const DB_STORE = "kv";
const IDB_MAIN_KEY = "estado_principal";

let _idbPromise = null;

function openIDB() {
  if (_idbPromise) return _idbPromise;

  _idbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB no disponible"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((err) => {
    // Si falla definitivamente, no reintentar en cada operación.
    console.warn("IndexedDB no disponible, se usará localStorage:", err);
    _idbPromise = null;
    throw err;
  });

  return _idbPromise;
}

async function idbSet(key, value) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Guarda el estado completo de la aplicación.
 * Estrategia: IndexedDB como almacenamiento principal; si no está
 * disponible (navegador antiguo / modo privado estricto), cae a localStorage.
 */
async function persistState(payload) {
  try {
    await idbSet(IDB_MAIN_KEY, payload);
    return "idb";
  } catch (error) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return "local";
    } catch (fallbackError) {
      console.warn("Sin almacenamiento disponible:", fallbackError);
      return null;
    }
  }
}

/** Restaura el estado guardado (IndexedDB o localStorage). Devuelve payload o null. */
async function loadPersistedState() {
  try {
    const fromIdb = await idbGet(IDB_MAIN_KEY);
    if (fromIdb && Array.isArray(fromIdb.rows)) return fromIdb;
  } catch (_) { /* continúa con localStorage */ }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.rows)) return parsed;
  } catch (error) {
    console.warn("No se pudo leer respaldo de localStorage:", error);
  }
  return null;
}
