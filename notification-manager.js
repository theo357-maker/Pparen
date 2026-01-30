// notification-manager.js - Gestionnaire centralisé des notifications
class NotificationManager {
  constructor() {
    this.notifications = [];
    this.unreadCount = 0;
    this.isInitialized = false;
    this.realTimeListeners = {};
    this.notificationCallbacks = [];
    this.lastCheckTimes = {};
    this.networkStatus = navigator.onLine;
  }
  
  // Initialiser le gestionnaire
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Déjà initialisé');
      return;
    }
    
    console.log('🔔 Initialisation Notification Manager');
    
    // Charger les notifications sauvegardées
    this.loadSavedNotifications();
    
    // Configurer l'écouteur réseau
    this.setupNetworkListeners();
    
    // Initialiser Firebase si parent connecté
    if (window.currentParent && window.firebaseNotifications) {
      await window.firebaseNotifications.initialize(window.currentParent.matricule);
    }
    
    // Configurer TOUS les écouteurs Firestore
    this.setupAllFirestoreListeners();
    
    // Configurer l'écouteur Service Worker
    this.setupServiceWorkerListener();
    
    // Démarrer les vérifications périodiques
    this.startPeriodicChecks();
    
    this.isInitialized = true;
    console.log('✅ Notification Manager initialisé');
  }
  
  // Configurer les écouteurs réseau
  setupNetworkListeners() {
    window.addEventListener('online', () => {
      console.log('🌐 Connexion rétablie');
      this.networkStatus = true;
      this.syncPendingNotifications();
      this.checkAllUpdates();
    });
    
    window.addEventListener('offline', () => {
      console.log('📴 Hors ligne');
      this.networkStatus = false;
    });
  }
  
  // Configurer l'écouteur Service Worker
  setupServiceWorkerListener() {
    if (!('serviceWorker' in navigator)) return;
    
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, data } = event.data || {};
      
      switch (type) {
        case 'BADGE_UPDATED':
          this.updateBadgeDisplay(data.count);
          break;
          
        case 'NOTIFICATION_CLICKED':
          this.handleNotificationClick(data);
          break;
          
        case 'SW_ACTIVATED':
          console.log('✅ Service Worker activé:', data.version);
          break;
      }
    });
  }
  
  // Configurer TOUS les écouteurs Firestore
  async setupAllFirestoreListeners() {
    if (!window.currentParent || !window.childrenList) {
      console.log('⏳ Attente données parent...');
      setTimeout(() => this.setupAllFirestoreListeners(), 3000);
      return;
    }
    
    console.log('👂 Configuration de tous les écouteurs Firestore');
    
    // Écouteurs pour chaque enfant
    for (const child of window.childrenList) {
      // Notes
      await this.setupGradesListener(child);
      
      // Incidents
      await this.setupIncidentsListener(child);
      
      // Devoirs
      await this.setupHomeworkListener(child);
      
      // Présences
      await this.setupPresenceListener(child);
    }
    
    // Communiqués (pour le parent)
    await this.setupCommuniquesListener();
    
    // Horaires
    await this.setupTimetableListener();
    
    console.log(`✅ ${Object.keys(this.realTimeListeners).length} écouteurs configurés`);
  }
  
  // Écouteur pour les notes
  async setupGradesListener(child) {
    if (child.type !== 'secondary') return;
    
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const gradesQuery = query(
        collection(db, 'published_grades'),
        where('className', '==', child.class)
      );
      
      const unsubscribe = onSnapshot(gradesQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const gradeData = change.doc.data();
            const hasStudentGrade = gradeData.grades?.some(g => 
              g.studentMatricule === child.matricule
            );
            
            if (hasStudentGrade) {
              this.createNotification({
                type: 'grades',
                title: '📊 Nouvelles notes',
                body: `${child.fullName} a des nouvelles notes en ${gradeData.subject}`,
                data: {
                  page: 'grades',
                  childId: child.matricule,
                  childName: child.fullName,
                  gradeId: change.doc.id,
                  period: gradeData.period || 'P1'
                }
              });
            }
          }
        });
      });
      
      this.realTimeListeners[`grades_${child.matricule}`] = unsubscribe;
      
    } catch (error) {
      console.error(`❌ Erreur écouteur notes ${child.fullName}:`, error);
    }
  }
  
  // Écouteur pour les incidents
  async setupIncidentsListener(child) {
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const incidentsQuery = query(
        collection(db, 'incidents'),
        where('studentMatricule', '==', child.matricule)
      );
      
      const unsubscribe = onSnapshot(incidentsQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const incident = change.doc.data();
            
            this.createNotification({
              type: 'incidents',
              title: '⚠️ Nouvel incident',
              body: `${child.fullName}: ${incident.type || 'Incident signalé'}`,
              data: {
                page: 'presence-incidents',
                childId: child.matricule,
                childName: child.fullName,
                incidentId: change.doc.id,
                severity: incident.severity
              }
            });
          }
        });
      });
      
      this.realTimeListeners[`incidents_${child.matricule}`] = unsubscribe;
      
    } catch (error) {
      console.error(`❌ Erreur écouteur incidents ${child.fullName}:`, error);
    }
  }
  
  // Écouteur pour les devoirs
  async setupHomeworkListener(child) {
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const homeworkQuery = query(
        collection(db, 'homework'),
        where('className', '==', child.class)
      );
      
      const unsubscribe = onSnapshot(homeworkQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const homework = change.doc.data();
            
            this.createNotification({
              type: 'homework',
              title: '📚 Nouveau devoir',
              body: `${child.fullName}: ${homework.subject} - ${homework.title}`,
              data: {
                page: 'homework',
                childId: child.matricule,
                childName: child.fullName,
                homeworkId: change.doc.id,
                dueDate: homework.dueDate
              }
            });
          }
        });
      });
      
      this.realTimeListeners[`homework_${child.matricule}`] = unsubscribe;
      
    } catch (error) {
      console.error(`❌ Erreur écouteur devoirs ${child.fullName}:`, error);
    }
  }
  
  // Écouteur pour les présences
  async setupPresenceListener(child) {
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const today = new Date().toISOString().split('T')[0];
      const presenceQuery = query(
        collection(db, 'student_attendance'),
        where('studentId', '==', child.matricule),
        where('date', '==', today)
      );
      
      const unsubscribe = onSnapshot(presenceQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' || change.type === 'modified') {
            const presence = change.doc.data();
            
            if (presence.published) {
              let statusText = '';
              if (presence.status === 'absent') statusText = 'est absent';
              else if (presence.status === 'late') statusText = 'est en retard';
              else if (presence.status === 'present') statusText = 'est présent';
              
              if (statusText) {
                this.createNotification({
                  type: 'presence',
                  title: '📅 Mise à jour présence',
                  body: `${child.fullName} ${statusText} aujourd'hui`,
                  data: {
                    page: 'presence-incidents',
                    childId: child.matricule,
                    childName: child.fullName,
                    status: presence.status
                  }
                });
              }
            }
          }
        });
      });
      
      this.realTimeListeners[`presence_${child.matricule}`] = unsubscribe;
      
    } catch (error) {
      console.error(`❌ Erreur écouteur présences ${child.fullName}:`, error);
    }
  }
  
  // Écouteur pour les communiqués
  async setupCommuniquesListener() {
    if (!window.currentParent) return;
    
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      const communiquesQuery = query(
        collection(db, 'parent_communique_relations'),
        where('parentId', '==', window.currentParent.matricule)
      );
      
      const unsubscribe = onSnapshot(communiquesQuery, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const communique = change.doc.data();
            
            this.createNotification({
              type: 'communiques',
              title: '📄 Nouveau communiqué',
              body: 'Nouveau communiqué de paiement disponible',
              data: {
                page: 'communiques',
                communiqueId: communique.communiqueId,
                urgent: communique.urgent || false
              }
            });
          }
        });
      });
      
      this.realTimeListeners['communiques'] = unsubscribe;
      
    } catch (error) {
      console.error('❌ Erreur écouteur communiqués:', error);
    }
  }
  
  // Écouteur pour les horaires
  async setupTimetableListener() {
    if (!window.childrenList) return;
    
    try {
      const { getFirestore, collection, onSnapshot, query, where } = await import(
        'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js'
      );
      
      const db = getFirestore();
      
      // Pour chaque enfant
      for (const child of window.childrenList) {
        const timetableQuery = query(
          collection(db, 'student_schedules'),
          where('studentMatricule', '==', child.matricule)
        );
        
        const unsubscribe = onSnapshot(timetableQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added') {
              const timetable = change.doc.data();
              
              this.createNotification({
                type: 'timetable',
                title: '⏰ Nouvel horaire',
                body: `Nouvel horaire publié pour ${child.fullName}`,
                data: {
                  page: 'timetable',
                  childId: child.matricule,
                  childName: child.fullName,
                  month: timetable.month,
                  week: timetable.week
                }
              });
            }
          });
        });
        
        this.realTimeListeners[`timetable_${child.matricule}`] = unsubscribe;
      }
      
    } catch (error) {
      console.error('❌ Erreur écouteur horaires:', error);
    }
  }
  
  // Créer une notification
  async createNotification(notificationData) {
    if (!this.networkStatus) {
      console.log('📴 Hors ligne - Notification mise en attente');
      this.storeOfflineNotification(notificationData);
      return;
    }
    
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: notificationData.type,
      title: notificationData.title,
      body: notificationData.body,
      data: notificationData.data || {},
      timestamp: new Date().toISOString(),
      read: false
    };
    
    // Ajouter à la liste
    this.addNotification(notification);
    
    // Envoyer au Service Worker pour badge
    this.sendToServiceWorker(notification);
    
    // Appeler les callbacks
    this.notificationCallbacks.forEach(callback => {
      callback(notification);
    });
    
    console.log(`📝 Notification créée: ${notification.type}`);
  }
  
  // Ajouter une notification
  addNotification(notification) {
    this.notifications.unshift(notification);
    
    if (!notification.read) {
      this.unreadCount++;
    }
    
    // Sauvegarder
    this.saveNotifications();
    
    // Mettre à jour l'affichage
    this.updateBadgeDisplay(this.unreadCount);
    this.updatePageBadge();
  }
  
  // Envoyer au Service Worker
  sendToServiceWorker(notification) {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return;
    }
    
    navigator.serviceWorker.controller.postMessage({
      type: 'NEW_NOTIFICATION',
      data: {
        type: notification.type,
        title: notification.title,
        body: notification.body,
        data: notification.data
      }
    });
  }
  
  // Mettre à jour l'affichage du badge
  updateBadgeDisplay(count) {
    // Badge dans le header
    const headerBadge = document.getElementById('notification-count');
    if (headerBadge) {
      if (count > 0) {
        headerBadge.textContent = count > 99 ? '99+' : count.toString();
        headerBadge.classList.remove('hidden');
      } else {
        headerBadge.classList.add('hidden');
      }
    }
    
    // Badge PWA
    this.updatePWAAppBadge(count);
    
    // Badge visible
    this.updateVisibleBadge(count);
    
    // Mettre à jour le titre
    this.updateDocumentTitle(count);
  }
  
  // Mettre à jour le badge PWA
  async updatePWAAppBadge(count) {
    if (!('setAppBadge' in navigator)) return;
    
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
      } else {
        await navigator.clearAppBadge();
      }
    } catch (error) {
      console.error('❌ Erreur badge PWA:', error);
    }
  }
  
  // Mettre à jour le badge visible
  updateVisibleBadge(count) {
    let badge = document.getElementById('app-visible-badge');
    
    if (!badge && count > 0) {
      badge = this.createVisibleBadge();
    }
    
    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count.toString();
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }
  }
  
  // Créer le badge visible
  createVisibleBadge() {
    const badge = document.createElement('div');
    badge.id = 'app-visible-badge';
    badge.className = 'app-visible-badge';
    badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #e74c3c;
      color: white;
      border-radius: 50%;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
      z-index: 99999;
      animation: pulse 1.5s infinite;
    `;
    
    document.body.appendChild(badge);
    return badge;
  }
  
  // Mettre à jour le titre du document
  updateDocumentTitle(count) {
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    document.title = count > 0 ? `(${count}) ${baseTitle}` : baseTitle;
  }
  
  // Mettre à jour le badge dans la page
  updatePageBadge() {
    // Mettre à jour les badges dans le menu
    const menuItems = document.querySelectorAll('.nav-menu a');
    menuItems.forEach(item => {
      const page = item.dataset.page;
      const count = this.getUnreadCountByPage(page);
      
      // Supprimer l'ancien badge
      const oldBadge = item.querySelector('.menu-badge');
      if (oldBadge) oldBadge.remove();
      
      // Ajouter un nouveau badge si nécessaire
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'menu-badge';
        badge.textContent = count > 9 ? '9+' : count.toString();
        badge.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          background: #e74c3c;
          color: white;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        item.style.position = 'relative';
        item.appendChild(badge);
      }
    });
  }
  
  // Obtenir le compte de non-lus par page
  getUnreadCountByPage(page) {
    if (page === 'notifications') {
      return this.unreadCount;
    }
    
    return this.notifications.filter(n => 
      !n.read && n.data.page === page
    ).length;
  }
  
  // Gérer le clic sur notification
  handleNotificationClick(data) {
    if (data.data?.page) {
      const link = document.querySelector(`[data-page="${data.data.page}"]`);
      if (link) {
        link.click();
        
        // Marquer comme lu
        if (data.data.childId) {
          this.markNotificationsAsRead(data.data.page, data.data.childId);
        }
      }
    }
  }
  
  // Marquer comme lu
  markAsRead(notificationId) {
    const notification = this.notifications.find(n => n.id === notificationId);
    
    if (notification && !notification.read) {
      notification.read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
      this.saveNotifications();
      this.updateBadgeDisplay(this.unreadCount);
      return true;
    }
    
    return false;
  }
  
  // Marquer toutes comme lues
  markAllAsRead() {
    this.notifications.forEach(notification => {
      notification.read = true;
    });
    
    this.unreadCount = 0;
    this.saveNotifications();
    this.updateBadgeDisplay(0);
    
    // Informer le Service Worker
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'MARK_ALL_READ'
      });
    }
  }
  
  // Marquer les notifications d'une page comme lues
  markNotificationsAsRead(page, childId = null) {
    let marked = 0;
    
    this.notifications.forEach(notification => {
      if (!notification.read && notification.data.page === page) {
        if (!childId || notification.data.childId === childId) {
          notification.read = true;
          marked++;
        }
      }
    });
    
    if (marked > 0) {
      this.unreadCount = Math.max(0, this.unreadCount - marked);
      this.saveNotifications();
      this.updateBadgeDisplay(this.unreadCount);
    }
  }
  
  // Charger les notifications sauvegardées
  loadSavedNotifications() {
    try {
      const saved = localStorage.getItem('app_notifications');
      if (saved) {
        this.notifications = JSON.parse(saved);
        this.unreadCount = this.notifications.filter(n => !n.read).length;
        console.log(`📂 ${this.notifications.length} notifications chargées (${this.unreadCount} non lues)`);
      }
    } catch (error) {
      console.error('❌ Erreur chargement notifications:', error);
      this.notifications = [];
    }
  }
  
  // Sauvegarder les notifications
  saveNotifications() {
    try {
      // Garder seulement les 200 dernières notifications
      if (this.notifications.length > 200) {
        this.notifications = this.notifications.slice(0, 200);
      }
      
      localStorage.setItem('app_notifications', JSON.stringify(this.notifications));
    } catch (error) {
      console.error('❌ Erreur sauvegarde notifications:', error);
    }
  }
  
  // Stocker les notifications hors ligne
  storeOfflineNotification(notificationData) {
    try {
      const pending = JSON.parse(localStorage.getItem('offline_notifications') || '[]');
      pending.push({
        ...notificationData,
        storedAt: Date.now()
      });
      
      if (pending.length > 50) {
        pending.shift();
      }
      
      localStorage.setItem('offline_notifications', JSON.stringify(pending));
      console.log('💾 Notification stockée hors ligne');
    } catch (error) {
      console.error('❌ Erreur stockage hors ligne:', error);
    }
  }
  
  // Synchroniser les notifications en attente
  syncPendingNotifications() {
    try {
      const pending = JSON.parse(localStorage.getItem('offline_notifications') || '[]');
      
      if (pending.length > 0) {
        console.log(`📤 Synchronisation de ${pending.length} notification(s) en attente`);
        
        pending.forEach(notificationData => {
          this.createNotification(notificationData);
        });
        
        localStorage.removeItem('offline_notifications');
      }
    } catch (error) {
      console.error('❌ Erreur synchronisation:', error);
    }
  }
  
  // Démarrer les vérifications périodiques
  startPeriodicChecks() {
    // Toutes les 5 minutes
    setInterval(() => {
      if (this.networkStatus) {
        this.checkAllUpdates();
      }
    }, 5 * 60 * 1000);
    
    // Quand l'app reprend le focus
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.networkStatus) {
        this.checkAllUpdates();
      }
    });
    
    // Première vérification
    setTimeout(() => this.checkAllUpdates(), 15000);
  }
  
  // Vérifier toutes les mises à jour
  async checkAllUpdates() {
    if (!this.networkStatus) return;
    
    console.log('🔍 Vérification des mises à jour');
    
    try {
      // Ici, vous pouvez ajouter des vérifications spécifiques
      // Par exemple, vérifier les nouvelles notes depuis la dernière fois
      
      this.lastCheckTimes.all = Date.now();
      
    } catch (error) {
      console.error('❌ Erreur vérification mises à jour:', error);
    }
  }
  
  // S'abonner aux nouvelles notifications
  subscribe(callback) {
    this.notificationCallbacks.push(callback);
    
    // Retourner une fonction de désabonnement
    return () => {
      const index = this.notificationCallbacks.indexOf(callback);
      if (index > -1) {
        this.notificationCallbacks.splice(index, 1);
      }
    };
  }
  
  // Obtenir les notifications filtrées
  getNotifications(filter = 'all') {
    if (filter === 'all') {
      return this.notifications;
    }
    
    return this.notifications.filter(n => n.type === filter);
  }
  
  // Tester le système
  test() {
    console.log('🧪 Test système notifications');
    
    const testNotifications = [
      {
        type: 'grades',
        title: '📊 Test: Nouvelles notes',
        body: 'Ceci est un test de notification de notes',
        data: { page: 'grades', childId: 'TEST123' }
      },
      {
        type: 'incidents',
        title: '⚠️ Test: Incident',
        body: 'Ceci est un test de notification d\'incident',
        data: { page: 'presence-incidents' }
      },
      {
        type: 'homework',
        title: '📚 Test: Devoir',
        body: 'Ceci est un test de notification de devoir',
        data: { page: 'homework' }
      }
    ];
    
    testNotifications.forEach((notification, index) => {
      setTimeout(() => {
        this.createNotification(notification);
      }, index * 1000);
    });
    
    return true;
  }
  
  // Obtenir le statut
  getStatus() {
    return {
      initialized: this.isInitialized,
      notificationsCount: this.notifications.length,
      unreadCount: this.unreadCount,
      networkStatus: this.networkStatus,
      realTimeListeners: Object.keys(this.realTimeListeners).length,
      callbacks: this.notificationCallbacks.length
    };
  }
}

// Créer l'instance unique
const notificationManager = new NotificationManager();

// Initialiser automatiquement
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (window.currentParent) {
      notificationManager.initialize();
    } else {
      // Attendre la connexion
      const waitForParent = setInterval(() => {
        if (window.currentParent) {
          clearInterval(waitForParent);
          notificationManager.initialize();
        }
      }, 1000);
    }
  }, 3000);
});

// Exporter pour usage global
window.notificationManager = notificationManager;
window.testNotifications = () => notificationManager.test();

console.log('✅ Notification Manager chargé');