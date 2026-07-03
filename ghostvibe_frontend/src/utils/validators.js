/**
 * GhostVibe Frontend Validation Suite
 */

// Block potential XSS/SQLi in UI inputs
export function sanitizeInput(value) {
  if (!value) return '';
  const trimmed = value.trim();
  
  const sqliPattern = /('|--|union\s+select|select\s+.*from|or\s+\d+=\d+)/i;
  const xssPattern = /(<script|<iframe|javascript:|onmouseover|onerror|onload)/i;
  
  if (sqliPattern.test(trimmed)) {
    throw new Error('Potential SQL Injection payload detected.');
  }
  if (xssPattern.test(trimmed)) {
    throw new Error('Potential script injection payload detected.');
  }
  return trimmed;
}

export function validatePhoneNumber(phone) {
  const sanitized = sanitizeInput(phone);
  // E.164 regex: optional +, followed by 10 to 15 digits
  if (!/^\+?[1-9]\d{9,14}$/.test(sanitized)) {
    return 'Invalid mobile number format. Must be 10-15 digits E.164 (e.g. +919876543210).';
  }
  return null;
}

export function validateEmail(email) {
  const sanitized = sanitizeInput(email);
  if (!/^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$/.test(sanitized)) {
    return 'Invalid email address format.';
  }
  return null;
}

export function validateOtpCode(otp) {
  const sanitized = sanitizeInput(otp);
  if (!/^\d{6}$/.test(sanitized)) {
    return 'OTP must be exactly 6 digits.';
  }
  return null;
}

export function validateUsername(username) {
  const sanitized = sanitizeInput(username);
  if (sanitized.length < 3 || sanitized.length > 30) {
    return 'Username must be between 3 and 30 characters.';
  }
  if (username.includes('  ')) {
    return 'Username cannot contain consecutive spaces.';
  }
  if (!/^[a-zA-Z0-9_.]+$/.test(sanitized)) {
    return 'Username can only contain alphanumeric characters, underscores (_), and dots (.).';
  }
  
  const reserved = new Set(['admin', 'root', 'support', 'ghostvibe', 'system', 'moderator', 'operator']);
  if (reserved.has(sanitized.toLowerCase())) {
    return 'This username is reserved.';
  }
  return null;
}

export function validateBio(bio) {
  if (!bio) return null;
  const sanitized = sanitizeInput(bio);
  if (sanitized.length > 150) {
    return 'Bio must not exceed 150 characters.';
  }
  return null;
}

export function validateFileUpload(file, maxSizeBytes = 10 * 1024 * 1024) {
  if (!file) return 'No file selected.';
  
  // Size validation
  if (file.size <= 0) {
    return 'File is empty or corrupted.';
  }
  if (file.size > maxSizeBytes) {
    const mbLimit = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    return `File size exceeds the limit of ${mbLimit}MB.`;
  }
  
  // Extension & Double Extension checks
  const filename = file.name.toLowerCase();
  const parts = filename.split('.');
  if (parts.length > 2) {
    const maliciousExts = ['exe', 'bat', 'cmd', 'sh', 'js', 'vbs', 'scr', 'msi'];
    if (parts.slice(1).some(ext => maliciousExts.includes(ext))) {
      return 'Potential malicious double extension detected.';
    }
  }
  
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'mp3', 'wav', 'mp4', 'mov', 'pdf', 'doc', 'docx', 'zip', 'txt'];
  const ext = parts[parts.length - 1];
  if (!allowedExtensions.includes(ext)) {
    return 'File extension is not allowed.';
  }
  
  return null;
}

export function validateChatMessage(text) {
  if (!text) return 'Message cannot be empty.';
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 'Message cannot contain only whitespace.';
  }
  if (trimmed.length > 5000) {
    return 'Message size exceeds the 5000 character limit.';
  }
  return null;
}
