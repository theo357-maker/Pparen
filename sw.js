// sw-firebase-unified.js - Service Worker Unifié CS La Colombe v5.0
const CACHE_NAME = 'cs-lacolombe-v5.0';
const APP_VERSION = '5.0.0';
const BADGE_CACHE = 'badges-v1';

// Import Firebase directement
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBn7VIddclO7KtrXb5sibCr9SjVLjOy-qI",
  authDomain: "theo1d.firebaseapp.com",
  projectId: "theo1d",
  storageBucket: "theo1d.firebasestorage.app",
  messagingSenderId: "269629842962",
  appId: "1:269629842962:web:a80a12b04448fe1e595acb",
  measurementId: "G-TNSG1XFMDZ"
};

// Initialiser Firebase
let messaging = null;
try {
  firebase.initializeApp(firebaseConfig);
  messaging = firebase.messaging();
  console.log('✅ Firebase initialisé dans SW');
} catch (error) {
  console.error('❌ Erreur Firebase SW:', error);
}

// ============================================
// INSTALLATION ET ACTIVATION
// ============================================
self.addEventListener('install', (event) => {
  console.log('🔧 Installation SW v5.0');
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then(cache => {
        return cache.addAll([
          '/',
          '/index.html',
          '/manifest.json',
          '/icon-192x192.png',
          '/icon-512x512.png',
          '/icon-badge-96x96.png'
        ]);
      }),
      self.skipWaiting()
    ])
  );
});

self.addEventListener('activate', (event) => {
  console.log('🚀 Activation SW v5.0');
  event.waitUntil(
    Promise.all([
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== BADGE_CACHE) {
              console.log('🗑️ Suppression cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      self.clients.claim()
    ])
  );
});

// ============================================
// GESTION DES NOTIFICATIONS FIREBASE EN ARRIÈRE-PLAN
// ============================================
if (messaging) {
  messaging.onBackgroundMessage(async (payload) => {
    console.log('📱 Notification arrière-plan reçue:', payload);
    
    // Récupérer les données
    const notificationTitle = payload.notification?.title || 'CS La Colombe';
    const notificationBody = payload.notification?.body || 'Nouvelle notification';
    const data = payload.data || {};
    const notificationType = data.type || 'general';
    
    // Sauvegarder pour le badge
    await saveNotificationForBadge(notificationType);
    
    // Mettre à jour le badge
    await updateAppBadge();
    
    // Personnaliser le titre selon le type
    let title = notificationTitle;
    switch(notificationType) {
      case 'grades': title = '📊 Nouvelles notes'; break;
      case 'incidents': title = '⚠️ Nouvel incident'; break;
      case 'homework': title = '📚 Nouveau devoir'; break;
      case 'communiques': title = '📄 Nouveau communiqué'; break;
      case 'presence': title = '📅 Mise à jour présence'; break;
      case 'timetable': title = '⏰ Nouvel horaire'; break;
      case 'payments': title = '💰 Paiement'; break;
    }
    
    // Options de notification
    const notificationOptions = {
      body: notificationBody,
      icon: '/icon-192x192.png',
      badge: '/icon-badge-96x96.png',
      vibrate: [200, 100, 200, 100, 200],
      tag: notificationType,
      renotify: true,
      requireInteraction: true,
      silent: false,
      timestamp: Date.now(),
      data: data,
      actions: [
        {
          action: 'view',
          title: '👁️ Voir'
        },
        {
          action: 'dismiss',
          title: '❌ Fermer'
        }
      ]
    };
    
    // Afficher la notification
    return self.registration.showNotification(title, notificationOptions);
  });
}

// ============================================
// GESTION DES BADGES
// ============================================
async function saveNotificationForBadge(type) {
  try {
    const badges = await getBadgesFromStorage();
    badges.push({
      type: type,
      timestamp: Date.now(),
      read: false
    });
    
    // Garder seulement les 100 dernières
    if (badges.length > 100) {
      badges.splice(0, badges.length - 100);
    }
    
    await setBadgesToStorage(badges);
    console.log(`✅ Badge sauvegardé: ${type}`);
  } catch (error) {
    console.error('❌ Erreur sauvegarde badge:', error);
  }
}

async function updateAppBadge() {
  if (!('setAppBadge' in navigator)) {
    console.log('⚠️ Badges non supportés');
    return;
  }
  
  try {
    const badges = await getBadgesFromStorage();
    const unreadCount = badges.filter(b => !b.read).length;
    
    if (unreadCount > 0) {
      await navigator.setAppBadge(unreadCount);
      console.log(`✅ Badge mis à jour: ${unreadCount}`);
    } else {
      await navigator.clearAppBadge();
      console.log('✅ Badge effacé');
    }
    
    // Informer les clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BADGE_UPDATED',
        count: unreadCount,
        timestamp: Date.now()
      });
    });
    
  } catch (error) {
    console.error('❌ Erreur badge:', error);
  }
}

async function getBadgesFromStorage() {
  try {
    const cache = await caches.open(BADGE_CACHE);
    const response = await cache.match('badges-data');
    
    if (response) {
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    }
  } catch (error) {
    console.error('❌ Erreur récupération badges:', error);
  }
  
  return [];
}

async function setBadgesToStorage(badges) {
  try {
    const cache = await caches.open(BADGE_CACHE);
    await cache.put('badges-data', new Response(JSON.stringify(badges)));
  } catch (error) {
    console.error('❌ Erreur stockage badges:', error);
  }
}

// ============================================
// CLIC SUR NOTIFICATION
// ============================================
self.addEventListener('notificationclick', (event) => {
  console.log('🔘 Notification cliquée:', event.notification.tag);
  
  const notification = event.notification;
  const action = event.action;
  const data = notification.data || {};
  
  notification.close();
  
  if (action === 'dismiss') {
    markNotificationAsRead(notification.tag);
    return;
  }
  
  // Action par défaut (view ou clic)
  event.waitUntil(
    handleNotificationClick(data)
  );
});

async function handleNotificationClick(data) {
  // Ouvrir ou focus l'application
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  });
  
  // Chercher un onglet existant
  for (const client of clients) {
    if (client.url.includes(self.location.origin)) {
      await client.focus();
      client.postMessage({
        type: 'NOTIFICATION_CLICKED',
        data: data,
        action: 'navigate',
        timestamp: Date.now()
      });
      
      // Marquer comme lu
      if (data.type) {
        markNotificationAsRead(data.type);
      }
      return;
    }
  }
  
  // Ouvrir un nouvel onglet
  const newClient = await self.clients.openWindow('/');
  if (newClient) {
    // Envoyer les données après chargement
    setTimeout(() => {
      newClient.postMessage({
        type: 'NOTIFICATION_CLICKED',
        data: data,
        action: 'navigate_new',
        timestamp: Date.now()
      });
    }, 1000);
  }
}

async function markNotificationAsRead(type) {
  try {
    const badges = await getBadgesFromStorage();
    let updated = false;
    
    badges.forEach(badge => {
      if (!badge.read && badge.type === type) {
        badge.read = true;
        updated = true;
      }
    });
    
    if (updated) {
      await setBadgesToStorage(badges);
      await updateAppBadge();
      console.log(`✅ Notifications ${type} marquées comme lues`);
    }
  } catch (error) {
    console.error('❌ Erreur marquage notification:', error);
  }
}

// ============================================
// COMMUNICATION AVEC LA PAGE
// ============================================
self.addEventListener('message', async (event) => {
  const { type, data } = event.data || {};
  const client = event.source;
  
  console.log('📨 Message du client:', type);
  
  switch (type) {
    case 'PING':
      client.postMessage({
        type: 'PONG',
        timestamp: Date.now(),
        version: APP_VERSION,
        status: 'active'
      });
      break;
      
    case 'GET_BADGE_COUNT':
      const badges = await getBadgesFromStorage();
      const unreadCount = badges.filter(b => !b.read).length;
      client.postMessage({
        type: 'BADGE_COUNT',
        count: unreadCount
      });
      break;
      
    case 'MARK_ALL_READ':
      await markAllNotificationsRead();
      client.postMessage({
        type: 'ALL_MARKED_READ',
        timestamp: Date.now()
      });
      break;
      
    case 'SAVE_PARENT_DATA':
      // Sauvegarder les données du parent
      await saveParentData(data);
      client.postMessage({
        type: 'PARENT_DATA_SAVED',
        timestamp: Date.now()
      });
      break;
      
    case 'NEW_NOTIFICATION':
      // Sauvegarder une nouvelle notification
      await saveNotificationForBadge(data.type || 'general');
      await updateAppBadge();
      break;
      
    case 'TEST_BACKGROUND':
      // Tester les notifications
      self.registration.showNotification('✅ Test Réussi', {
        body: 'Les notifications arrière-plan fonctionnent !',
        icon: '/icon-192x192.png',
        badge: '/icon-badge-96x96.png',
        tag: 'test',
        requireInteraction: true,
        data: {
          type: 'test',
          page: 'dashboard'
        }
      });
      break;
  }
});

async function markAllNotificationsRead() {
  try {
    const badges = await getBadgesFromStorage();
    badges.forEach(badge => badge.read = true);
    await setBadgesToStorage(badges);
    await updateAppBadge();
    console.log('✅ Toutes les notifications marquées comme lues');
  } catch (error) {
    console.error('❌ Erreur marquage toutes les notifications:', error);
  }
}

async function saveParentData(parentData) {
  try {
    const cache = await caches.open('parent-data');
    await cache.put('current-parent', new Response(JSON.stringify(parentData)));
    console.log('✅ Données parent sauvegardées');
  } catch (error) {
    console.error('❌ Erreur sauvegarde données parent:', error);
  }
}

// ============================================
// SYNCHRONISATION EN ARRIÈRE-PLAN
// ============================================
self.addEventListener('sync', (event) => {
  console.log('🔄 Synchronisation:', event.tag);
  
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  console.log('🔄 Début synchronisation notifications');
  
  try {
    // Synchroniser les badges avec le serveur
    const badges = await getBadgesFromStorage();
    
    // Ici, vous pouvez envoyer les données au serveur
    // Pour l'instant, on simule juste la synchronisation
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Synchronisation terminée');
    return Promise.resolve();
  } catch (error) {
    console.error('❌ Erreur synchronisation:', error);
    return Promise.reject(error);
  }
}

// ============================================
// GESTION DU CACHE
// ============================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Ignorer les requêtes Firebase et APIs externes
  if (url.hostname.includes('firebase') || 
      url.hostname.includes('googleapis') ||
      url.hostname.includes('cloudinary') ||
      url.pathname.includes('firebase-messaging-sw.js')) {
    return;
  }
  
  // Stratégie: Network First pour les pages HTML
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Mettre en cache
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match('/index.html');
          });
        })
    );
    return;
  }
  
  // Stratégie: Cache First pour les assets
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          return cachedResponse;
        }
        
        return fetch(request)
          .then(response => {
            // Ne mettre en cache que les réponses réussies
            if (response.ok) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(request, responseClone);
              });
            }
            return response;
          });
      })
  );
});

console.log('✅ Service Worker UNIFIÉ chargé - Version ' + APP_VERSION);

// Fonction pour envoyer des notifications de test
self.testNotification = function(type, title, body) {
  const data = { type: type || 'test', page: 'dashboard' };
  
  return self.registration.showNotification(title || 'Test', {
    body: body || 'Notification de test',
    icon: '/icon-192x192.png',
    badge: '/icon-badge-96x96.png',
    tag: type || 'test',
    data: data,
    requireInteraction: true
  });
};