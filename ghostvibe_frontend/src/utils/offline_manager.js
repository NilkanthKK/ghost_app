// Frontend Offline Queue Manager for GhostVibe Protocol
// Persistent local storage sync to survive browser reloads/refreshes

let queue = [];

// Load persisted queue from localStorage on startup
try {
  const savedQueue = localStorage.getItem('gv_offline_queue');
  if (savedQueue) {
    queue = JSON.parse(savedQueue);
    console.log('[Queue] Loaded persisted offline queue. Pending items:', queue.length);
  }
} catch (e) {
  console.warn('[Queue] Failed to load offline queue from localStorage:', e);
}

/**
 * Saves current queue state to local storage.
 */
function saveQueue() {
  try {
    localStorage.setItem('gv_offline_queue', JSON.stringify(queue));
  } catch (e) {
    console.warn('[Queue] Failed to persist offline queue:', e);
  }
}

/**
 * Stores an outgoing packet in the queue if it is valid and not a duplicate.
 * @param {Object} packet - The outgoing WebSocket packet
 * @returns {Boolean} - True if successfully added, false otherwise
 */
export function addToQueue(packet) {
  if (!packet || typeof packet !== 'object') {
    return false;
  }

  // Extract client_message_id from different possible structures
  const client_message_id = packet.client_message_id || (packet.data && (packet.data.id || packet.data.client_message_id));
  const target_id = packet.target_id;
  const data = packet.data;

  if (!client_message_id || !target_id || !data) {
    return false;
  }

  // Prevent duplicate entries
  const exists = queue.some(item => item.client_message_id === client_message_id);
  if (exists) {
    return false;
  }

  const ttl = data.ttl;
  const expires_at = (ttl !== undefined && ttl !== null) ? (Date.now() + ttl * 1000) : null;

  // Construct queue item
  const queueItem = {
    client_message_id,
    target_id,
    type: packet.type || 'chat-message',
    data,
    ttl,
    expires_at,
    retry_count: 0,
    status: 'pending',
    created_at: Date.now()
  };

  queue.push(queueItem);
  saveQueue();
  console.log(`[Queue Added] Message ${client_message_id} queued. Target: ${target_id}`);
  return true;
}

/**
 * Processes the queue by sending messages over the open WebSocket.
 * Marks status as 'sending' but does not delete items until ACK.
 * @param {WebSocket} socket - The active WebSocket connection
 */
export function processQueue(socket) {
  // Prune expired items first
  const initialLen = queue.length;
  queue = queue.filter(item => {
    if (item.expires_at && Date.now() >= item.expires_at) {
      console.log(`[Queue] Message ${item.client_message_id} expired before transmission. Pruning.`);
      try {
        const event = new CustomEvent('gv-message-expired', { detail: { message_id: item.client_message_id } });
        window.dispatchEvent(event);
      } catch (err) {
        console.warn("Failed to dispatch gv-message-expired event:", err);
      }
      return false;
    }
    return true;
  });

  if (queue.length !== initialLen) {
    saveQueue();
  }

  if (!socket || socket.readyState !== 1) { // 1 is WebSocket.OPEN
    return;
  }

  if (queue.length > 0) {
    console.log(`[Queue Processed] Flushing offline queue. Items: ${queue.length}`);
    queue.forEach(item => {
      item.status = 'sending';
      socket.send(JSON.stringify({
        type: item.type,
        target_id: item.target_id,
        data: item.data
      }));
    });
    saveQueue();
  }
}

/**
 * Removes an acknowledged message from the queue.
 * @param {String} client_message_id - The client message ID to remove
 * @returns {Boolean} - True if found and removed, false otherwise
 */
export function handleAck(client_message_id) {
  if (!client_message_id) {
    return false;
  }

  const initialLength = queue.length;
  queue = queue.filter(item => item.client_message_id !== client_message_id);
  
  if (queue.length < initialLength) {
    saveQueue();
    console.log(`[ACK Received] Cleared message ${client_message_id} from local queue.`);
    return true;
  }
  return false;
}

/**
 * Returns a copy of the queue to prevent direct mutation.
 * @returns {Array} - Copy of the queue
 */
export function getQueue() {
  return JSON.parse(JSON.stringify(queue));
}

/**
 * Empties the queue completely (used for testing).
 */
export function handleLocalExpiry(client_message_id) {
  queue = queue.filter(item => item.client_message_id !== client_message_id);
  saveQueue();
}

/**
 * Empties the queue completely (used for testing).
 */
export function clearQueue() {
  queue = [];
  saveQueue();
  console.log('[Queue] Offline queue cleared.');
}
