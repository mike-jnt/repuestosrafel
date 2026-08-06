'use strict';

const CLOUD_COLLECTIONS = Object.freeze({
  clients: 'clientes',
  suppliers: 'proveedores',
  products: 'productos',
  orders: 'pedidos',
  quotes: 'cotizaciones',
  returns: 'devoluciones',
  purchases: 'compras',
  payments: 'pagos',
  inventoryMovements: 'movimientosInventario',
  cashSessions: 'cajas',
  expenses: 'gastos',
  users: 'usuariosSistema',
  auditLogs: 'auditoria',
  paymentPromises: 'promesasPago'
});

const CLOUD_ARRAY_KEYS = Object.keys(CLOUD_COLLECTIONS);

const Cloud = {
  initialized: false,
  available: false,
  bootstrappingAdmin: false,
  online: navigator.onLine,
  app: null,
  auth: null,
  db: null,
  user: null,
  profile: null,
  lastSnapshot: null,
  syncTimer: null,
  syncInFlight: false,
  syncQueued: false,
  applyingRemote: false,
  listeners: [],
  loadedKeys: [],
  writableKeys: [],
  statusCallback: null,
  dataCallback: null,

  async init() {
    if (this.initialized) return;
    if (!window.firebase) throw new Error('No fue posible cargar Firebase. Revisa la conexión a internet.');

    this.app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
    const activeProject = this.app.options.projectId;
    console.log('[Comercializadora MAR] Firebase activo:', activeProject);
    if (activeProject !== EXPECTED_FIREBASE_PROJECT) {
      throw new Error(`Proyecto Firebase no autorizado: ${activeProject || 'sin identificar'}.`);
    }

    this.auth = firebase.auth(this.app);
    this.db = firebase.firestore(this.app);
    FirestoreFiles.init(this.db, () => this.user);
    this.db.settings({ ignoreUndefinedProperties: true, merge: true });

    try {
      // La aplicación carga el SDK compat; en esta API la persistencia multi-pestaña
      // se activa mediante enablePersistence({ synchronizeTabs: true }).
      await this.db.enablePersistence({ synchronizeTabs: true });
      console.log('[Comercializadora MAR] Persistencia Firestore multi-pestaña activa.');
    } catch (error) {
      if (error.code === 'failed-precondition') {
        console.warn('Firestore ya está abierto con una configuración incompatible en otra pestaña. Cierra las pestañas anteriores y recarga.');
      } else if (error.code === 'unimplemented') {
        console.warn('Este navegador no soporta persistencia Firestore.');
      } else {
        console.warn('No se pudo activar persistencia Firestore:', error);
      }
    }

    await this.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    window.addEventListener('online', () => { this.online = true; this.emitStatus('online'); this.flushQueuedSync(); });
    window.addEventListener('offline', () => { this.online = false; this.emitStatus('offline'); });
    this.available = true;
    this.initialized = true;
    this.emitStatus('ready');
  },

  onStatus(callback) {
    this.statusCallback = callback;
  },

  emitStatus(state, detail = '') {
    if (typeof this.statusCallback === 'function') this.statusCallback({ state, detail, online: this.online, syncing: this.syncInFlight });
  },

  onAuthChanged(callback) {
    return this.auth.onAuthStateChanged(user => {
      // createUserWithEmailAndPassword dispara el observador antes de que el perfil
      // inicial exista. Durante el bootstrap se ignora ese evento y se procesa
      // manualmente cuando el lote de Firestore ya fue confirmado.
      if (this.bootstrappingAdmin) return;
      return callback(user);
    });
  },

  async signIn(email, password) {
    const credential = await this.auth.signInWithEmailAndPassword(email, password);
    return credential.user;
  },

  async sendPasswordReset(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw new Error('Escribe el correo de la cuenta.');
    await this.auth.sendPasswordResetEmail(normalized);
  },

  async signOut() {
    this.stopRealtime();
    this.user = null;
    this.profile = null;
    await this.auth.signOut();
  },

  async getSystemState() {
    const snapshot = await this.db.collection('configuracion').doc('sistema').get();
    return snapshot.exists ? snapshot.data() : null;
  },

  async bootstrapAdmin({ name, email, password }) {
    let credential = null;
    let firestoreCommitted = false;
    this.bootstrappingAdmin = true;
    try {
      const normalizedName = String(name || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedName) throw new Error('Escribe el nombre del administrador.');
      if (!normalizedEmail) throw new Error('Escribe el correo del administrador.');

      const systemState = await this.getSystemState();
      if (systemState?.initialized) throw new Error('El sistema ya tiene un administrador inicial. Inicia sesión con una cuenta autorizada.');

      // Evita que una sesión anterior interfiera con la creación inicial.
      if (this.auth.currentUser) await this.auth.signOut();

      credential = await this.auth.createUserWithEmailAndPassword(normalizedEmail, password);
      const uid = credential.user.uid;
      const now = new Date().toISOString();
      const batch = this.db.batch();
      const systemRef = this.db.collection('configuracion').doc('sistema');
      const userRef = this.db.collection(CLOUD_COLLECTIONS.users).doc(uid);
      batch.set(systemRef, {
        initialized: true,
        initializedBy: uid,
        initializedAt: now,
        projectId: EXPECTED_FIREBASE_PROJECT,
        appVersion: APP_VERSION,
        dataMigrated: false,
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      batch.set(userRef, {
        id: uid,
        uid,
        name: normalizedName,
        email: normalizedEmail,
        role: 'Administrador',
        status: 'Activo',
        officialAdmin: true,
        createdAt: now,
        updatedAt: now,
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await batch.commit();
      firestoreCommitted = true;

      // La configuración inicial no debe dejar al usuario dentro del sistema.
      // Se cierra la sesión para que el administrador pruebe el acceso normal.
      await this.auth.signOut();
      this.user = null;
      this.profile = null;

      return { uid, name: normalizedName, email: normalizedEmail, role: 'Administrador' };
    } catch (error) {
      // Solo se elimina Authentication cuando Firestore todavía no confirmó la
      // configuración. Después del commit no se revierte una cuenta válida por
      // un error secundario de cierre de sesión o interfaz.
      if (!firestoreCommitted && credential?.user) await credential.user.delete().catch(() => {});
      throw error;
    } finally {
      this.bootstrappingAdmin = false;
    }
  },

  async getProfile(uid) {
    const snapshot = await this.db.collection(CLOUD_COLLECTIONS.users).doc(uid).get();
    return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
  },

  async setCurrentUser(user) {
    this.user = user || null;
    this.profile = user ? await this.getProfile(user.uid) : null;
    return this.profile;
  },

  async createUserAccount({ name, email, password, role, status = 'Activo' }) {
    if (!this.profile || this.profile.role !== 'Administrador') throw new Error('Solo el administrador puede crear usuarios.');
    const appName = `userCreator-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const secondary = firebase.initializeApp(FIREBASE_CONFIG, appName);
    let credential = null;
    try {
      credential = await secondary.auth().createUserWithEmailAndPassword(email.trim().toLowerCase(), password);
      const uid = credential.user.uid;
      const now = new Date().toISOString();
      await this.db.collection(CLOUD_COLLECTIONS.users).doc(uid).set({
        id: uid,
        uid,
        name: name.trim(),
        email: email.trim().toLowerCase(),
        role,
        status,
        createdAt: now,
        updatedAt: now,
        createdBy: this.user.uid,
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await secondary.auth().signOut();
      return uid;
    } catch (error) {
      if (credential?.user) await credential.user.delete().catch(() => {});
      throw error;
    } finally {
      await secondary.delete().catch(() => {});
    }
  },

  async updateUserProfile(uid, changes) {
    if (!this.profile || this.profile.role !== 'Administrador') throw new Error('Solo el administrador puede modificar usuarios.');
    const allowed = { name: changes.name, role: changes.role, status: changes.status, updatedAt: new Date().toISOString(), updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    await this.db.collection(CLOUD_COLLECTIONS.users).doc(uid).set(allowed, { merge: true });
  },


  keysForRole(role) {
    const map = {
      Administrador: CLOUD_ARRAY_KEYS,
      Vendedor: ['clients','products','orders','quotes','returns','payments','users','paymentPromises'],
      Bodega: ['products','orders','returns','purchases','suppliers','inventoryMovements','users'],
      Ruta: ['orders','users'],
      Contabilidad: ['clients','products','orders','returns','purchases','payments','cashSessions','expenses','users','paymentPromises','auditLogs']
    };
    return map[role] || ['orders','users'];
  },

  writableKeysForRole(role) {
    const map = {
      Administrador: CLOUD_ARRAY_KEYS.filter(key => key !== 'users'),
      Vendedor: ['clients','orders','quotes','returns','payments','paymentPromises','auditLogs','inventoryMovements','products'],
      Bodega: ['products','orders','returns','purchases','suppliers','inventoryMovements','auditLogs'],
      Ruta: ['orders','auditLogs'],
      Contabilidad: ['clients','orders','returns','purchases','payments','cashSessions','expenses','paymentPromises','auditLogs']
    };
    return map[role] || [];
  },

  async loadAll() {
    const role = this.profile?.role || 'Ruta';
    this.loadedKeys = this.keysForRole(role);
    this.writableKeys = this.writableKeysForRole(role);
    const result = {
      settings: {}, counters: {}, version: APP_VERSION, updatedAt: new Date().toISOString(), paymentPromises: []
    };
    CLOUD_ARRAY_KEYS.forEach(key => { result[key] = []; });
    const [settingsSnap, countersSnap, ...collectionSnaps] = await Promise.all([
      this.db.collection('configuracion').doc('principal').get(),
      this.db.collection('contadores').doc('principal').get(),
      ...this.loadedKeys.map(key => this.db.collection(CLOUD_COLLECTIONS[key]).get())
    ]);
    result.settings = settingsSnap.exists ? settingsSnap.data() : {};
    result.counters = countersSnap.exists ? countersSnap.data() : {};
    this.loadedKeys.forEach((key, index) => {
      result[key] = collectionSnaps[index].docs.map(doc => ({ id: doc.id, ...doc.data() }));
    });
    result.hasBusinessData = ['clients','products','orders','payments','suppliers','purchases'].some(key => result[key].length > 0);
    this.lastSnapshot = this.cloneCloudState(result);
    return result;
  },

  cloneCloudState(dbState) {
    const out = { settings: JSON.parse(JSON.stringify(dbState.settings || {})), counters: JSON.parse(JSON.stringify(dbState.counters || {})) };
    CLOUD_ARRAY_KEYS.forEach(key => { out[key] = JSON.parse(JSON.stringify(dbState[key] || [])); });
    return out;
  },

  sanitizeDoc(value) {
    const copy = JSON.parse(JSON.stringify(value || {}));
    delete copy.password;
    delete copy.hasBusinessData;
    return copy;
  },

  comparable(value) {
    const normalize = input => {
      if (Array.isArray(input)) return input.map(normalize);
      if (input && typeof input === 'object') return Object.keys(input).sort().reduce((out, key) => {
        if (key !== 'serverUpdatedAt') out[key] = normalize(input[key]);
        return out;
      }, {});
      return input;
    };
    return JSON.stringify(normalize(this.sanitizeDoc(value)));
  },

  queueSync(dbState) {
    if (!this.available || !this.user || this.applyingRemote) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.syncNow(dbState).catch(error => {
      console.error('Error sincronizando Firestore:', error);
      this.emitStatus('error', error.message || 'Error de sincronización');
    }), 650);
  },

  async flushQueuedSync() {
    if (this.syncQueued && typeof DB !== 'undefined') await this.syncNow(DB);
  },

  async syncNow(dbState, { force = false, includeUsers = false } = {}) {
    if (!this.available || !this.user) return;
    if (this.syncInFlight) { this.syncQueued = true; return; }
    this.syncInFlight = true;
    this.syncQueued = false;
    this.emitStatus('syncing');
    try {
      const previous = this.lastSnapshot || { settings: {}, counters: {} };
      const operations = [];
      const addSet = (ref, data, merge = true) => operations.push({ type: 'set', ref, data, merge });
      const addDelete = ref => operations.push({ type: 'delete', ref });
      const serverStamp = firebase.firestore.FieldValue.serverTimestamp();

      const settings = this.sanitizeDoc(dbState.settings || {});
      const counters = this.sanitizeDoc(dbState.counters || {});
      if ((this.profile?.role === 'Administrador') && (force || JSON.stringify(settings) !== JSON.stringify(previous.settings || {}))) {
        addSet(this.db.collection('configuracion').doc('principal'), { ...settings, appVersion: APP_VERSION, updatedAt: new Date().toISOString(), serverUpdatedAt: serverStamp });
      }
      if ((this.profile?.role !== 'Ruta') && (force || JSON.stringify(counters) !== JSON.stringify(previous.counters || {}))) {
        addSet(this.db.collection('contadores').doc('principal'), { ...counters, updatedAt: new Date().toISOString(), serverUpdatedAt: serverStamp });
      }

      const syncKeys = includeUsers ? [...new Set([...this.writableKeys, 'users'])] : this.writableKeys;
      syncKeys.forEach(key => {
        if (key === 'users' && !includeUsers) return;
        if (!force && ['inventoryMovements', 'auditLogs'].includes(key)) return;
        const collectionName = CLOUD_COLLECTIONS[key];
        const currentItems = Array.isArray(dbState[key]) ? dbState[key] : [];
        const previousItems = Array.isArray(previous[key]) ? previous[key] : [];
        const prevMap = new Map(previousItems.map(item => [item.id, item]));
        const currentIds = new Set();
        currentItems.forEach(item => {
          if (!item?.id) return;
          currentIds.add(item.id);
          const prior = prevMap.get(item.id);
          if (force || !prior || this.comparable(item) !== this.comparable(prior)) {
            const data = this.sanitizeDoc(item);
            addSet(this.db.collection(collectionName).doc(item.id), { ...data, updatedAt: data.updatedAt || new Date().toISOString(), serverUpdatedAt: serverStamp });
          }
        });
        previousItems.forEach(item => {
          if (item?.id && !currentIds.has(item.id)) addDelete(this.db.collection(collectionName).doc(item.id));
        });
      });

      for (let start = 0; start < operations.length; start += 400) {
        const batch = this.db.batch();
        operations.slice(start, start + 400).forEach(op => {
          if (op.type === 'delete') batch.delete(op.ref);
          else batch.set(op.ref, op.data, { merge: op.merge });
        });
        await batch.commit();
      }
      this.lastSnapshot = this.cloneCloudState(dbState);
      this.emitStatus(this.online ? 'synced' : 'offline');
    } finally {
      this.syncInFlight = false;
      if (this.syncQueued) setTimeout(() => this.syncNow(DB).catch(console.error), 50);
    }
  },

  async testConnection() {
    if (!this.user) throw new Error('No hay una sesión autenticada.');
    const profileSnap = await this.db.collection(CLOUD_COLLECTIONS.users).doc(this.user.uid).get();
    if (!profileSnap.exists) throw new Error('No se encontró el perfil del usuario.');
    await this.db.collection(CLOUD_COLLECTIONS.orders).limit(1).get();
    const diagnostic = {
      id: `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      action: 'DIAGNOSTICO', entityType: 'Firebase', entityId: EXPECTED_FIREBASE_PROJECT,
      detail: `Autenticación, lectura y escritura verificadas para ${this.user.email || this.user.uid}`,
      createdAt: new Date().toISOString(), userId: this.user.uid,
      userEmail: this.profile?.email || this.user.email || ''
    };
    await this.writeAudit(diagnostic);
    return { projectId: this.app.options.projectId, uid: this.user.uid, email: this.user.email, role: profileSnap.data().role };
  },

  async writeAudit(record) {
    if (!this.user || !record?.id) return;
    const data = this.sanitizeDoc({ ...record, userId: record.userId || this.user.uid, userEmail: record.userEmail || this.profile?.email || this.user.email });
    await this.db.collection(CLOUD_COLLECTIONS.auditLogs).doc(record.id).set({ ...data, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
  },

  async uploadFullDB(dbState) {
    await this.syncNow(dbState, { force: true, includeUsers: false });
    await this.db.collection('configuracion').doc('sistema').set({
      initialized: true,
      dataMigrated: true,
      dataMigratedAt: new Date().toISOString(),
      dataMigratedBy: this.user.uid,
      appVersion: APP_VERSION,
      projectId: EXPECTED_FIREBASE_PROJECT,
      serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  },

  startRealtime(callback) {
    this.stopRealtime();
    this.dataCallback = callback;
    this.loadedKeys.forEach(key => {
      const unsubscribe = this.db.collection(CLOUD_COLLECTIONS[key]).onSnapshot({ includeMetadataChanges: true }, snapshot => {
        if (snapshot.metadata.hasPendingWrites) return;
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (this.lastSnapshot) this.lastSnapshot[key] = JSON.parse(JSON.stringify(items));
        if (typeof callback === 'function') callback(key, items);
      }, error => {
        console.error(`Listener ${key}:`, error);
        this.emitStatus('error', error.message || `Error leyendo ${key}`);
      });
      this.listeners.push(unsubscribe);
    });

    const settingsUnsub = this.db.collection('configuracion').doc('principal').onSnapshot(snapshot => {
      if (!snapshot.exists || snapshot.metadata.hasPendingWrites) return;
      const value = snapshot.data();
      if (this.lastSnapshot) this.lastSnapshot.settings = JSON.parse(JSON.stringify(value));
      if (typeof callback === 'function') callback('settings', value);
    });
    const countersUnsub = this.db.collection('contadores').doc('principal').onSnapshot(snapshot => {
      if (!snapshot.exists || snapshot.metadata.hasPendingWrites) return;
      const value = snapshot.data();
      if (this.lastSnapshot) this.lastSnapshot.counters = JSON.parse(JSON.stringify(value));
      if (typeof callback === 'function') callback('counters', value);
    });
    this.listeners.push(settingsUnsub, countersUnsub);
  },

  stopRealtime() {
    this.listeners.forEach(unsubscribe => { try { unsubscribe(); } catch (_) {} });
    this.listeners = [];
  },

  async createOrderAtomic(draft, initialPaymentAmount = 0) {
    if (!this.online) throw new Error('Para confirmar un pedido se requiere conexión. Puedes guardarlo como borrador mientras vuelve internet.');
    const orderId = draft.id || `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const paymentId = initialPaymentAmount > 0 ? `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` : '';
    const movementIds = draft.items.map((_, index) => `mov_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 7)}`);
    const counterRef = this.db.collection('contadores').doc('principal');
    const orderRef = this.db.collection(CLOUD_COLLECTIONS.orders).doc(orderId);
    const clientRef = this.db.collection(CLOUD_COLLECTIONS.clients).doc(draft.clientId);
    const productRefs = draft.items.map(item => this.db.collection(CLOUD_COLLECTIONS.products).doc(item.productId));
    const now = new Date().toISOString();

    const result = await this.db.runTransaction(async transaction => {
      const [counterSnap, clientSnap, ...productSnaps] = await Promise.all([
        transaction.get(counterRef), transaction.get(clientRef), ...productRefs.map(ref => transaction.get(ref))
      ]);
      if (!clientSnap.exists) throw new Error('El cliente ya no existe en la base de datos.');
      const counters = counterSnap.exists ? counterSnap.data() : {};
      const orderCounter = Number(counters.orders || 0) + 1;
      const paymentCounter = Number(counters.payments || 0) + (initialPaymentAmount > 0 ? 1 : 0);
      const orderNumber = `PED-${String(orderCounter).padStart(6, '0')}`;
      const paymentNumber = initialPaymentAmount > 0 ? `PAG-${String(paymentCounter).padStart(6, '0')}` : '';
      const clientData = clientSnap.data();
      const movements = [];

      productSnaps.forEach((snapshot, index) => {
        const item = draft.items[index];
        if (!snapshot.exists) throw new Error(`El producto ${item.name} ya no existe.`);
        const product = snapshot.data();
        const available = Number(product.stock || 0);
        const quantity = Number(item.quantity || 0);
        if (available < quantity) throw new Error(`Inventario insuficiente para ${item.name}. Disponible: ${available}.`);
        const after = available - quantity;
        transaction.set(productRefs[index], { stock: after, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const movement = {
          id: movementIds[index], type: 'Salida por pedido', productId: item.productId, productCode: item.code,
          productName: item.name, quantity: -quantity, stockBefore: available, stockAfter: after,
          reference: orderNumber, createdAt: now, createdBy: this.profile.email || this.user.email,
          userId: this.user.uid
        };
        transaction.set(this.db.collection(CLOUD_COLLECTIONS.inventoryMovements).doc(movement.id), { ...movement, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        movements.push(movement);
      });

      const currentBalance = Number(clientData.currentBalance || 0);
      const projected = currentBalance + Number(draft.total || 0) - Number(initialPaymentAmount || 0);
      const creditLimit = Number(clientData.creditLimit || 0);
      const status = creditLimit > 0 && projected > creditLimit ? 'Pendiente de aprobación' : 'Confirmado';
      const order = {
        ...this.sanitizeDoc(draft), id: orderId, number: orderNumber, status,
        paid: Number(initialPaymentAmount || 0), balance: Math.max(0, Number(draft.total || 0) - Number(initialPaymentAmount || 0)),
        paymentStatus: initialPaymentAmount >= Number(draft.total || 0) ? 'Pagado' : initialPaymentAmount > 0 ? 'Abonado' : (draft.paymentMethod === 'Crédito' ? 'Crédito' : 'Pendiente'),
        pdf: { generated: false, version: 1, fileName: `FACTURA_COMPRA_${orderNumber}-V1.pdf`, layoutVersion: 2, storage: 'firestore-base64' },
        createdAt: now, updatedAt: now, createdBy: this.profile.email || this.user.email,
        createdByUid: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      };
      transaction.set(orderRef, order);

      let payment = null;
      if (initialPaymentAmount > 0) {
        payment = {
          id: paymentId, number: paymentNumber, orderId, orderNumber, clientId: draft.clientId,
          clientName: draft.clientName, amount: Number(initialPaymentAmount), method: draft.paymentMethod,
          reference: 'Pago inicial', notes: 'Registrado al crear el pedido', status: 'Aplicado',
          createdAt: now, createdBy: this.profile.email || this.user.email, createdByUid: this.user.uid
        };
        transaction.set(this.db.collection(CLOUD_COLLECTIONS.payments).doc(paymentId), { ...payment, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }

      transaction.set(clientRef, { currentBalance: projected, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(counterRef, { orders: orderCounter, payments: paymentCounter, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { order, payment, movements, productStocks: movements.map(m => ({ productId: m.productId, stock: m.stockAfter })), counters: { orders: orderCounter, payments: paymentCounter } };
    });
    return result;
  },

  async registerPaymentAtomic(order, amount, method, reference = '', notes = '', paymentDate = '') {
    if (!this.online) throw new Error('Se requiere conexión para registrar un pago y evitar duplicados.');
    const paymentId = `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const orderRef = this.db.collection(CLOUD_COLLECTIONS.orders).doc(order.id);
    const clientRef = this.db.collection(CLOUD_COLLECTIONS.clients).doc(order.clientId);
    const counterRef = this.db.collection('contadores').doc('principal');
    const paymentRef = this.db.collection(CLOUD_COLLECTIONS.payments).doc(paymentId);
    const now = paymentDate ? `${paymentDate}T12:00:00.000Z` : new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const [orderSnap, clientSnap, counterSnap] = await Promise.all([transaction.get(orderRef), transaction.get(clientRef), transaction.get(counterRef)]);
      if (!orderSnap.exists) throw new Error('El pedido no existe en Firestore.');
      const cloudOrder = orderSnap.data();
      const currentBalance = Number(cloudOrder.balance || 0);
      const applied = Math.min(Math.max(0, Number(amount || 0)), currentBalance);
      if (applied <= 0) throw new Error('El valor del abono debe ser mayor a cero.');
      const counters = counterSnap.exists ? counterSnap.data() : {};
      const paymentCounter = Number(counters.payments || 0) + 1;
      const paymentNumber = `PAG-${String(paymentCounter).padStart(6, '0')}`;
      const newPaid = Number(cloudOrder.paid || 0) + applied;
      const newBalance = Math.max(0, currentBalance - applied);
      const paymentStatus = newBalance <= 0 ? 'Pagado' : 'Abonado';
      const payment = {
        id: paymentId, number: paymentNumber, orderId: order.id, orderNumber: order.number,
        clientId: order.clientId, clientName: order.clientName, amount: applied, method, reference, notes,
        status: 'Aplicado', createdAt: now, createdBy: this.profile.email || this.user.email, createdByUid: this.user.uid
      };
      transaction.set(paymentRef, { ...payment, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      transaction.set(orderRef, { paid: newPaid, balance: newBalance, paymentStatus, updatedAt: now, updatedBy: this.user.uid, pdf: { ...(cloudOrder.pdf || {}), generated: false, version: Number(cloudOrder.pdf?.version || 1) + 1, fileName: `FACTURA_COMPRA_${order.number}-V${Number(cloudOrder.pdf?.version || 1) + 1}.pdf`, layoutVersion: 2, storage: 'firestore-base64' }, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      if (clientSnap.exists) {
        const newClientBalance = Math.max(0, Number(clientSnap.data().currentBalance || 0) - applied);
        transaction.set(clientRef, { currentBalance: newClientBalance, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      transaction.set(counterRef, { payments: paymentCounter, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { payment, newPaid, newBalance, paymentStatus, paymentCounter };
    });
  },


  async cancelOrderAtomic(order) {
    if (!this.online) throw new Error('Se requiere conexión para cancelar un pedido y restaurar inventario.');
    const orderRef = this.db.collection(CLOUD_COLLECTIONS.orders).doc(order.id);
    const clientRef = this.db.collection(CLOUD_COLLECTIONS.clients).doc(order.clientId);
    const productRefs = (order.items || []).map(item => this.db.collection(CLOUD_COLLECTIONS.products).doc(item.productId));
    const movementIds = (order.items || []).map((_, index) => `mov_${Date.now().toString(36)}_cancel_${index}_${Math.random().toString(36).slice(2, 7)}`);
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const [orderSnap, clientSnap, ...productSnaps] = await Promise.all([transaction.get(orderRef), transaction.get(clientRef), ...productRefs.map(ref => transaction.get(ref))]);
      if (!orderSnap.exists) throw new Error('El pedido ya no existe en Firestore.');
      const cloudOrder = orderSnap.data();
      if (cloudOrder.status === 'Cancelado') throw new Error('El pedido ya fue cancelado.');
      if (Number(cloudOrder.paid || 0) > 0) throw new Error('El pedido tiene pagos aplicados. Registra primero la devolución o el reembolso antes de cancelarlo.');
      const movements = [];
      productSnaps.forEach((snapshot, index) => {
        if (!snapshot.exists) return;
        const item = (cloudOrder.items || order.items || [])[index];
        const product = snapshot.data();
        const before = Number(product.stock || 0);
        const quantity = Number(item.quantity || 0);
        const after = before + quantity;
        transaction.set(productRefs[index], { stock: after, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const movement = { id: movementIds[index], type: 'Reversión por cancelación', productId: item.productId, productCode: item.code, productName: item.name, quantity, stockBefore: before, stockAfter: after, reference: cloudOrder.number, createdAt: now, createdBy: this.profile.email || this.user.email, userId: this.user.uid };
        transaction.set(this.db.collection(CLOUD_COLLECTIONS.inventoryMovements).doc(movement.id), { ...movement, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        movements.push(movement);
      });
      transaction.set(orderRef, { status: 'Cancelado', updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      if (clientSnap.exists) {
        const clientBalance = Math.max(0, Number(clientSnap.data().currentBalance || 0) - Number(cloudOrder.balance || 0));
        transaction.set(clientRef, { currentBalance: clientBalance, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
      return { movements, productStocks: movements.map(movement => ({ productId: movement.productId, stock: movement.stockAfter })) };
    });
  },

  async registerReturnAtomic(returnDraft) {
    if (!this.online) throw new Error('Se requiere conexión para registrar la devolución de forma segura.');
    const returnId = returnDraft.id || `ret_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const movementId = returnDraft.restock ? `mov_${Date.now().toString(36)}_return_${Math.random().toString(36).slice(2, 8)}` : '';
    const returnRef = this.db.collection(CLOUD_COLLECTIONS.returns).doc(returnId);
    const counterRef = this.db.collection('contadores').doc('principal');
    const orderRef = this.db.collection(CLOUD_COLLECTIONS.orders).doc(returnDraft.orderId);
    const clientRef = this.db.collection(CLOUD_COLLECTIONS.clients).doc(returnDraft.clientId);
    const productRef = this.db.collection(CLOUD_COLLECTIONS.products).doc(returnDraft.productId);
    const now = new Date().toISOString();

    return this.db.runTransaction(async transaction => {
      const reads = [transaction.get(counterRef), transaction.get(orderRef), transaction.get(clientRef)];
      if (returnDraft.restock) reads.push(transaction.get(productRef));
      const snapshots = await Promise.all(reads);
      const counterSnap = snapshots[0];
      const orderSnap = snapshots[1];
      const clientSnap = snapshots[2];
      const productSnap = returnDraft.restock ? snapshots[3] : null;
      if (!orderSnap.exists) throw new Error('El pedido ya no existe en Firestore.');
      if (!clientSnap.exists) throw new Error('El cliente ya no existe en Firestore.');
      if (returnDraft.restock && !productSnap?.exists) throw new Error('El producto ya no existe en Firestore.');

      const cloudOrder = orderSnap.data();
      const counters = counterSnap.exists ? counterSnap.data() : {};
      const returnCounter = Number(counters.returns || 0) + 1;
      const returnNumber = `DEV-${String(returnCounter).padStart(6, '0')}`;
      if (['Cancelado','Borrador','Convertido'].includes(cloudOrder.status)) throw new Error('Este pedido no admite devoluciones.');
      const soldItem = (cloudOrder.items || []).find(item => item.productId === returnDraft.productId);
      if (!soldItem) throw new Error('El producto no pertenece al pedido seleccionado.');
      const quantity = Math.floor(Number(returnDraft.quantity || 0));
      if (quantity <= 0) throw new Error('La cantidad devuelta debe ser mayor a cero.');
      const returnedQuantities = { ...(cloudOrder.returnedQuantities || {}) };
      const previouslyReturned = Number(returnedQuantities[returnDraft.productId] || 0);
      if (previouslyReturned + quantity > Number(soldItem.quantity || 0)) throw new Error('La cantidad supera lo vendido o ya devuelto.');
      returnedQuantities[returnDraft.productId] = previouslyReturned + quantity;

      const maximumCredit = quantity * Number(soldItem.price || 0);
      const requestedCredit = Math.max(0, Number(returnDraft.creditAmount || maximumCredit));
      const creditAmount = Math.min(maximumCredit, requestedCredit);
      const currentBalance = Number(cloudOrder.balance || 0);
      const appliedToDebt = Math.min(currentBalance, creditAmount);
      const newBalance = Math.max(0, currentBalance - appliedToDebt);
      const newTotalReturns = Number(cloudOrder.totalReturns || 0) + creditAmount;
      const paymentStatus = newBalance <= 0 ? 'Pagado' : Number(cloudOrder.paid || 0) > 0 ? 'Abonado' : (cloudOrder.paymentMethod === 'Crédito' ? 'Crédito' : 'Pendiente');
      const nextPdfVersion = Number(cloudOrder.pdf?.version || 1) + 1;

      const resultReturn = {
        ...this.sanitizeDoc(returnDraft), id: returnId, number: returnNumber, quantity, unitPrice: Number(soldItem.price || 0),
        creditAmount, appliedToDebt, status: 'Registrada', createdAt: now,
        createdBy: this.profile.email || this.user.email, createdByUid: this.user.uid
      };
      transaction.set(returnRef, { ...resultReturn, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      transaction.set(orderRef, {
        returnedQuantities, totalReturns: newTotalReturns, balance: newBalance, paymentStatus,
        updatedAt: now, updatedBy: this.user.uid,
        pdf: { ...(cloudOrder.pdf || {}), generated: false, version: nextPdfVersion, fileName: `FACTURA_COMPRA_${cloudOrder.number}-V${nextPdfVersion}.pdf`, layoutVersion: 2, storage: 'firestore-base64' },
        serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      const clientBalance = Math.max(0, Number(clientSnap.data().currentBalance || 0) - appliedToDebt);
      transaction.set(clientRef, { currentBalance: clientBalance, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });

      let movement = null;
      let productStock = null;
      if (returnDraft.restock) {
        const product = productSnap.data();
        const before = Number(product.stock || 0);
        const after = before + quantity;
        productStock = { productId: returnDraft.productId, stock: after };
        transaction.set(productRef, { stock: after, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        movement = {
          id: movementId, type: 'Entrada por devolución', productId: returnDraft.productId,
          productCode: soldItem.code || returnDraft.productCode || '', productName: soldItem.name || returnDraft.productName || '',
          quantity, stockBefore: before, stockAfter: after, reference: returnNumber,
          createdAt: now, createdBy: this.profile.email || this.user.email, userId: this.user.uid
        };
        transaction.set(this.db.collection(CLOUD_COLLECTIONS.inventoryMovements).doc(movementId), { ...movement, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      }
      transaction.set(counterRef, { returns: returnCounter, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { returnRecord: resultReturn, movement, productStock, newBalance, paymentStatus, totalReturns: newTotalReturns, returnedQuantities, nextPdfVersion, returnCounter };
    });
  },

  async adjustStockAtomic(productId, newStock, type, reason) {
    if (!this.online) throw new Error('Se requiere conexión para ajustar inventario de forma segura.');
    const productRef = this.db.collection(CLOUD_COLLECTIONS.products).doc(productId);
    const movementId = `mov_${Date.now().toString(36)}_adjust_${Math.random().toString(36).slice(2, 8)}`;
    const movementRef = this.db.collection(CLOUD_COLLECTIONS.inventoryMovements).doc(movementId);
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const productSnap = await transaction.get(productRef);
      if (!productSnap.exists) throw new Error('El producto ya no existe en Firestore.');
      const product = productSnap.data();
      const before = Number(product.stock || 0);
      const after = Math.max(0, Math.floor(Number(newStock || 0)));
      if (before === after) throw new Error('La nueva existencia es igual a la actual.');
      const movement = {
        id: movementId, type, productId, productCode: product.code || '', productName: product.name || '',
        quantity: after - before, stockBefore: before, stockAfter: after, reference: reason,
        createdAt: now, createdBy: this.profile.email || this.user.email, userId: this.user.uid
      };
      transaction.set(productRef, { stock: after, updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      transaction.set(movementRef, { ...movement, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
      return { movement, stock: after };
    });
  },

  async receivePurchaseAtomic(purchase) {
    if (!this.online) throw new Error('Se requiere conexión para recibir compras y actualizar existencias.');
    const purchaseRef = this.db.collection(CLOUD_COLLECTIONS.purchases).doc(purchase.id);
    const productRefs = (purchase.items || []).map(item => this.db.collection(CLOUD_COLLECTIONS.products).doc(item.productId));
    const movementIds = (purchase.items || []).map((_, index) => `mov_${Date.now().toString(36)}_purchase_${index}_${Math.random().toString(36).slice(2, 7)}`);
    const now = new Date().toISOString();
    return this.db.runTransaction(async transaction => {
      const [purchaseSnap, ...productSnaps] = await Promise.all([transaction.get(purchaseRef), ...productRefs.map(ref => transaction.get(ref))]);
      if (!purchaseSnap.exists) throw new Error('La compra no existe en Firestore.');
      if (purchaseSnap.data().status === 'Recibida') throw new Error('La compra ya fue recibida.');
      const movements = [];
      productSnaps.forEach((snapshot, index) => {
        if (!snapshot.exists) throw new Error(`El producto ${(purchase.items || [])[index]?.name || ''} no existe.`);
        const item = purchase.items[index];
        const product = snapshot.data();
        const before = Number(product.stock || 0);
        const quantity = Number(item.quantity || 0);
        const after = before + quantity;
        transaction.set(productRefs[index], { stock: after, cost: Number(item.cost || 0), updatedAt: now, updatedBy: this.user.uid, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const movement = { id: movementIds[index], type: 'Entrada por compra', productId: item.productId, productCode: item.code, productName: item.name, quantity, stockBefore: before, stockAfter: after, reference: purchase.number, createdAt: now, createdBy: this.profile.email || this.user.email, userId: this.user.uid };
        transaction.set(this.db.collection(CLOUD_COLLECTIONS.inventoryMovements).doc(movement.id), { ...movement, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() });
        movements.push(movement);
      });
      transaction.set(purchaseRef, { status: 'Recibida', receivedAt: now, receivedBy: this.profile.email || this.user.email, receivedByUid: this.user.uid, updatedAt: now, serverUpdatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return { movements, productStocks: movements.map(movement => ({ productId: movement.productId, stock: movement.stockAfter, cost: Number((purchase.items || []).find(item => item.productId === movement.productId)?.cost || 0) })) };
    });
  },

  async uploadDeliveryEvidence(file, order) {
    if (!this.online) throw new Error('Se requiere conexión para guardar evidencias en Firestore.');
    if (!this.user) throw new Error('Debes iniciar sesión para guardar la evidencia.');
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('Selecciona una imagen válida.');
    if (Number(file.size || 0) > FIRESTORE_FILE_MAX_BYTES) throw new Error('La evidencia no puede superar 20 MB.');
    return FirestoreFiles.save(file, {
      fileName: file.name || `${order.number}-evidencia.jpg`,
      category: 'evidencias-entrega',
      entityType: 'pedido',
      entityId: order.id,
      entityNumber: order.number,
      allowedMimePrefixes: ['image/']
    });
  },

  async uploadPdf(blob, entity, type = 'pedidos') {
    if (!this.user) throw new Error('Debes iniciar sesión para guardar el PDF.');
    const result = await FirestoreFiles.save(blob, {
      fileName: entity.pdf.fileName,
      category: `documentos-${type}`,
      entityType: type,
      entityId: entity.id,
      entityNumber: entity.number,
      allowedMimePrefixes: ['application/pdf']
    });
    return result;
  },

  async readStoredFile(fileId) {
    return FirestoreFiles.read(fileId);
  },

  async removeStoredFile(fileId) {
    return FirestoreFiles.remove(fileId);
  }

};
