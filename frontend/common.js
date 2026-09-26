// Common helper functions across all pages
export const API_BASE_URL = (window.API_BASE_URL || (location.hostname === 'localhost' ? 'http://localhost:3000' : '')).replace(/\/$/, '');

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

export function getVoterSession() {
  try {
    const raw = sessionStorage.getItem('desa_voter');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setVoterSession(voter) {
  try {
    sessionStorage.setItem('desa_voter', JSON.stringify(voter));
  } catch {}
}

export function clearVoterSession() {
  try {
    sessionStorage.removeItem('desa_voter');
  } catch {}
}

export async function api(path, options = {}, authUser = null) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  if (authUser) {
    headers.Authorization = `Bearer ${await authUser.getIdToken()}`;
  }

  const requestOptions = {
    ...options,
    headers
  };

  if (requestOptions.body && typeof requestOptions.body !== 'string') {
    requestOptions.body = JSON.stringify(requestOptions.body);
  }

  const response = await fetch(`${API_BASE_URL}/api${path}`, requestOptions);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
