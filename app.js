/**
 * Login & Logout Tracker — Main Application
 *
 * Features:
 * - Real-time log sync via Firebase Firestore
 * - Philippine Standard Time (Asia/Manila) formatting
 * - Search, filter, CSV export, dark mode
 */

(function () {
  'use strict';

  // ---- Constants ----
  const TIMEZONE = 'Asia/Manila';
  const COLLECTION = 'attendance_logs';

  // ---- State ----
  let db = null;
  let allLogs = [];
  let currentFilter = 'ALL';
  let searchQuery = '';
  let unsubscribe = null;

  // ---- DOM Elements ----
  const elements = {
    logForm: document.getElementById('logForm'),
    logOutBtn: document.getElementById('logOutBtn'),
    fullName: document.getElementById('fullName'),
    section: document.getElementById('section'),
    formMessage: document.getElementById('formMessage'),
    totalLogIns: document.getElementById('totalLogIns'),
    totalLogOuts: document.getElementById('totalLogOuts'),
    activeUsers: document.getElementById('activeUsers'),
    activeUsersList: document.getElementById('activeUsersList'),
    logTableBody: document.getElementById('logTableBody'),
    tableFooter: document.getElementById('tableFooter'),
    searchInput: document.getElementById('searchInput'),
    filterTabs: document.querySelectorAll('.filter-tab'),
    exportCsvBtn: document.getElementById('exportCsvBtn'),
    themeToggle: document.getElementById('themeToggle'),
    connectionStatus: document.getElementById('connectionStatus'),
    setupNotice: document.getElementById('setupNotice'),
    toast: document.getElementById('toast'),
  };

  // ---- Philippine Time Formatting ----
  /**
   * Format a Date or Firestore Timestamp into separate date and time strings (PST).
   * @param {Date|object} timestamp
   * @returns {{ date: string, time: string, full: string, raw: Date }}
   */
  function formatPhilippineTime(timestamp) {
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);

    const dateStr = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);

    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);

    const fullStr = new Intl.DateTimeFormat('en-US', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);

    return { date: dateStr, time: timeStr, full: fullStr, raw: date };
  }

  // ---- Theme ----
  function initTheme() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
  }

  // ---- Toast Notifications ----
  let toastTimeout = null;

  function showToast(message, type = 'default') {
    elements.toast.textContent = message;
    elements.toast.className = 'toast';
    if (type !== 'default') {
      elements.toast.classList.add(`toast--${type}`);
    }
    elements.toast.classList.add('toast--visible');

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      elements.toast.classList.remove('toast--visible');
    }, 3000);
  }

  // ---- Connection Status ----
  function setConnectionStatus(status, text) {
    elements.connectionStatus.className = 'connection-status';
    if (status === 'connected') {
      elements.connectionStatus.classList.add('connection-status--connected');
    } else if (status === 'error') {
      elements.connectionStatus.classList.add('connection-status--error');
    }
    elements.connectionStatus.querySelector('.connection-status__text').textContent = text;
  }

  // ---- Firebase Init ----
  function initFirebase() {
    if (!isFirebaseConfigured()) {
      elements.setupNotice.hidden = false;
      setConnectionStatus('error', 'Not configured');
      renderEmptyState('Configure Firebase to start tracking');
      return false;
    }

    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      setConnectionStatus('connected', 'Live');
      return true;
    } catch (error) {
      console.error('Firebase init error:', error);
      setConnectionStatus('error', 'Connection failed');
      showToast('Failed to connect to Firebase', 'error');
      return false;
    }
  }

  // ---- Firestore Operations ----
  /**
   * Add a new log entry to Firestore.
   * @param {string} fullName
   * @param {string} section
   * @param {'IN'|'OUT'} actionType
   */
  async function addLogEntry(fullName, section, actionType) {
    if (!db) throw new Error('Database not connected');

    const now = new Date();
    const formatted = formatPhilippineTime(now);

    await db.collection(COLLECTION).add({
      fullName: fullName.trim(),
      section: section.trim(),
      actionType,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      // Store client-side PST strings for reliable CSV export and display fallback
      dateDisplay: formatted.date,
      timeDisplay: formatted.time,
      createdAt: now.toISOString(),
    });
  }

  /**
   * Subscribe to real-time log updates from Firestore.
   */
  function subscribeToLogs() {
    if (!db) return;

    unsubscribe = db.collection(COLLECTION)
      .orderBy('timestamp', 'desc')
      .limit(500)
      .onSnapshot(
        (snapshot) => {
          const previousIds = new Set(allLogs.map((l) => l.id));
          allLogs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
            isNew: !previousIds.has(doc.id) && previousIds.size > 0,
          }));
          renderAll();
          setConnectionStatus('connected', 'Live');
        },
        (error) => {
          console.error('Snapshot error:', error);
          setConnectionStatus('error', 'Sync error');
          showToast('Failed to sync data', 'error');
        }
      );
  }

  // ---- Stats & Active Users ----
  function computeStats(logs) {
    let logIns = 0;
    let logOuts = 0;

    logs.forEach((log) => {
      if (log.actionType === 'IN') logIns++;
      else if (log.actionType === 'OUT') logOuts++;
    });

    return { logIns, logOuts };
  }

  /**
   * Determine currently logged-in users based on their latest action.
   * A user is identified by fullName + section combination.
   */
  function getActiveUsers(logs) {
    const userMap = new Map();

    // Process logs oldest-first to find latest action per user
    const sorted = [...logs].sort((a, b) => {
      const timeA = a.timestamp?.toDate?.() || new Date(a.createdAt || 0);
      const timeB = b.timestamp?.toDate?.() || new Date(b.createdAt || 0);
      return timeA - timeB;
    });

    sorted.forEach((log) => {
      const key = `${log.fullName}|${log.section}`;
      userMap.set(key, log);
    });

    const active = [];
    userMap.forEach((log) => {
      if (log.actionType === 'IN') {
        active.push(log);
      }
    });

    // Sort by most recent log-in
    active.sort((a, b) => {
      const timeA = a.timestamp?.toDate?.() || new Date(a.createdAt || 0);
      const timeB = b.timestamp?.toDate?.() || new Date(b.createdAt || 0);
      return timeB - timeA;
    });

    return active;
  }

  // ---- Filtering ----
  function getFilteredLogs() {
    return allLogs.filter((log) => {
      const matchesFilter =
        currentFilter === 'ALL' || log.actionType === currentFilter;

      const query = searchQuery.toLowerCase();
      const matchesSearch =
        !query ||
        log.fullName.toLowerCase().includes(query) ||
        log.section.toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }

  // ---- Rendering ----
  function animateValue(element) {
    element.classList.remove('updated');
    void element.offsetWidth; // Trigger reflow
    element.classList.add('updated');
  }

  function renderStats() {
    const { logIns, logOuts } = computeStats(allLogs);
    const active = getActiveUsers(allLogs);

    if (elements.totalLogIns.textContent !== String(logIns)) {
      elements.totalLogIns.textContent = logIns;
      animateValue(elements.totalLogIns);
    }
    if (elements.totalLogOuts.textContent !== String(logOuts)) {
      elements.totalLogOuts.textContent = logOuts;
      animateValue(elements.totalLogOuts);
    }
    if (elements.activeUsers.textContent !== String(active.length)) {
      elements.activeUsers.textContent = active.length;
      animateValue(elements.activeUsers);
    }
  }

  function renderActiveUsers() {
    const active = getActiveUsers(allLogs);

    if (active.length === 0) {
      elements.activeUsersList.innerHTML =
        '<p class="empty-state">No users currently logged in</p>';
      return;
    }

    elements.activeUsersList.innerHTML = active
      .map((log) => {
        const formatted = log.timestamp
          ? formatPhilippineTime(log.timestamp)
          : { time: log.timeDisplay || '—', full: log.dateDisplay || '—' };
        const initials = log.fullName
          .split(' ')
          .map((n) => n[0])
          .join('')
          .substring(0, 2)
          .toUpperCase();

        return `
          <div class="active-user-item">
            <div class="active-user-item__avatar">${escapeHtml(initials)}</div>
            <div class="active-user-item__info">
              <div class="active-user-item__name">${escapeHtml(log.fullName)}</div>
              <div class="active-user-item__section">${escapeHtml(log.section)}</div>
            </div>
            <div class="active-user-item__time">${escapeHtml(formatted.time)}</div>
          </div>
        `;
      })
      .join('');
  }

  function renderTable() {
    const filtered = getFilteredLogs();

    if (filtered.length === 0) {
      elements.logTableBody.innerHTML = `
        <tr>
          <td colspan="5" class="empty-state">No records found</td>
        </tr>
      `;
      elements.tableFooter.textContent = 'Showing 0 records';
      return;
    }

    elements.logTableBody.innerHTML = filtered
      .map((log) => {
        const formatted = log.timestamp
          ? formatPhilippineTime(log.timestamp)
          : { date: log.dateDisplay || '—', time: log.timeDisplay || '—' };

        const badgeClass = log.actionType === 'IN' ? 'badge--in' : 'badge--out';
        const actionLabel = log.actionType === 'IN' ? 'Log In' : 'Log Out';
        const rowClass = log.isNew ? 'new-row' : '';

        return `
          <tr class="${rowClass}">
            <td>${escapeHtml(log.fullName)}</td>
            <td>${escapeHtml(log.section)}</td>
            <td><span class="badge ${badgeClass}">${actionLabel}</span></td>
            <td>${escapeHtml(formatted.date)}</td>
            <td>${escapeHtml(formatted.time)}</td>
          </tr>
        `;
      })
      .join('');

    const total = allLogs.length;
    const showing = filtered.length;
    elements.tableFooter.textContent =
      showing === total
        ? `Showing all ${total} records`
        : `Showing ${showing} of ${total} records`;
  }

  function renderEmptyState(message) {
    elements.logTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="empty-state">${escapeHtml(message)}</td>
      </tr>
    `;
    elements.tableFooter.textContent = '';
  }

  function renderAll() {
    renderStats();
    renderActiveUsers();
    renderTable();
  }

  // ---- HTML Escaping ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---- Form Handling ----
  function showFormMessage(message, type) {
    elements.formMessage.textContent = message;
    elements.formMessage.className = `form-message form-message--${type}`;
    elements.formMessage.hidden = false;

    setTimeout(() => {
      elements.formMessage.hidden = true;
    }, 4000);
  }

  async function handleLogAction(actionType) {
    const fullName = elements.fullName.value.trim();
    const section = elements.section.value.trim();

    if (!fullName || !section) {
      showFormMessage('Please enter both Full Name and Section.', 'error');
      return;
    }

    const submitBtns = elements.logForm.querySelectorAll('button');
    submitBtns.forEach((btn) => (btn.disabled = true));

    try {
      await addLogEntry(fullName, section, actionType);
      const actionLabel = actionType === 'IN' ? 'logged in' : 'logged out';
      showFormMessage(`${fullName} successfully ${actionLabel}!`, 'success');
      showToast(`${fullName} ${actionLabel}`, 'success');
    } catch (error) {
      console.error('Log action error:', error);
      showFormMessage('Failed to record action. Please try again.', 'error');
      showToast('Failed to record action', 'error');
    } finally {
      submitBtns.forEach((btn) => (btn.disabled = false));
    }
  }

  // ---- CSV Export ----
  function exportToCsv() {
    const filtered = getFilteredLogs();

    if (filtered.length === 0) {
      showToast('No records to export', 'error');
      return;
    }

    const headers = ['Name', 'Section', 'Action Type', 'Date', 'Time'];
    const rows = filtered.map((log) => {
      const formatted = log.timestamp
        ? formatPhilippineTime(log.timestamp)
        : { date: log.dateDisplay || '', time: log.timeDisplay || '' };

      return [
        log.fullName,
        log.section,
        log.actionType,
        formatted.date,
        formatted.time,
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      )
      .join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    const now = formatPhilippineTime(new Date());
    const filename = `attendance_logs_${now.date.replace(/, /g, '_').replace(/ /g, '_')}.csv`;

    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    showToast(`Exported ${filtered.length} records`, 'success');
  }

  // ---- Event Listeners ----
  function bindEvents() {
    // Log In form submit
    elements.logForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLogAction('IN');
    });

    // Log Out button
    elements.logOutBtn.addEventListener('click', () => {
      handleLogAction('OUT');
    });

    // Search
    elements.searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      renderTable();
    });

    // Filter tabs
    elements.filterTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        elements.filterTabs.forEach((t) => {
          t.classList.remove('filter-tab--active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('filter-tab--active');
        tab.setAttribute('aria-selected', 'true');
        currentFilter = tab.dataset.filter;
        renderTable();
      });
    });

    // CSV Export
    elements.exportCsvBtn.addEventListener('click', exportToCsv);

    // Dark mode toggle
    elements.themeToggle.addEventListener('click', toggleTheme);
  }

  // ---- Initialize ----
  function init() {
    initTheme();
    bindEvents();

    if (initFirebase()) {
      subscribeToLogs();
    }
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
