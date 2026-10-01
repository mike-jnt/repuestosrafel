'use strict';

const FIRESTORE_FILE_MAX_BYTES = 20 * 1024 * 1024;
const FIRESTORE_FILE_CHUNK_CHARS = 700000;
const FIRESTORE_FILE_BATCH_CHUNKS = 8;

function blobToBase64Payload(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('No fue posible leer el archivo.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

function base64PayloadToBlob(base64, mimeType = 'application/octet-stream') {
  const binary = atob(base64);
  const sliceSize = 1024 * 512;
  const parts = [];
  for (let offset = 0; offset < binary.length; offset += sliceSize) {
    const slice = binary.slice(offset, offset + sliceSize);
    const bytes = new Uint8Array(slice.length);
    for (let i = 0; i < slice.length; i += 1) bytes[i] = slice.charCodeAt(i);
    parts.push(bytes);
  }
  return new Blob(parts, { type: mimeType });
}

const FirestoreFiles = {
  db: null,
  userProvider: null,

  init(db, userProvider) {
    this.db = db;
    this.userProvider = userProvider;
  },

  currentUser() {
    return typeof this.userProvider === 'function' ? this.userProvider() : null;
  },

  validate(blob, allowedMimePrefixes = []) {
    if (!this.db) throw new Error('FirestoreFiles no está inicializado.');
    const user = this.currentUser();
    if (!user) throw new Error('Debes iniciar sesión para guardar archivos.');
    if (!(blob instanceof Blob)) throw new Error('El archivo seleccionado no es válido.');
    if (Number(blob.size || 0) <= 0) throw new Error('El archivo está vacío.');
    if (Number(blob.size || 0) > FIRESTORE_FILE_MAX_BYTES) throw new Error('El archivo no puede superar 20 MB.');
    if (allowedMimePrefixes.length && !allowedMimePrefixes.some(prefix => String(blob.type || '').startsWith(prefix))) {
      throw new Error('El tipo de archivo no está permitido.');
    }
  },

  async save(blob, options = {}) {
    this.validate(blob, options.allowedMimePrefixes || []);
    const user = this.currentUser();
    const fileRef = this.db.collection('archivos').doc();
    const fileId = fileRef.id;
    const base64 = await blobToBase64Payload(blob);
    const chunks = [];
    for (let offset = 0; offset < base64.length; offset += FIRESTORE_FILE_CHUNK_CHARS) {
      chunks.push(base64.slice(offset, offset + FIRESTORE_FILE_CHUNK_CHARS));
    }
    const now = new Date().toISOString();
    const metadata = {
      id: fileId,
      fileName: String(options.fileName || 'archivo').slice(0, 180),
      mimeType: String(blob.type || options.mimeType || 'application/octet-stream').slice(0, 120),
      originalSize: Number(blob.size || 0),
      base64Size: base64.length,
      chunkSize: FIRESTORE_FILE_CHUNK_CHARS,
      chunkCount: chunks.length,
      category: String(options.category || 'general').slice(0, 80),
      entityType: String(options.entityType || '').slice(0, 80),
      entityId: String(options.entityId || '').slice(0, 160),
      entityNumber: String(options.entityNumber || '').slice(0, 120),
      createdAt: now,
      createdByUid: user.uid,
      createdByEmail: String(user.email || '').slice(0, 180),
      status: 'uploading',
      completed: false,
      serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await fileRef.set(metadata);
    try {
      for (let start = 0; start < chunks.length; start += FIRESTORE_FILE_BATCH_CHUNKS) {
        const batch = this.db.batch();
        const end = Math.min(start + FIRESTORE_FILE_BATCH_CHUNKS, chunks.length);
        for (let index = start; index < end; index += 1) {
          const chunkId = String(index).padStart(5, '0');
          const chunkRef = fileRef.collection('archivoChunks').doc(chunkId);
          batch.set(chunkRef, {
            fileId,
            index,
            data: chunks[index],
            createdAt: now,
            createdByUid: user.uid
          });
        }
        await batch.commit();
      }
      await fileRef.set({
        status: 'complete',
        completed: true,
        completedAt: new Date().toISOString(),
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      if (typeof ProductImageCache !== 'undefined' && String(metadata.mimeType || '').startsWith('image/')) {
        ProductImageCache.setBlob(fileId, blob, { id: fileId, ...metadata, status: 'complete', completed: true }).catch(() => {});
      }
      return {
        fileId,
        path: `archivos/${fileId}`,
        fileName: metadata.fileName,
        mimeType: metadata.mimeType,
        size: metadata.originalSize,
        chunkCount: metadata.chunkCount,
        storage: 'firestore-base64',
        uploadedAt: now,
        uploadedBy: user.uid
      };
    } catch (error) {
      await fileRef.set({
        status: 'error',
        completed: false,
        errorAt: new Date().toISOString(),
        errorMessage: String(error?.message || 'Error de carga').slice(0, 300),
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true }).catch(() => {});
      throw error;
    }
  },

  async read(fileId) {
    if (!this.db) throw new Error('FirestoreFiles no está inicializado.');
    if (!fileId) throw new Error('No se recibió el identificador del archivo.');
    if (typeof ProductImageCache !== 'undefined') {
      const cached = await ProductImageCache.getBlob(String(fileId));
      if (cached?.blob) return cached;
    }
    const fileRef = this.db.collection('archivos').doc(String(fileId));
    const metadataSnap = await fileRef.get();
    if (!metadataSnap.exists) throw new Error('El archivo ya no existe en Firestore.');
    const metadata = metadataSnap.data();
    if (!metadata.completed || metadata.status !== 'complete') throw new Error('El archivo todavía no terminó de cargarse.');
    const chunkCount = Number(metadata.chunkCount || 0);
    if (chunkCount < 1 || chunkCount > 40) throw new Error('La estructura del archivo es inválida.');
    // Una sola consulta para todos los fragmentos. Mantiene las mismas lecturas
    // de documentos, pero reduce solicitudes y evaluaciones repetidas de reglas.
    const chunkSnapshot = await fileRef.collection('archivoChunks').orderBy('index', 'asc').get();
    if (chunkSnapshot.size !== chunkCount) throw new Error('El archivo está incompleto.');
    const chunks = chunkSnapshot.docs.map(doc => doc.data()).sort((a,b) => Number(a.index) - Number(b.index));
    const base64 = chunks.map((chunk, index) => {
      if (Number(chunk.index) !== index) throw new Error(`Falta el fragmento ${index + 1} del archivo.`);
      return String(chunk.data || '');
    }).join('');
    if (Number(metadata.base64Size || 0) && base64.length !== Number(metadata.base64Size)) throw new Error('El archivo está incompleto o corrupto.');
    const blob = base64PayloadToBlob(base64, metadata.mimeType);
    if (Number(metadata.originalSize || 0) && blob.size !== Number(metadata.originalSize)) throw new Error('El tamaño reconstruido no coincide con el archivo original.');
    const result = { blob, metadata: { id: metadataSnap.id, ...metadata } };
    if (typeof ProductImageCache !== 'undefined' && String(metadata.mimeType || '').startsWith('image/')) ProductImageCache.setBlob(String(fileId), blob, result.metadata).catch(() => {});
    return result;
  },

  async remove(fileId) {
    if (!this.db || !fileId) return;
    const fileRef = this.db.collection('archivos').doc(String(fileId));
    const metadataSnap = await fileRef.get();
    if (!metadataSnap.exists) return;
    const chunkCount = Number(metadataSnap.data().chunkCount || 0);
    for (let start = 0; start < chunkCount; start += FIRESTORE_FILE_BATCH_CHUNKS) {
      const batch = this.db.batch();
      const end = Math.min(start + FIRESTORE_FILE_BATCH_CHUNKS, chunkCount);
      for (let index = start; index < end; index += 1) {
        batch.delete(fileRef.collection('archivoChunks').doc(String(index).padStart(5, '0')));
      }
      await batch.commit();
    }
    await fileRef.delete();
    if (typeof ProductImageCache !== 'undefined') {
      ProductImageCache.removeThumb(String(fileId));
      await ProductImageCache.removeBlob(String(fileId));
    }
  }
};
