// firebase-notifications.js - Gestionnaire Firebase optimisé pour notifications temps réel
class FirebaseNotifications {
  constructor() {
    this.messaging = null;
    this.currentToken = null;
    this.isInitialized = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.parentMatricule = null;
  }
  
  // Initialiser Firebase
  async initialize(parentMatricule) {
    if (this.isInitialized) {
      console.log('✅ Firebase déjà initialisé');
      return true;
    }
    
    this.parentMatricule = parentMatricule;
    console.log('🔥 Initialisation Firebase pour parent:', parentMatricule);
    
    try {
      // Vérifier Service Worker
      if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Worker non supporté');
        return false;
      }
      
      // Attendre que le Service Worker soit prêt
      const registration = await navigator.serviceWorker.ready;
      console.log('✅ Service Worker prêt:', registration.scope);
      
      // Vérifier si Firebase est déjà chargé
      if (typeof firebase === 'undefined') {
        await this.loadFirebaseScripts();
      }
      
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
      let app;
      if (firebase.apps.length === 0) {
        app = firebase.initializeApp(firebaseConfig);
      } else {
        app = firebase.app();
      }
      
      // Obtenir Messaging
      this.messaging = firebase.messaging();
      
      // Demander la permission
      await this.requestNotificationPermission();
      
      // Obtenir le token FCM
      await this.getFCMToken(registration);
      
      // Configurer les écouteurs
      this.setupMessageListener();
      this.setupTokenRefreshListener();
      
      this.isInitialized = true;
      this.retryCount = 0;
      
      console.log('✅ Firebase Notifications initialisé avec succès');
      
      // Tester immédiatement
      setTimeout(() => {
        this.sendTestNotification();
      }, 2000);
      
      return true;
      
    } catch (error) {
      console.error('❌ Erreur initialisation Firebase:', error);
      
      // Retry
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        const delay = Math.min(3000 * this.retryCount, 15000);
        console.log(`🔄 Nouvel essai dans ${delay}ms (${this.retryCount}/${this.maxRetries})`);
        
        setTimeout(() => {
          this.initialize(parentMatricule);
        }, delay);
      }
      
      return false;
    }
  }
  
  // Charger les scripts Firebase
  async loadFirebaseScripts() {
    return new Promise((resolve, reject) => {
      const script1 = document.createElement('script');
      script1.src = 'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js';
      script1.onload = () => {
        const script2 = document.createElement('script');
        script2.src = 'https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js';
        script2.onload = resolve;
        script2.onerror = reject;
        document.head.appendChild(script2);
      };
      script1.onerror = reject;
      document.head.appendChild(script1);
    });
  }
  
  // Demander la permission de notification
  async requestNotificationPermission() {
    try {
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        console.log('🔔 Permission notification accordée');
        return true;
      } else {
        console.warn('⚠️ Permission notification refusée:', permission);
        return false;
      }
    } catch (error) {
      console.error('❌ Erreur demande permission:', error);
      return false;
    }
  }
  
  // Obtenir le token FCM
  async getFCMToken(registration) {
    try {
      const vapidKey = "BM8H6cADaP6tiA4t9Oc9D36jk1UmYoUBV3cATlJ5mvZ_-eQ5xd6HgX5twxWvZ2U2Y98HBkJ8bTph7epPJJYqBpc";
      
      this.currentToken = await this.messaging.getToken({
        vapidKey: vapidKey,
        serviceWorkerRegistration: registration
      });
      
      if (this.currentToken) {
        console.log('✅ Token FCM obtenu:', this.currentToken.substring(0, 30) + '...');
        
        // Sauvegarder le token
        await this.saveTokenToServer(this.currentToken);
        await this.saveTokenToLocalStorage(this.currentToken);
        
        return this.currentToken;
      } else {
        console.warn('⚠️ Token FCM vide');
        throw new Error('Token FCM vide');
      }
    } catch (error) {
      console.error('❌ Erreur obtention token FCM:', error);
      throw error;
    }
  }
  
  // Sauvegarder le token sur le serveur
  async saveTokenToServer(token) {
    if (!this.parentMatricule) return;
    
    try {
      // Utiliser l'import dynamique pour Firestore
      const { getFirestore, doc, setDoc, serverTimestamp } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const tokenRef = doc(db, 'fcm_tokens', `${this.parentMatricule}_${Date.now()}`);
      
      await setDoc(tokenRef, {
        parentMatricule: this.parentMatricule,
        token: token,
        deviceInfo: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          timestamp: new Date().toISOString()
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      console.log('✅ Token sauvegardé sur Firestore');
      
      // Mettre aussi à jour le parent
      const parentRef = doc(db, 'parents', this.parentMatricule);
      await setDoc(parentRef, {
        fcmToken: token,
        notificationEnabled: true,
        lastTokenUpdate: serverTimestamp()
      }, { merge: true });
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde token Firestore:', error);
      // Continuer même en cas d'erreur
    }
  }
  
  // Sauvegarder le token localement
  async saveTokenToLocalStorage(token) {
    try {
      const tokens = JSON.parse(localStorage.getItem('fcm_tokens') || '[]');
      tokens.push({
        token: token,
        savedAt: new Date().toISOString(),
        parent: this.parentMatricule
      });
      
      // Garder seulement les 5 derniers tokens
      if (tokens.length > 5) {
        tokens.splice(0, tokens.length - 5);
      }
      
      localStorage.setItem('fcm_tokens', JSON.stringify(tokens));
      localStorage.setItem('last_fcm_token', token);
      
      console.log('✅ Token sauvegardé localement');
    } catch (error) {
      console.error('❌ Erreur sauvegarde locale token:', error);
    }
  }
  
  // Configurer l'écouteur de messages
  setupMessageListener() {
    if (!this.messaging) return;
    
    this.messaging.onMessage((payload) => {
      console.log('📨 Message premier plan:', payload);
      this.handleForegroundMessage(payload);
    });
  }
  
  // Configurer l'écouteur de rafraîchissement token
  setupTokenRefreshListener() {
    if (!this.messaging) return;
    
    this.messaging.onTokenRefresh(async () => {
      console.log('🔄 Rafraîchissement du token FCM');
      try {
        const registration = await navigator.serviceWorker.ready;
        const newToken = await this.getFCMToken(registration);
        
        if (newToken && newToken !== this.currentToken) {
          this.currentToken = newToken;
          console.log('✅ Nouveau token FCM obtenu');
        }
      } catch (error) {
        console.error('❌ Erreur rafraîchissement token:', error);
      }
    });
  }
  
  // Gérer les messages en premier plan
  handleForegroundMessage(payload) {
    const title = payload.notification?.title || 'CS La Colombe';
    const body = payload.notification?.body || 'Nouvelle notification';
    const data = payload.data || {};
    const type = data.type || 'general';
    
    // Créer la notification
    this.createBrowserNotification(title, body, data);
    
    // Mettre à jour le badge
    this.updateBadgeCount(type);
    
    // Ajouter à l'interface
    this.addToNotificationList(title, body, data);
    
    // Jouer un son si nécessaire
    this.playNotificationSound();
  }
  
  // Créer une notification navigateur
  createBrowserNotification(title, body, data) {
    if (Notification.permission !== 'granted') return;
    
    const notification = new Notification(title, {
      body: body,
      icon: '/icon-192x192.png',
      badge: '/icon-badge-96x96.png',
      tag: data.type || 'general',
      data: data,
      requireInteraction: true,
      vibrate: [200, 100, 200]
    });
    
    notification.onclick = (event) => {
      event.preventDefault();
      window.focus();
      notification.close();
      
      // Naviguer vers la page appropriée
      this.navigateToPage(data);
    };
    
    return notification;
  }
  
  // Mettre à jour le badge
  async updateBadgeCount(type) {
    try {
      // Demander au Service Worker de mettre à jour le badge
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'NEW_NOTIFICATION',
          data: { type: type }
        });
      }
      
      // Mettre à jour le badge PWA
      if ('setAppBadge' in navigator) {
        const currentCount = await this.getCurrentBadgeCount();
        await navigator.setAppBadge(currentCount + 1);
      }
      
    } catch (error) {
      console.error('❌ Erreur mise à jour badge:', error);
    }
  }
  
  // Obtenir le compte actuel des badges
  async getCurrentBadgeCount() {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      return new Promise((resolve) => {
        const channel = new MessageChannel();
        
        channel.port1.onmessage = (event) => {
          if (event.data.type === 'BADGE_COUNT') {
            resolve(event.data.count || 0);
          }
        };
        
        navigator.serviceWorker.controller.postMessage({
          type: 'GET_BADGE_COUNT'
        }, [channel.port2]);
      });
    }
    
    return 0;
  }
  
  // Ajouter à la liste des notifications
  addToNotificationList(title, body, data) {
    if (window.notificationManager) {
      window.notificationManager.addNotification({
        type: data.type || 'general',
        title: title,
        body: body,
        data: data,
        timestamp: new Date().toISOString()
      });
    } else {
      // Sauvegarder temporairement
      const pending = JSON.parse(localStorage.getItem('pending_notifications') || '[]');
      pending.push({ title, body, data, timestamp: Date.now() });
      
      if (pending.length > 20) {
        pending.shift();
      }
      
      localStorage.setItem('pending_notifications', JSON.stringify(pending));
    }
  }
  
  // Jouer un son de notification
  playNotificationSound() {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Silencieux si erreur
      });
    } catch (error) {
      // Ignorer les erreurs audio
    }
  }
  
  // Naviguer vers une page
  navigateToPage(data) {
    if (!data || !data.page) return;
    
    // Trouver le lien correspondant
    const link = document.querySelector(`[data-page="${data.page}"]`);
    if (link) {
      link.click();
      
      // Sélectionner l'enfant si spécifié
      if (data.childId) {
        setTimeout(() => {
          const selector = document.querySelector(`#${data.page}-child-selector`);
          if (selector) {
            selector.value = data.childId;
            selector.dispatchEvent(new Event('change'));
          }
        }, 500);
      }
    }
  }
  
  // Envoyer une notification de test
  async sendTestNotification() {
    if (!this.currentToken) {
      console.warn('❌ Token non disponible pour le test');
      return;
    }
    
    console.log('🧪 Envoi notification test...');
    
    try {
      // Notification locale
      if (Notification.permission === 'granted') {
        const testNotification = new Notification('✅ Test Firebase', {
          body: 'Les notifications Firebase fonctionnent correctement !',
          icon: '/icon-192x192.png',
          badge: '/icon-badge-96x96.png',
          tag: 'test',
          data: {
            type: 'test',
            page: 'dashboard',
            test: true
          },
          requireInteraction: true
        });
        
        testNotification.onclick = () => {
          window.focus();
          testNotification.close();
        };
      }
      
      // Tester le Service Worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TEST_BACKGROUND'
        });
      }
      
      console.log('✅ Notification test envoyée');
      
    } catch (error) {
      console.error('❌ Erreur notification test:', error);
    }
  }
  
  // Obtenir le statut
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasToken: !!this.currentToken,
      tokenPreview: this.currentToken ? this.currentToken.substring(0, 20) + '...' : null,
      permission: Notification.permission,
      parentMatricule: this.parentMatricule,
      retryCount: this.retryCount
    };
  }
  
  // Débuguer
  debug() {
    console.group('🔍 Debug Firebase Notifications');
    console.log('Status:', this.getStatus());
    console.log('Service Worker:', 'serviceWorker' in navigator);
    console.log('Notification Permission:', Notification.permission);
    console.log('Current Token:', this.currentToken);
    console.groupEnd();
  }
}

// Créer l'instance unique
const firebaseNotifications = new FirebaseNotifications();

// Initialisation automatique
function autoInitializeFirebase() {
  if (window.currentParent && window.currentParent.matricule) {
    console.log('👤 Parent connecté, initialisation Firebase...');
    
    firebaseNotifications.initialize(window.currentParent.matricule)
      .then(success => {
        if (success) {
          console.log('✅ Firebase auto-initialisé avec succès');
          
          // Vérifier périodiquement
          setInterval(() => {
            const status = firebaseNotifications.getStatus();
            if (!status.initialized && window.currentParent) {
              console.log('🔄 Re-tentative Firebase...');
              firebaseNotifications.initialize(window.currentParent.matricule);
            }
          }, 300000); // Toutes les 5 minutes
        }
      });
  } else {
    console.log('⏳ Attente connexion parent pour Firebase...');
    
    // Vérifier périodiquement si un parent se connecte
    const checkInterval = setInterval(() => {
      if (window.currentParent && window.currentParent.matricule) {
        clearInterval(checkInterval);
        console.log('👤 Parent maintenant connecté, initialisation Firebase...');
        firebaseNotifications.initialize(window.currentParent.matricule);
      }
    }, 3000);
  }
}

// Démarrer au chargement
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(autoInitializeFirebase, 2000);
});

// Exporter pour usage global
window.firebaseNotifications = firebaseNotifications;
window.firebaseDebug = () => firebaseNotifications.debug();

console.log('✅ Firebase Notifications module chargé');