/* Ma collection LEGO — version autonome (sans Claude).
   Remplace les connecteurs de claude.ai par des appels directs :
   - Google Drive : API REST Drive v3, connexion Google (Google Identity Services) ;
   - Brickfact : serveur MCP public https://mcp.brickfact.com/mcp.
   L'app (index.html) reste identique : ce fichier fournit window.claude.use('mcp'). */
(function(){
  'use strict';
  // Identifiant OAuth « Application Web » créé dans Google Cloud (origine autorisée : l'adresse GitHub Pages).
  const DEFAULT_CLIENT_ID = '274649465196-rlum0ihiqeogtlbvt74dr8k2tqkpo3se.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive';
  const TOKEN_KEY = 'lego-sa-token', CID_KEY = 'lego-sa-client-id';
  const API = 'https://www.googleapis.com/drive/v3', UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  const BRICKFACT_URL = 'https://mcp.brickfact.com/mcp';
  const clientId = () => DEFAULT_CLIENT_ID || localStorage.getItem(CID_KEY) || '';

  /* ---------- jeton Google ---------- */
  let token = null, tokenClient = null, gisReady = null, waiters = [];
  try { const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); if (t && t.exp > Date.now() + 60000) token = t; } catch (e) {}
  const valid = () => token && token.exp > Date.now() + 60000;
  function loadGis(){
    if (gisReady) return gisReady;
    gisReady = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = res; s.onerror = () => { gisReady = null; rej(new Error('Impossible de charger la connexion Google (hors ligne ?)')); }; document.head.appendChild(s); });
    return gisReady;
  }
  function initClient(){
    if (tokenClient) return tokenClient;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId(), scope: SCOPE,
      callback: r => {
        if (r && r.access_token) {
          token = { v: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
          try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); localStorage.setItem(TOKEN_KEY + '-ok', '1'); } catch (e) {}
          hideGate(); const w = waiters; waiters = []; w.forEach(f => f.res(token.v));
        } else gateMsg('Connexion refusée ou annulée. Réessaie.');
      },
      error_callback: e => gateMsg(e && e.type === 'popup_closed' ? 'Fenêtre de connexion fermée. Réessaie.' : 'Connexion impossible : ' + ((e && (e.message || e.type)) || 'erreur'))
    });
    return tokenClient;
  }
  // Renvoie un jeton valide ; sinon affiche l'écran « Se connecter » et attend le clic (une fenêtre Google ne s'ouvre que sur un geste).
  function getToken(){
    if (valid()) return Promise.resolve(token.v);
    return new Promise((res, rej) => { waiters.push({ res, rej }); showGate(); });
  }
  function dropToken(){ token = null; try { localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  /* ---------- écran de connexion ---------- */
  function gateEl(){
    let g = document.getElementById('sa-gate'); if (g) return g;
    g = document.createElement('div'); g.id = 'sa-gate';
    g.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(6,47,102,.92);font-family:system-ui,sans-serif';
    g.innerHTML = `<div style="background:#fff;border-radius:20px;padding:22px;max-width:360px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.4)">
      <div style="font-size:2.2rem">🧱</div><h2 style="margin:6px 0 4px;color:#0b2a5b;font-size:1.25rem">Ma collection LEGO</h2>
      <p style="margin:0 0 14px;color:#435570;font-weight:600;font-size:.95rem">Connecte-toi à Google pour lire et enregistrer ton fichier « LEGO-Collection.xlsx » sur Google Drive.</p>
      <div id="sa-cid" style="display:none;margin-bottom:10px;text-align:left"><label style="font-size:.8rem;font-weight:700;color:#435570">Identifiant client OAuth Google<input id="sa-cid-in" style="width:100%;box-sizing:border-box;margin-top:4px;padding:10px;border:2px solid #d5deea;border-radius:10px;font:inherit" placeholder="xxxx.apps.googleusercontent.com"></label></div>
      <button id="sa-go" style="width:100%;padding:13px;border:0;border-radius:999px;background:#e3000b;color:#fff;font-weight:800;font-size:1rem;cursor:pointer">Se connecter avec Google</button>
      <button id="sa-off" style="width:100%;margin-top:8px;padding:10px;border:0;border-radius:999px;background:#eef2f8;color:#0b2a5b;font-weight:700;cursor:pointer">Continuer hors ligne</button>
      <p id="sa-msg" style="margin:10px 0 0;color:#b42318;font-weight:700;font-size:.85rem;min-height:1em"></p></div>`;
    document.body.appendChild(g);
    g.querySelector('#sa-go').onclick = async () => {
      const inp = g.querySelector('#sa-cid-in');
      if (!clientId()) { const v = (inp.value || '').trim(); if (!/\.apps\.googleusercontent\.com$/.test(v)) { gateMsg('Colle l’identifiant client (se termine par .apps.googleusercontent.com).'); return; } localStorage.setItem(CID_KEY, v); }
      try { await loadGis(); initClient().requestAccessToken({ prompt: localStorage.getItem(TOKEN_KEY + '-ok') ? '' : 'consent' }); } catch (e) { gateMsg(e.message); }
    };
    g.querySelector('#sa-off').onclick = () => { hideGate(); const w = waiters; waiters = []; w.forEach(f => f.rej({ code: 'offline', message: 'Hors ligne : les modifications restent sur cet appareil jusqu’à la prochaine connexion.' })); };
    return g;
  }
  function showGate(){ const g = gateEl(); g.style.display = 'flex'; g.querySelector('#sa-cid').style.display = clientId() ? 'none' : 'block'; gateMsg(''); loadGis().catch(() => {}); }
  function hideGate(){ const g = document.getElementById('sa-gate'); if (g) g.style.display = 'none'; }
  function gateMsg(t){ const m = document.getElementById('sa-msg'); if (m) m.textContent = t; }

  /* ---------- appels Google Drive ---------- */
  async function gfetch(url, opts = {}, retry = true){
    const t = await getToken();
    const r = await fetch(url, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + t }, opts.headers || {}) }));
    if (r.status === 401 && retry) { dropToken(); return gfetch(url, opts, false); }
    if (!r.ok) { let m = ''; try { m = (await r.json()).error.message; } catch (e) {} throw { code: 'tool_error', message: m || ('HTTP ' + r.status) }; }
    return r;
  }
  // Traduit la syntaxe de recherche du connecteur (title, parentId) vers celle de l'API Drive (name, parents).
  function toQ(q){
    return String(q || '').replace(/parentId\s*=\s*'([^']+)'/g, "'$1' in parents").replace(/\btitle\b/g, 'name');
  }
  const asFile = f => ({ id: f.id, title: f.name, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, parents: f.parents });
  function b64ToBytes(b64){ const s = atob(b64.replace(/\s/g, '')); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function bytesToB64(buf){ const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  const DRIVE_TOOLS = {
    async search_files(a){
      const p = new URLSearchParams({ q: toQ(a.query), pageSize: String(a.pageSize || 20), fields: 'files(id,name,mimeType,modifiedTime,parents)', spaces: 'drive' });
      if (a.orderBy) p.set('orderBy', a.orderBy.replace(/\btitle\b/, 'name'));
      const j = await (await gfetch(API + '/files?' + p)).json();
      return { files: (j.files || []).map(asFile) };
    },
    async download_file_content(a){
      const buf = await (await gfetch(API + '/files/' + encodeURIComponent(a.fileId) + '?alt=media')).arrayBuffer();
      return { base64Content: bytesToB64(buf) };
    },
    async create_file(a){
      const meta = { name: a.title, mimeType: a.contentMimeType };
      if (a.parentId) meta.parents = [a.parentId];
      if (!a.base64Content) { const j = await (await gfetch(API + '/files?fields=id,name,mimeType,modifiedTime,parents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta) })).json(); return asFile(j); }
      const fd = new FormData();
      fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      fd.append('file', new Blob([b64ToBytes(a.base64Content)], { type: a.contentMimeType || 'application/octet-stream' }));
      const j = await (await gfetch(UPLOAD + '/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,parents', { method: 'POST', body: fd })).json();
      return asFile(j);
    },
    async trash_file(a){
      await gfetch(API + '/files/' + encodeURIComponent(a.fileId), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
      return { id: a.fileId, trashed: true };
    }
  };

  /* ---------- Brickfact (serveur MCP public) ---------- */
  let bfId = 1, bfSession = null, bfInit = null;
  async function bfRpc(method, params){
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
    if (bfSession) headers['Mcp-Session-Id'] = bfSession;
    const r = await fetch(BRICKFACT_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: bfId++, method, params }) });
    const sid = r.headers.get('mcp-session-id'); if (sid) bfSession = sid;
    const txt = await r.text();
    let msg = null;
    if (/^\s*(event|data):/m.test(txt)) { for (const line of txt.split(/\r?\n/)) if (line.startsWith('data:')) { try { const o = JSON.parse(line.slice(5)); if (o.id != null) msg = o; } catch (e) {} } }
    else { try { msg = JSON.parse(txt); } catch (e) {} }
    if (!r.ok || !msg) throw { code: 'upstream_error', message: 'Brickfact ne répond pas (' + r.status + ')' };
    if (msg.error) throw { code: 'tool_error', message: msg.error.message || 'Erreur Brickfact' };
    return msg.result;
  }
  async function brickfact(tool, args){
    if (!bfInit) bfInit = bfRpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ma-collection-lego', version: '1' } }).then(() => bfRpc('notifications/initialized', {}).catch(() => {})).catch(e => { bfInit = null; throw e; });
    await bfInit;
    const res = await bfRpc('tools/call', { name: tool, arguments: args });
    if (res && res.isError) throw { code: 'tool_error', message: ((res.content || [])[0] || {}).text || 'Erreur Brickfact' };
    return res;
  }

  /* ---------- interface identique à claude.use('mcp') ---------- */
  const mcp = Object.freeze({
    async callTool(server, tool, input){
      if (server === 'Google Drive') { const f = DRIVE_TOOLS[tool]; if (!f) throw { code: 'tool_error', message: 'Outil inconnu : ' + tool }; return { payload: await f(input || {}) }; }
      if (server === 'Brickfact') return { payload: await brickfact(tool, input || {}) };
      throw { code: 'server_not_connected', message: server };
    }
  });
  window.claude = { use: async name => {
    if (name === 'mcp') { try { await getToken(); } catch (e) { /* hors ligne : on garde le cache local */ } return mcp; }
    return null;
  } };
  window.__standalone = true;

  /* ---------- installation (PWA) ---------- */
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
