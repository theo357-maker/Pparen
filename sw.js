// sw.js - Service Worker Robuste pour Notifications en Arrière-Plan v1.0
const CACHE_NAME = 'cs-lacolombe-parent-v1.0';
const APP_VERSION = '1.0.0';
const NOTIFICATION_TYPES = ['presence', 'incident', 'communique', 'devoir', 'note'];

// Fichiers essentiels à mettre en cache
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

// Importer les scripts Firebase
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js' );
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js' );

// Configuration Firebase (doit être identique à celle de votre page)
const firebaseConfig = {
  apiKey: "AIzaSyBn7VIddclO7KtrXb5sibCr9SjVLjOy-qI",
  authDomain: "theo1d.firebaseapp.com",
  projectId: "theo1d",
  storageBucket: "theo1d.firebasestorage.app",
  messagingSenderId: "269629842962",
  appId: "1:269629842962:web:a80a12b04448fe1e595acb"
};

// Initialiser Firebase dans le Service Worker
let db;
try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  console.log('✅ SW: Firebase Firestore initialisé.');
} catch (e) {
  console.error('❌ SW: Erreur initialisation Firebase', e);
}

// --- CYCLE DE VIE DU SERVICE WORKER ---

self.addEventListener('install', (event) => {
  console.log(`🔧 SW: Installation version ${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CORE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log(`🚀 SW: Activation version ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// --- GESTION DU CACHE (Network First) ---

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Ignorer les requêtes non-GET et celles vers Firebase
  if (request.method !== 'GET' || request.url.includes('firestore.googleapis.com')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(networkResponse => {
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, responseClone));
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// --- LOGIQUE DE NOTIFICATION ---

// Fonction principale pour vérifier toutes les données
async function checkAllDataForNotifications() {
    if (!db) return;
    console.log('🔄 SW: Vérification des nouvelles données en arrière-plan...');

    const lastChecks = await getFromIndexedDB('lastChecks') || {};
    let newNotificationsCount = 0;

    // 1. Vérifier les incidents
    try {
        const incidentsQuery = db.collection('incidents').where('createdAt', '>', new Date(lastChecks.incident || 0));
        const snapshot = await incidentsQuery.get();
        if (!snapshot.empty) {
            newNotificationsCount += snapshot.size;
            await showNotification('⚠️ Nouvel Incident', `Vous avez ${snapshot.size} nouvel(s) incident(s) non lu(s).`);
            lastChecks.incident = Date.now();
        }
    } catch (e) { console.error("SW: Erreur incidents", e); }

    // 2. Vérifier les communiqués
    try {
        const communiquesQuery = db.collection('parent_communiques').where('publishedAt', '>', new Date(lastChecks.communique || 0));
        const snapshot = await communiquesQuery.get();
        if (!snapshot.empty) {
            newNotificationsCount += snapshot.size;
            await showNotification('📄 Nouveau Communiqué', `Vous avez ${snapshot.size} nouveau(x) communiqué(s).`);
            lastChecks.communique = Date.now();
        }
    } catch (e) { console.error("SW: Erreur communiqués", e); }

    // 3. Vérifier les devoirs
    try {
        const devoirsQuery = db.collection('homework').where('createdAt', '>', new Date(lastChecks.devoir || 0));
        const snapshot = await devoirsQuery.get();
        if (!snapshot.empty) {
            newNotificationsCount += snapshot.size;
            await showNotification('📚 Nouveaux Devoirs', `${snapshot.size} nouveau(x) devoir(s) ont été assigné(s).`);
            lastChecks.devoir = Date.now();
        }
    } catch (e) { console.error("SW: Erreur devoirs", e); }

    // 4. Vérifier les notes
    try {
        const notesQuery = db.collection('published_grades').where('publishedAt', '>', new Date(lastChecks.note || 0));
        const snapshot = await notesQuery.get();
        if (!snapshot.empty) {
            newNotificationsCount += snapshot.size;
            await showNotification('📊 Nouvelles Notes', `De nouvelles notes ont été publiées.`);
            lastChecks.note = Date.now();
        }
    } catch (e) { console.error("SW: Erreur notes", e); }

    // Mettre à jour les timestamps et le badge
    await saveToIndexedDB('lastChecks', lastChecks);
    if (newNotificationsCount > 0) {
        await updateAppBadge(newNotificationsCount);
    }
}

// Afficher une notification
async function showNotification(title, body, tag = 'general') {
  return self.registration.showNotification(title, {
    body: body,
    icon: './icon-192x192.png',
    badge: './icon-72x72.png', // Icône pour la barre de statut Android
    tag: tag,
    requireInteraction: true, // La notification reste jusqu'à interaction
    vibrate: [200, 100, 200] // Vibration
  });
}

// Mettre à jour le badge de l'application
async function updateAppBadge(count) {
  if (self.navigator && 'setAppBadge' in self.navigator) {
    await self.navigator.setAppBadge(count);
    console.log(`✅ SW: Badge mis à jour à ${count}.`);
  }
}

// --- GESTION DES ÉVÉNEMENTS DE SYNCHRONISATION ---

// Événement de synchronisation périodique (toutes les ~15-30 minutes)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-data-sync') {
    console.log('⚙️ SW: Synchronisation périodique déclenchée.');
    event.waitUntil(checkAllDataForNotifications());
  }
});

// Événement de synchronisation ponctuelle (quand la connexion revient)
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-data-sync') {
    console.log('🔗 SW: Synchronisation en arrière-plan déclenchée (connexion retrouvée).');
    event.waitUntil(checkAllDataForNotifications());
  }
});

// --- COMMUNICATION ET ACTIONS ---

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CHECK_NOW') {
        checkAllDataForNotifications();
    }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Si l'app est déjà ouverte, on la focus
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      // Sinon, on l'ouvre
      return clients.openWindow('./index.html');
    })
  );
});

// --- HELPERS INDEXEDDB ---
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PWA-Parent-Storage', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('appData');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getFromIndexedDB(key) {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction('appData', 'readonly');
    const store = tx.objectStore('appData');
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
  });
}

async function saveToIndexedDB(key, value) {
  const db = await openDB();
  return new Promise(resolve => {
    const tx = db.transaction('appData', 'readwrite');
    const store = tx.objectStore('appData');
    store.put(value, key);
    tx.oncomplete = () => resolve();
  });
}
