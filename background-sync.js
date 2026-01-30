// background-sync.js - Gestionnaire de synchronisation arrière-plan

class BackgroundSyncManager {
  constructor() {
    this.syncInterval = null;
    this.isSyncing = false;
    this.lastSync = localStorage.getItem('last_background_sync') || 0;
  }
  
  // Initialiser la synchronisation
  async initialize() {
    console.log('🔄 Initialisation synchronisation arrière-plan');
    
    // Vérifier si le Service Worker est prêt
    if (!('serviceWorker' in navigator)) {
      console.log('❌ Service Worker non supporté');
      return;
    }
    
    const registration = await navigator.serviceWorker.ready;
    
    // 1. Enregistrer la synchronisation périodique
    await this.registerPeriodicSync(registration);
    
    // 2. Programmer des vérifications régulières
    this.scheduleRegularChecks();
    
    // 3. Démarrer la première vérification
    setTimeout(() => this.checkForUpdates(), 10000);
    
    console.log('✅ Synchronisation arrière-plan initialisée');
  }
  
  // Enregistrer la synchronisation périodique
  async registerPeriodicSync(registration) {
    if ('periodicSync' in registration) {
      try {
        const status = await navigator.permissions.query({
          name: 'periodic-background-sync'
        });
        
        if (status.state === 'granted') {
          await registration.periodicSync.register('periodic-background-sync', {
            minInterval: 15 * 60 * 1000, // 15 minutes minimum
          });
          console.log('✅ Synchronisation périodique enregistrée');
        }
      } catch (error) {
        console.log('⚠️ Synchronisation périodique non disponible:', error);
      }
    }
  }
  
  // Programmer des vérifications régulières
  scheduleRegularChecks() {
    // Vérifier toutes les 30 minutes
    this.syncInterval = setInterval(() => {
      this.checkForUpdates();
    }, 30 * 60 * 1000);
    
    // Vérifier quand l'app reprend le focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkForUpdates();
      }
    });
    
    // Vérifier quand la connexion revient
    window.addEventListener('online', () => {
      this.checkForUpdates();
    });
  }
  
  // Vérifier les mises à jour
  async checkForUpdates() {
    if (this.isSyncing || !navigator.onLine) {
      return;
    }
    
    this.isSyncing = true;
    
    try {
      console.log('🔍 Vérification des mises à jour...');
      
      // Demander au Service Worker de vérifier
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CHECK_NOW',
          timestamp: Date.now()
        });
      }
      
      // Vérifier les nouvelles données localement
      await this.checkLocalData();
      
      this.lastSync = Date.now();
      localStorage.setItem('last_background_sync', this.lastSync);
      
    } catch (error) {
      console.error('❌ Erreur vérification:', error);
    } finally {
      this.isSyncing = false;
    }
  }
  
  // Vérifier les données locales
  async checkLocalData() {
    // Ici, vous pourriez vérifier IndexedDB ou localStorage
    // pour des notifications locales
    const lastCheck = localStorage.getItem('last_data_check') || 0;
    const now = Date.now();
    
    if (now - lastCheck > 30 * 60 * 1000) { // 30 minutes
      console.log('🔄 Vérification des données locales');
      localStorage.setItem('last_data_check', now.toString());
    }
  }
  
  // Tester les notifications arrière-plan
  async testBackgroundNotification() {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'TEST_BACKGROUND_NOTIFICATION'
      });
      return true;
    }
    return false;
  }
  
  // Sauvegarder les données parent
  async saveParentData(parentData) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'SAVE_PARENT_DATA',
        data: parentData
      });
      
      // Sauvegarder aussi dans IndexedDB
      await this.saveToIndexedDB(parentData);
      
      return true;
    }
    return false;
  }
  
  // Sauvegarder dans IndexedDB
  async saveToIndexedDB(data) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ParentBackgroundData', 1);
      
      request.onupgradeneeded = function(event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('parent')) {
          db.createObjectStore('parent', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('notifications')) {
          const store = db.createObjectStore('notifications', { keyPath: 'id' });
          store.createIndex('timestamp', 'timestamp');
          store.createIndex('read', 'read');
        }
      };
      
      request.onsuccess = function(event) {
        const db = event.target.result;
        const transaction = db.transaction(['parent'], 'readwrite');
        const store = transaction.objectStore('parent');
        
        store.put({
          id: 'current',
          ...data,
          savedAt: new Date().toISOString()
        });
        
        transaction.oncomplete = function() {
          console.log('💾 Données sauvegardées dans IndexedDB');
          resolve();
        };
      };
      
      request.onerror = function(event) {
        console.error('❌ Erreur IndexedDB:', event.target.error);
        reject(event.target.error);
      };
    });
  }
  
  // Récupérer les notifications non lues
  async getUnreadNotifications() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('ParentBackgroundData', 1);
      
      request.onsuccess = function(event) {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains('notifications')) {
          resolve([]);
          return;
        }
        
        const transaction = db.transaction(['notifications'], 'readonly');
        const store = transaction.objectStore('notifications');
        const index = store.index('read');
        
        const unreadRequest = index.getAll(IDBKeyRange.only(false));
        
        unreadRequest.onsuccess = function() {
          resolve(unreadRequest.result || []);
        };
        
        unreadRequest.onerror = function() {
          reject(unreadRequest.error);
        };
      };
      
      request.onerror = function(event) {
        reject(event.target.error);
      };
    });
  }
}

// Exporter l'instance unique
window.backgroundSyncManager = new BackgroundSyncManager();