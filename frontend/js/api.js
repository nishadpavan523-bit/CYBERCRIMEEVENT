const Api = (() => {
  const TOKEN_KEY = 'ct_token';
  const USER_KEY = 'ct_user';

  // Backend API server
  const API_BASE = 'https://cyber-5l9z.onrender.com';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch (_) {
      return null;
    }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function buildUrl(url) {
    // Already an absolute URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    // API routes go to FastAPI backend
    if (url.startsWith('/api/')) {
      return API_BASE + url;
    }

    return url;
  }

  async function request(method, url, body) {
    const headers = {
      'Content-Type': 'application/json'
    };

    const token = getToken();

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const finalUrl = buildUrl(url);

    const res = await fetch(finalUrl, {
      method,
      headers,
      credentials: 'include',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let data = null;

    try {
      data = await res.json();
    } catch (_) {
      // No JSON response
    }

    if (!res.ok) {
      const message =
        (data && data.detail) ||
        (data && data.error) ||
        `Request failed (${res.status})`;

      if (res.status === 401) {
        clearSession();
      }

      throw new Error(message);
    }

    return data;
  }

  return {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body),
    patch: (url, body) => request('PATCH', url, body),
    del: (url) => request('DELETE', url),

    getToken,
    getUser,
    setSession,
    clearSession,
  };
})();

/** Redirects to the right landing page for a logged-in user's role. */
function goToDashboard(user) {
  if (!user) {
    window.location.href = '/index.html';
    return;
  }

  if (user.role === 'admin') {
    window.location.href = '/admin.html';
  } else {
    window.location.href = '/cases.html';
  }
}

/** Guards a page: redirects to login if not authenticated / wrong role. */
function requireSession(allowedRoles) {
  const user = Api.getUser();
  const token = Api.getToken();

  if (!user || !token) {
    window.location.href = '/index.html';
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    goToDashboard(user);
    return null;
  }

  return user;
}

function flash(container, message, type) {
  const el = document.createElement('div');
  el.className = `flash ${type || 'info'}`;
  el.textContent = message;
  container.prepend(el);

  setTimeout(() => el.remove(), 6000);
}

function timeAgo(iso) {
  if (!iso) return '—';

  const s = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000
  );

  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;

  return `${Math.floor(s / 3600)}h ago`;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}
