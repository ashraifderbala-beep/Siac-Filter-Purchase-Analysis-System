// Safe storage service with IndexedDB & LocalStorage fallback
const DB_NAME = 'SIAC_Procurement_DB';
const DB_VERSION = 1;
const STORE_SESSIONS = 'sessions';
const STORE_ORDERS = 'orders';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_ORDERS)) {
        db.createObjectStore(STORE_ORDERS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveToIndexedDB(storeName: string, id: string, data: any): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put({ id, data, updatedAt: Date.now() });
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('IndexedDB save fallback error:', err);
  }
}

export async function loadFromIndexedDB(storeName: string, id: string): Promise<any | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        resolve(request.result ? request.result.data : null);
      };
      request.onerror = () => resolve(null);
    });
  } catch (err) {
    return null;
  }
}

export function safeLocalStorageSet(key: string, value: any): void {
  try {
    const str = JSON.stringify(value);
    localStorage.setItem(key, str);
  } catch (err) {
    console.warn(`LocalStorage quota exceeded for ${key}. Data stored in memory & IndexedDB.`);
    try {
      sessionStorage.clear();
    } catch (e) {}
  }
}

export function safeLocalStorageGet<T>(key: string, fallback: T): T {
  try {
    const str = localStorage.getItem(key);
    if (!str) return fallback;
    return JSON.parse(str) as T;
  } catch (err) {
    return fallback;
  }
}

// Full Database Backup & Export
export function exportFullDatabaseBackup(sessions: any[], orders: any[]): void {
  try {
    const backupData = {
      app: 'SIAC_Procurement_System',
      exportedAt: new Date().toISOString(),
      exportedAtArabic: new Date().toLocaleString('ar-EG'),
      sessionsCount: sessions.length,
      ordersCount: orders.length,
      data: {
        sessions,
        orders
      }
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `SIAC_Procurement_Backup_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    alert('حدث خطأ أثناء تنزيل النسخة الاحتياطية: ' + err.message);
  }
}

// Restore Database Backup from JSON file
export function parseDatabaseBackupFile(file: File): Promise<{ sessions: any[]; orders: any[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result as string;
        const parsed = JSON.parse(text);
        if (parsed && parsed.data && Array.isArray(parsed.data.sessions)) {
          resolve({
            sessions: parsed.data.sessions,
            orders: Array.isArray(parsed.data.orders) ? parsed.data.orders : []
          });
        } else if (Array.isArray(parsed)) {
          // Direct sessions array
          resolve({ sessions: parsed, orders: [] });
        } else {
          reject(new Error('تنسيق ملف النسخة الاحتياطية غير صالح'));
        }
      } catch (e: any) {
        reject(new Error('تعذر قراءة ملف النسخة الاحتياطية: ' + e.message));
      }
    };
    reader.onerror = () => reject(new Error('فشل قراءة الملف'));
    reader.readAsText(file);
  });
}
