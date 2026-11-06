/* SuiviKcal — échanges avec n8n.
   - Aucun secret dans ce code : l'appareil crée lui-même sa clé (aléatoire, 256 bits) au premier lancement.
     n8n n'en garde que l'empreinte (SHA-256).
   - L'invitation reçue par lien (#invit=…) ne sert qu'une fois : elle lie la clé à CE téléphone.
     L'administrateur valide ensuite l'appareil. Une invitation réutilisée ailleurs est refusée et signalée.
   - L'adresse du serveur n'est pas dans le code : elle arrive avec le lien d'invitation (paramètre n).
   - Appels en POST « text/plain » : pas de requête préalable CORS. */
(function () {
  'use strict';
  const ENV = window.SK_ENV || 'local';
  const P = 'suivikcal.' + ENV + '.';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); } catch (e) {} }
  };

  function nouvelleCle() {
    const a = new Uint8Array(32);
    crypto.getRandomValues(a);
    return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
  }
  function cle() {
    let c = ls.get('cle', '');
    if (!c) { c = nouvelleCle(); ls.set('cle', c); }
    return c;
  }
  function modele() {
    const ua = navigator.userAgent || '';
    const m = ua.match(/\(([^)]+)\)/);
    let t = m ? m[1] : ua;
    if (/iPhone/.test(ua)) t = 'iPhone · iOS ' + ((ua.match(/OS (\d+)/) || [])[1] || '?');
    else if (/Android/.test(ua)) t = (t.split(';').map(s => s.trim()).filter(s => s && !/^(Linux|U|wv|K)$/.test(s) && !/^Android/.test(s))[0] || 'Android') + ' · ' + ((ua.match(/Android (\d+)/) || [])[0] || 'Android');
    return (t + ' · ' + (/Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navigateur')).slice(0, 80);
  }

  class ApiError extends Error {
    constructor(code, erreur) { super(erreur || 'reseau'); this.code = code; this.erreur = erreur || 'reseau'; }
  }

  /* Adresse des webhooks, reçue avec l'invitation : https://<serveur>/webhook/<app> */
  function decodeServeur(n) {
    try {
      const s = atob(String(n).replace(/-/g, '+').replace(/_/g, '/'));
      return /^https:\/\/[a-z0-9.-]+(:\d+)?\/webhook\/[a-z0-9-]+$/i.test(s) ? s : '';
    } catch (e) { return ''; }
  }
  /* Lit un lien (ou un fragment) d'invitation : …#invit=XXXX&n=YYYY */
  function lireLien(texte) {
    const t = String(texte || '');
    const i = t.match(/invit=([A-Za-z0-9_-]{16,})/), n = t.match(/[#&?]n=([A-Za-z0-9_-]{8,})/);
    if (!i) return null;
    return { invit: i[1], serveur: n ? decodeServeur(n[1]) : '' };
  }

  async function post(body, timeoutMs) {
    const base = ls.get('serveur', '');
    if (!base) throw new ApiError(401, 'invitation');
    if (!navigator.onLine) throw new ApiError(0, 'reseau');
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 45000);
    let r;
    try {
      r = await fetch(base + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: ctrl.signal
      });
    } catch (e) { throw new ApiError(0, 'reseau'); }
    finally { clearTimeout(t); }
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok || !j) throw new ApiError(r.status, (j && (j.erreur || j.statut)) || 'serveur');
    return j;
  }

  /* Statut d'accès mémorisé : '' (jamais activé), 'attente', 'actif', 'refuse', 'revoque' */
  function statut() { return ls.get('statut', ''); }
  function setStatut(s) { ls.set('statut', s); }

  async function activer(lien, relance) {
    if (lien) { ls.set('invit', lien.invit); if (lien.serveur) ls.set('serveur', lien.serveur); }
    const inv = ls.get('invit', '');
    if (!inv) throw new ApiError(401, 'invitation');
    try {
      const j = await post({ action: 'activer', invit: inv, cle: cle(), modele: modele(), relance: !!relance }, 20000);
      setStatut(j.statut || (j.ok ? 'actif' : 'attente'));
      return j;
    } catch (e) {
      if (e.code === 401 || e.code === 403) setStatut(e.erreur === 'invitation_utilisee' ? 'utilisee' : 'invalide');
      throw e;
    }
  }

  async function appel(action, donnees, timeoutMs) {
    try {
      return await post(Object.assign({ action, cle: cle() }, donnees || {}), timeoutMs);
    } catch (e) {
      if (e.code === 401) setStatut('revoque');
      if (e.code === 403 && (e.erreur === 'revoque' || e.erreur === 'refuse')) setStatut(e.erreur);
      throw e;
    }
  }

  window.SKApi = { ENV, statut, setStatut, activer, appel, lireLien, ApiError };
})();
