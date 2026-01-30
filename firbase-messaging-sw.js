// firebase-notifications.js - Gestionnaire Firebase amélioré
class FirebaseNotifications {
  constructor() {
    this.messaging = null;
    this.currentToken = null;
    this.isInitialized = false;
    this.db = null;
    this.listeners = {};
  }
  
  // Initialiser Firebase avec tous les écouteurs
  async initialize(parentMatricule) {
    if (this.isInitialized) return;
    
    console.log('🔥 Initialisation Firebase Notifications complète');
    
    try {
      // Importer Firebase modules
      const { initializeApp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js');
      const { getMessaging, getToken, onMessage, isSupported } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging.js');
      const { getFirestore, collection, onSnapshot, query, where } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      // Configuration
      const firebaseConfig = {
        apiKey: "AIzaSyBn7VIddclO7KtrXb5sibCr9SjVLjOy-qI",
        authDomain: "theo1d.firebaseapp.com",
        projectId: "theo1d",
        storageBucket: "theo1d.firebasestorage.app",
        messagingSenderId: "269629842962",
        appId: "1:269629842962:web:a80a12b04448fe1e595acb",
        measurementId: "G-TNSG1XFMDZ"
      };
      
      // Initialiser l'app
      const app = initializeApp(firebaseConfig);
      this.db = getFirestore(app);
      
      // Vérifier support
      const supported = await isSupported();
      if (!supported) {
        console.warn('⚠️ Firebase Messaging non supporté');
        return;
      }
      
      // Obtenir messaging
      this.messaging = getMessaging(app);
      
      // Demander la permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.warn('❌ Permission refusée');
        return;
      }
      
      // Obtenir le token FCM avec VAPID Key correcte
      const vapidKey = "BM8H6cADaP6tiA4t9Oc9D36jk1UmYoUBV3cATlJ5mvZ_-eQ5xd6HgX5twxWvZ2U2Y98HBkJ8bTph7epPJJYqBpc";
      this.currentToken = await getToken(this.messaging, { vapidKey });
      
      console.log('✅ Token FCM obtenu:', this.currentToken?.substring(0, 30) + '...');
      
      // Sauvegarder le token dans Firestore
      if (parentMatricule && this.currentToken) {
        await updateDoc(doc(this.db, 'parents', parentMatricule), {
          fcmToken: this.currentToken,
          notificationEnabled: true,
          lastTokenUpdate: serverTimestamp()
        });
        console.log('✅ Token sauvegardé pour:', parentMatricule);
      }
      
      // Écouter les messages en premier plan
      onMessage(this.messaging, (payload) => {
        console.log('📨 Message premier plan:', payload);
        this.handleForegroundMessage(payload);
      });
      
      // Configurer TOUS les écouteurs en temps réel
      this.setupAllRealTimeListeners(parentMatricule);
      
      this.isInitialized = true;
      console.log('✅ Firebase Notifications initialisé avec succès');
      
    } catch (error) {
      console.error('❌ Erreur initialisation Firebase:', error);
    }
  }
  
  // Configurer TOUS les écouteurs en temps réel
  async setupAllRealTimeListeners(parentMatricule) {
    if (!window.childrenList || window.childrenList.length === 0) {
      console.log('⚠️ Aucun enfant trouvé pour les écouteurs');
      return;
    }
    
    // 1. Écouter les incidents pour tous les enfants
    this.setupIncidentsListener();
    
    // 2. Écouter les notes pour tous les enfants
    this.setupGradesListener();
    
    // 3. Écouter les devoirs pour tous les enfants
    this.setupHomeworkListener();
    
    // 4. Écouter les communiqués
    this.setupCommuniquesListener(parentMatricule);
    
    // 5. Écouter les présences
    this.setupPresenceListener();
    
    console.log('👂 Tous les écouteurs configurés');
  }
  
  // Écouteur pour les incidents
  async setupIncidentsListener() {
    try {
      const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      for (const child of window.childrenList) {
        const incidentsQuery = query(
          collection(this.db, 'incidents'),
          where('studentMatricule', '==', child.matricule)
        );
        
        this.listeners[`incidents_${child.matricule}`] = onSnapshot(incidentsQuery, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
              const incident = change.doc.data();
              
              // Vérifier si c'est nouveau (moins de 24h)
              const createdAt = incident.createdAt?.toDate() || new Date();
              const now = new Date();
              const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
              
              if (hoursDiff < 24) {
                // Envoyer notification arrière-plan
                await this.sendBackgroundNotification({
                  title: '⚠️ Nouvel incident signalé',
                  body: `${child.fullName}: ${incident.type || 'Incident'}`,
                  data: {
                    type: 'incidents',
                    page: 'presence-incidents',
                    childId: child.matricule,
                    childName: child.fullName,
                    incidentId: change.doc.id,
                    timestamp: new Date().toISOString()
                  }
                });
                
                // Mettre à jour le badge
                this.updateAppBadge(1);
              }
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ Erreur écouteur incidents:', error);
    }
  }
  
  // Écouteur pour les notes
  async setupGradesListener() {
    try {
      const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      for (const child of window.childrenList) {
        if (child.type === 'secondary') {
          // Notes secondaires
          const gradesQuery = query(
            collection(this.db, 'published_grades'),
            where('className', '==', child.class)
          );
          
          this.listeners[`grades_${child.matricule}`] = onSnapshot(gradesQuery, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const gradeData = change.doc.data();
                const studentGrade = gradeData.grades?.find(g => g.studentMatricule === child.matricule);
                
                if (studentGrade) {
                  await this.sendBackgroundNotification({
                    title: '📊 Nouvelle note publiée',
                    body: `${child.fullName}: ${gradeData.subject} - ${gradeData.gradeType}`,
                    data: {
                      type: 'grades',
                      page: 'grades',
                      childId: child.matricule,
                      childName: child.fullName,
                      gradeId: change.doc.id,
                      subject: gradeData.subject,
                      timestamp: new Date().toISOString()
                    }
                  });
                  
                  this.updateAppBadge(1);
                }
              }
            });
          });
        }
      }
    } catch (error) {
      console.error('❌ Erreur écouteur notes:', error);
    }
  }
  
  // Écouteur pour les devoirs
  async setupHomeworkListener() {
    try {
      const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      for (const child of window.childrenList) {
        if (child.type === 'secondary') {
          const homeworkQuery = query(
            collection(this.db, 'homework'),
            where('className', '==', child.class)
          );
          
          this.listeners[`homework_${child.matricule}`] = onSnapshot(homeworkQuery, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const homework = change.doc.data();
                
                // Vérifier si c'est nouveau (moins de 24h)
                const createdAt = homework.createdAt?.toDate() || new Date();
                const now = new Date();
                const hoursDiff = (now - createdAt) / (1000 * 60 * 60);
                
                if (hoursDiff < 24) {
                  await this.sendBackgroundNotification({
                    title: '📚 Nouveau devoir assigné',
                    body: `${child.fullName}: ${homework.subject} - ${homework.title}`,
                    data: {
                      type: 'homework',
                      page: 'homework',
                      childId: child.matricule,
                      childName: child.fullName,
                      homeworkId: change.doc.id,
                      timestamp: new Date().toISOString()
                    }
                  });
                  
                  this.updateAppBadge(1);
                }
              }
            });
          });
        }
      }
    } catch (error) {
      console.error('❌ Erreur écouteur devoirs:', error);
    }
  }
  
  // Écouteur pour les communiqués
  async setupCommuniquesListener(parentMatricule) {
    try {
      const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      const communiquesQuery = query(
        collection(this.db, 'parent_communique_relations'),
        where('parentId', '==', parentMatricule)
      );
      
      this.listeners['communiques'] = onSnapshot(communiquesQuery, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const relation = change.doc.data();
            
            // Récupérer le communiqué
            const { getDoc, doc } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
            const communiqueDoc = await getDoc(doc(this.db, 'parent_communiques', relation.communiqueId));
            
            if (communiqueDoc.exists()) {
              const communiqueData = communiqueDoc.data();
              
              await this.sendBackgroundNotification({
                title: '📄 Nouveau communiqué',
                body: `${communiqueData.feeType} - ${communiqueData.month} ${communiqueData.schoolYear}`,
                data: {
                  type: 'communiques',
                  page: 'communiques',
                  communiqueId: relation.communiqueId,
                  feeType: communiqueData.feeType,
                  amount: communiqueData.amount,
                  timestamp: new Date().toISOString()
                }
              });
              
              this.updateAppBadge(1);
            }
          }
        });
      });
    } catch (error) {
      console.error('❌ Erreur écouteur communiqués:', error);
    }
  }
  
  // Écouteur pour les présences
  async setupPresenceListener() {
    try {
      const { collection, query, where, onSnapshot } = await import('https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js');
      
      for (const child of window.childrenList) {
        const today = new Date().toISOString().split('T')[0];
        const presenceQuery = query(
          collection(this.db, 'student_attendance'),
          where('studentId', '==', child.matricule),
          where('date', '==', today)
        );
        
        this.listeners[`presence_${child.matricule}`] = onSnapshot(presenceQuery, (snapshot) => {
          snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
              const presence = change.doc.data();
              
              if (presence.published === true) {
                let statusText = '';
                if (presence.status === 'absent') statusText = 'est absent';
                else if (presence.status === 'late') statusText = 'est en retard';
                else if (presence.status === 'present') statusText = 'est présent';
                
                if (statusText) {
                  await this.sendBackgroundNotification({
                    title: '📅 Mise à jour présence',
                    body: `${child.fullName} ${statusText} aujourd'hui`,
                    data: {
                      type: 'presence',
                      page: 'presence-incidents',
                      childId: child.matricule,
                      childName: child.fullName,
                      timestamp: new Date().toISOString()
                    }
                  });
                  
                  this.updateAppBadge(1);
                }
              }
            }
          });
        });
      }
    } catch (error) {
      console.error('❌ Erreur écouteur présences:', error);
    }
  }
  
  // Envoyer une notification arrière-plan (via votre backend)
  async sendBackgroundNotification(notificationData) {
    try {
      // Envoyer au Service Worker pour affichage
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'BACKGROUND_NOTIFICATION',
          data: notificationData
        });
      }
      
      // Mettre à jour le compteur local
      this.updateNotificationCount();
      
      // Enregistrer la notification localement
      this.saveLocalNotification(notificationData);
      
    } catch (error) {
      console.error('❌ Erreur envoi notification arrière-plan:', error);
    }
  }
  
  // Mettre à jour le badge de l'application
  async updateAppBadge(countChange = 1) {
    if (!('setAppBadge' in navigator)) {
      console.log('⚠️ Badges non supportés');
      return;
    }
    
    try {
      // Obtenir le compteur actuel
      const currentCount = await this.getBadgeCount();
      const newCount = Math.max(0, currentCount + countChange);
      
      // Mettre à jour le badge
      if (newCount > 0) {
        await navigator.setAppBadge(newCount);
        console.log(`✅ Badge mis à jour: ${newCount}`);
      } else {
        await navigator.clearAppBadge();
        console.log('✅ Badge effacé');
      }
      
      // Sauvegarder le compteur
      localStorage.setItem('app_badge_count', newCount.toString());
      
    } catch (error) {
      console.error('❌ Erreur mise à jour badge:', error);
    }
  }
  
  // Obtenir le compteur de badge
  async getBadgeCount() {
    try {
      const count = localStorage.getItem('app_badge_count');
      return parseInt(count) || 0;
    } catch {
      return 0;
    }
  }
  
  // Mettre à jour le compteur de notifications
  updateNotificationCount() {
    const notificationCount = document.getElementById('notification-count');
    if (!notificationCount) return;
    
    let currentCount = parseInt(notificationCount.textContent) || 0;
    currentCount++;
    notificationCount.textContent = currentCount > 99 ? '99+' : currentCount.toString();
    notificationCount.classList.remove('hidden');
    
    // Ajouter animation
    const bell = document.getElementById('notification-bell');
    if (bell) {
      bell.style.animation = 'pulse 1.5s infinite';
      setTimeout(() => bell.style.animation = '', 3000);
    }
  }
  
  // Sauvegarder la notification localement
  saveLocalNotification(notificationData) {
    try {
      const notifications = JSON.parse(localStorage.getItem('app_notifications') || '[]');
      
      notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...notificationData,
        read: false,
        savedAt: new Date().toISOString()
      });
      
      // Garder seulement les 50 dernières
      if (notifications.length > 50) {
        notifications.splice(50);
      }
      
      localStorage.setItem('app_notifications', JSON.stringify(notifications));
      
    } catch (error) {
      console.error('❌ Erreur sauvegarde notification:', error);
    }
  }
  
  // Gérer les messages premier plan
  handleForegroundMessage(payload) {
    const title = payload.notification?.title || 'CS La Colombe';
    const body = payload.notification?.body || 'Nouvelle notification';
    const data = payload.data || {};
    
    // Afficher notification système
    if (Notification.permission === 'granted' && !document.hidden) {
      const notification = new Notification(title, {
        body: body,
        icon: '/icon-192x192.png',
        badge: '/icon-72x72.png',
        tag: data.type || 'general',
        data: data,
        requireInteraction: true,
        vibrate: [200, 100, 200]
      });
      
      // Gérer le clic
      notification.onclick = () => {
        window.focus();
        notification.close();
        
        // Naviguer vers la bonne page
        if (data.page) {
          const link = document.querySelector(`[data-page="${data.page}"]`);
          if (link) {
            document.querySelectorAll('.nav-menu a, .page').forEach(el => el.classList.remove('active'));
            link.classList.add('active');
            document.getElementById(`${data.page}-page`).classList.add('active');
            document.getElementById('page-title').textContent = link.textContent;
            
            // Sélectionner l'enfant si spécifié
            if (data.childId) {
              setTimeout(() => {
                const selector = document.getElementById(`${data.page}-child-selector`);
                if (selector) {
                  selector.value = data.childId;
                  selector.dispatchEvent(new Event('change'));
                }
              }, 1000);
            }
          }
        }
      };
    }
    
    // Mettre à jour l'interface
    this.updateNotificationCount();
  }
  
  // Tester les notifications
  async testNotification() {
    if (!this.currentToken) {
      console.warn('❌ Token non disponible');
      return;
    }
    
    try {
      // Envoyer une notification de test
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'TEST_BACKGROUND_NOTIFICATION',
          data: {
            title: '✅ Test complet',
            body: 'Notifications arrière-plan et badges fonctionnent !',
            data: {
              type: 'test',
              page: 'dashboard',
              timestamp: new Date().toISOString()
            }
          }
        });
        
        // Mettre à jour le badge
        await this.updateAppBadge(1);
        
        console.log('✅ Test notification envoyé');
      }
      
    } catch (error) {
      console.error('❌ Erreur test notification:', error);
    }
  }
  
  // Obtenir le statut
  getStatus() {
    return {
      initialized: this.isInitialized,
      hasToken: !!this.currentToken,
      permission: Notification.permission,
      badgeSupported: 'setAppBadge' in navigator,
      listenersCount: Object.keys(this.listeners).length
    };
  }
}

// Créer instance unique
const firebaseNotifications = new FirebaseNotifications();

// Initialiser automatiquement
document.addEventListener('DOMContentLoaded', () => {
  if (window.currentParent) {
    setTimeout(() => {
      firebaseNotifications.initialize(window.currentParent.matricule);
    }, 3000);
  }
});

// Exporter
window.firebaseNotifications = firebaseNotifications;