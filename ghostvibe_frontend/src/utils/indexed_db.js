// Encrypted Local Storage Utility (IndexedDB Layer)
// Milestone 2 - Phase 2: Web Crypto API AES-256-GCM

let dbInstance = null;
let useMemoryFallback = false;

// Encrypted in-memory fallback maps
const memoryDb = {
  messages: new Map(),
  drafts: new Map(),
  preferences: new Map(),
  keys: new Map(),
  cache: new Map()
};

/**
 * Checks if IndexedDB is supported by the user agent.
 * @returns {Boolean}
 */
export function isIndexedDBSupported() {
  try {
    return !!window.indexedDB;
  } catch {
    return false;
  }
}

/**
 * Initializes the IndexedDB database GhostVibeDB.
 * Falls back to memory cache if unavailable.
 * @returns {Promise<IDBDatabase|null>}
 */
export function initDatabase() {
  return new Promise((resolve) => {
    if (!isIndexedDBSupported()) {
      console.warn("IndexedDB not supported. Switching to memory fallback.");
      useMemoryFallback = true;
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open("GhostVibeDB", 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const stores = ["messages", "drafts", "preferences", "keys", "cache"];
        
        stores.forEach(store => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: "id" });
          }
        });
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        useMemoryFallback = false;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.warn("Failed to open IndexedDB. Falling back to memory storage:", event.target.error);
        useMemoryFallback = true;
        resolve(null);
      };
    } catch (err) {
      console.warn("IndexedDB open exception. Switching to memory:", err);
      useMemoryFallback = true;
      resolve(null);
    }
  });
}

/**
 * Utility to resolve key inputs into a native CryptoKey object.
 * Supports raw 32-byte arrays, array buffers, or plaintext passwords.
 * @param {CryptoKey|Uint8Array|ArrayBuffer|String} keyInput
 * @returns {Promise<CryptoKey>}
 */
async function getCryptoKey(keyInput) {
  if (keyInput instanceof CryptoKey) {
    return keyInput;
  }

  let rawKey;
  if (typeof keyInput === 'string') {
    const encoder = new TextEncoder();
    const data = encoder.encode(keyInput);
    const hash = await window.crypto.subtle.digest("SHA-256", data);
    rawKey = new Uint8Array(hash);
  } else if (keyInput instanceof Uint8Array || keyInput instanceof ArrayBuffer) {
    rawKey = new Uint8Array(keyInput);
  } else {
    throw new Error("Invalid key type for cryptographic encryption");
  }

  return window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a JavaScript object using AES-256-GCM.
 * @param {Object} data - Plaintext object
 * @param {String|CryptoKey} key - Encryption password or Key
 * @returns {Promise<String>} - Formatted string ENC[Base64]
 */
export async function encryptData(data, key) {
  if (data === undefined) {
    throw new Error("Cannot encrypt undefined data");
  }

  const cryptoKey = await getCryptoKey(key);
  const plaintext = JSON.stringify(data);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    cryptoKey,
    new TextEncoder().encode(plaintext)
  );

  // Combine IV (12 bytes) and ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  // Convert binary to base64
  let binaryString = "";
  for (let i = 0; i < combined.length; i++) {
    binaryString += String.fromCharCode(combined[i]);
  }
  const base64 = btoa(binaryString);

  return `ENC[${base64}]`;
}

/**
 * Decrypts a base64 encrypted payload using AES-256-GCM.
 * @param {String} blob - Encrypted payload matching ENC[Base64]
 * @param {String|CryptoKey} key - Decryption key
 * @returns {Promise<Object>} - Decrypted JavaScript object
 */
export async function decryptData(blob, key) {
  if (!blob || typeof blob !== "string" || !blob.startsWith("ENC[") || !blob.endsWith("]")) {
    throw new Error("Invalid encryption wrapper format");
  }

  const base64 = blob.slice(4, -1);
  const binaryString = atob(base64);

  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const cryptoKey = await getCryptoKey(key);

  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    cryptoKey,
    ciphertext
  );

  const plaintext = new TextDecoder().decode(decrypted);
  return JSON.parse(plaintext);
}

/**
 * Encrypts and saves a record inside an object store.
 * @param {String} storeName - Store identifier
 * @param {String} id - Primary key
 * @param {Object} value - Plaintext value object
 * @param {String|CryptoKey} key - Encryption key
 * @returns {Promise<Boolean>}
 */
export async function saveRecord(storeName, id, value, key) {
  try {
    let sanitizedValue = value;
    if (id && typeof id === 'string' && id.startsWith('gv_chats_') && Array.isArray(value)) {
      sanitizedValue = value.map(chat => {
        if (!chat.messages) return chat;
        const filtered = chat.messages.filter(m => !(m.view_once && m.opened));
        return { ...chat, messages: filtered };
      });
    } else if (value && typeof value === 'object' && value.view_once && value.opened) {
      await deleteRecord(storeName, id);
      return true;
    }

    const encryptedBlob = await encryptData(sanitizedValue, key);
    const ttl = sanitizedValue && typeof sanitizedValue === 'object' ? sanitizedValue.ttl : null;
    const expires_at = sanitizedValue && typeof sanitizedValue === 'object' ? sanitizedValue.expires_at : null;
    const view_once = sanitizedValue && typeof sanitizedValue === 'object' ? sanitizedValue.view_once : null;
    const opened = sanitizedValue && typeof sanitizedValue === 'object' ? sanitizedValue.opened : null;
    const opened_at = sanitizedValue && typeof sanitizedValue === 'object' ? sanitizedValue.opened_at : null;

    if (useMemoryFallback || !dbInstance) {
      if (!memoryDb[storeName]) {
        memoryDb[storeName] = new Map();
      }
      memoryDb[storeName].set(id, { data: encryptedBlob, ttl, expires_at, view_once, opened, opened_at });
      return true;
    }

    return new Promise((resolve) => {
      const transaction = dbInstance.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const record = { id: id, data: encryptedBlob };
      if (ttl !== undefined && ttl !== null) record.ttl = ttl;
      if (expires_at !== undefined && expires_at !== null) record.expires_at = expires_at;
      if (view_once !== undefined && view_once !== null) record.view_once = view_once;
      if (opened !== undefined && opened !== null) record.opened = opened;
      if (opened_at !== undefined && opened_at !== null) record.opened_at = opened_at;
      
      const request = store.put(record);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error(`Failed to save record to ${storeName}:`, err);
    return false;
  }
}

/**
 * Retrieves and decrypts a record from an object store.
 * @param {String} storeName - Store identifier
 * @param {String} id - Primary key
 * @param {String|CryptoKey} key - Decryption key
 * @returns {Promise<Object|null>} - Decrypted object or null
 */
export async function getRecord(storeName, id, key) {
  try {
    let encryptedBlob = null;
    let recordObj = null;

    if (useMemoryFallback || !dbInstance) {
      if (memoryDb[storeName]) {
        recordObj = memoryDb[storeName].get(id);
      }
    } else {
      recordObj = await new Promise((resolve) => {
        const transaction = dbInstance.transaction([storeName], "readonly");
        const store = transaction.objectStore(storeName);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      });
    }

    if (!recordObj) {
      return null;
    }

    // Check if the record contains expires_at and check validity
    const expiresAtVal = recordObj.expires_at;
    if (expiresAtVal && new Date(expiresAtVal).getTime() <= Date.now()) {
      await deleteRecord(storeName, id);
      return null;
    }

    // Check if individual record is opened view once
    if (recordObj.view_once && recordObj.opened) {
      await deleteRecord(storeName, id);
      return null;
    }

    encryptedBlob = typeof recordObj === 'object' && 'data' in recordObj ? recordObj.data : recordObj;
    if (!encryptedBlob || typeof encryptedBlob !== 'string') {
      return null;
    }

    const decrypted = await decryptData(encryptedBlob, key);
    if (id && typeof id === 'string' && id.startsWith('gv_chats_') && Array.isArray(decrypted)) {
      let changed = false;
      const cleaned = decrypted.map(chat => {
        if (!chat.messages) return chat;
        const filtered = chat.messages.filter(m => {
          if (m.view_once && m.opened) {
            changed = true;
            return false;
          }
          return true;
        });
        return { ...chat, messages: filtered };
      });
      if (changed) {
        // Re-save pruned list
        await saveRecord(storeName, id, cleaned, key);
        return cleaned;
      }
    }
    return decrypted;
  } catch (err) {
    console.error(`Failed to retrieve record from ${storeName}:`, err);
    return null;
  }
}

/**
 * Deletes a record from an object store.
 * @param {String} storeName - Store identifier
 * @param {String} id - Primary key
 * @returns {Promise<Boolean>}
 */
export async function deleteRecord(storeName, id) {
  try {
    if (useMemoryFallback || !dbInstance) {
      if (memoryDb[storeName]) {
        memoryDb[storeName].delete(id);
      }
      return true;
    }

    return new Promise((resolve) => {
      const transaction = dbInstance.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error(`Failed to delete record from ${storeName}:`, err);
    return false;
  }
}

/**
 * Clears every record inside an object store.
 * @param {String} storeName - Store identifier
 * @returns {Promise<Boolean>}
 */
export async function clearStore(storeName) {
  try {
    if (useMemoryFallback || !dbInstance) {
      if (memoryDb[storeName]) {
        memoryDb[storeName].clear();
      }
      return true;
    }

    return new Promise((resolve) => {
      const transaction = dbInstance.transaction([storeName], "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (err) {
    console.error(`Failed to clear store ${storeName}:`, err);
    return false;
  }
}

/**
 * Helper to force trigger memory fallback mode (for unit testing).
 * @param {Boolean} status
 */
export function forceMemoryFallback(status) {
  useMemoryFallback = status;
}
