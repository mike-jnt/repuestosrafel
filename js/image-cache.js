'use strict';

const PRODUCT_THUMB_CACHE_KEY = 'mar_product_thumbnails_c1_7';
const PRODUCT_THUMB_CACHE_MAX_ENTRIES = 120;
const PRODUCT_THUMB_CACHE_MAX_CHARS = 3_600_000;
const PRODUCT_IMAGE_DB_NAME = 'mar-product-images-c1-7';
const PRODUCT_IMAGE_STORE = 'images';

const ProductImageCache = {
  thumbState: null,
  dbPromise: null,

  loadThumbState() {
    if (this.thumbState) return this.thumbState;
    try {
      const parsed = JSON.parse(localStorage.getItem(PRODUCT_THUMB_CACHE_KEY) || '{}');
      this.thumbState = parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      this.thumbState = {};
    }
    return this.thumbState;
  },

  persistThumbState() {
    const state = this.loadThumbState();
    let entries = Object.entries(state).sort((a,b) => Number(b[1]?.usedAt || 0) - Number(a[1]?.usedAt || 0));
    while (entries.length > PRODUCT_THUMB_CACHE_MAX_ENTRIES || JSON.stringify(Object.fromEntries(entries)).length > PRODUCT_THUMB_CACHE_MAX_CHARS) {
      entries.pop();
    }
    this.thumbState = Object.fromEntries(entries);
    try { localStorage.setItem(PRODUCT_THUMB_CACHE_KEY, JSON.stringify(this.thumbState)); }
    catch (error) {
      console.warn('[Imágenes] No fue posible conservar todas las miniaturas en localStorage:', error);
      this.thumbState = Object.fromEntries(entries.slice(0, Math.max(10, Math.floor(entries.length / 2))));
      try { localStorage.setItem(PRODUCT_THUMB_CACHE_KEY, JSON.stringify(this.thumbState)); } catch (_) {}
    }
  },

  getThumb(fileId) {
    if (!fileId) return '';
    const state = this.loadThumbState();
    const item = state[fileId];
    if (!item?.dataUrl) return '';
    item.usedAt = Date.now();
    return item.dataUrl;
  },

  setThumb(fileId, dataUrl) {
    if (!fileId || !String(dataUrl || '').startsWith('data:image/')) return;
    const state = this.loadThumbState();
    state[fileId] = { dataUrl: String(dataUrl), usedAt: Date.now() };
    this.persistThumbState();
  },

  removeThumb(fileId) {
    if (!fileId) return;
    const state = this.loadThumbState();
    delete state[fileId];
    this.persistThumbState();
  },

  openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(PRODUCT_IMAGE_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PRODUCT_IMAGE_STORE)) db.createObjectStore(PRODUCT_IMAGE_STORE, { keyPath: 'fileId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('No se pudo abrir la caché de imágenes.'));
    }).catch(error => { console.warn('[Imágenes] IndexedDB no disponible:', error); return null; });
    return this.dbPromise;
  },

  async setBlob(fileId, blob, metadata = {}) {
    if (!fileId || !(blob instanceof Blob)) return;
    const db = await this.openDb();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PRODUCT_IMAGE_STORE, 'readwrite');
      tx.objectStore(PRODUCT_IMAGE_STORE).put({ fileId, blob, metadata, usedAt: Date.now() });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('No se pudo guardar la imagen localmente.'));
    }).catch(error => console.warn('[Imágenes] No se pudo guardar el archivo completo en IndexedDB:', error));
  },

  async getBlob(fileId) {
    if (!fileId) return null;
    const db = await this.openDb();
    if (!db) return null;
    return new Promise(resolve => {
      const tx = db.transaction(PRODUCT_IMAGE_STORE, 'readonly');
      const req = tx.objectStore(PRODUCT_IMAGE_STORE).get(fileId);
      req.onsuccess = () => resolve(req.result ? { blob: req.result.blob, metadata: req.result.metadata || {} } : null);
      req.onerror = () => resolve(null);
    });
  },

  async removeBlob(fileId) {
    if (!fileId) return;
    const db = await this.openDb();
    if (!db) return;
    await new Promise(resolve => {
      const tx = db.transaction(PRODUCT_IMAGE_STORE, 'readwrite');
      tx.objectStore(PRODUCT_IMAGE_STORE).delete(fileId);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
    });
  },

  async createThumbnail(file, maxSide = 320) {
    if (!(file instanceof Blob) || !String(file.type || '').startsWith('image/')) throw new Error('Selecciona una imagen válida.');
    let source;
    try { source = await createImageBitmap(file); }
    catch (_) {
      source = await new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No fue posible procesar la imagen.')); };
        image.src = url;
      });
    }
    const sw = source.width || source.naturalWidth;
    const sh = source.height || source.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const width = Math.max(1, Math.round(sw * scale));
    const height = Math.max(1, Math.round(sh * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(source, 0, 0, width, height);
    if (typeof source.close === 'function') source.close();
    let quality = 0.82;
    let dataUrl = canvas.toDataURL('image/jpeg', quality);
    while (dataUrl.length > 60000 && quality > 0.45) {
      quality -= 0.08;
      dataUrl = canvas.toDataURL('image/jpeg', quality);
    }
    return dataUrl;
  }
};
