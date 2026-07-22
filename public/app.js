const grid = document.getElementById('grid');
const editBtn = document.getElementById('edit-btn');
const addBtn = document.getElementById('add-btn');
const watchdogBtn = document.getElementById('watchdog-btn');
const themeBtn = document.getElementById('theme-btn');
const dialog = document.getElementById('tile-dialog');
const form = document.getElementById('tile-form');
const cancelBtn = document.getElementById('cancel-btn');
const dialogTitle = document.getElementById('dialog-title');
const watchdogDialog = document.getElementById('watchdog-dialog');
const watchdogCloseBtn = document.getElementById('watchdog-close-btn');

let tiles = [];
let editing = false;
let editingId = null;
let dragSrc = null;

let SERVERS = [];
const SERVERS_REFRESH_MS = 30000;

const FUN_FACTS = {
  PapaStreams:   'Plex began in 2007 as an unofficial port of XBMC Media Center for Mac — the name is a play on "personal media library."',
  Jellyfin:      'Jellyfin was forked from Emby in late 2018 after Emby went closed-source — it stays 100% free and open-source forever.',
  Immich:        'Started in 2022 by Alex Tran during paternity leave, Immich is now one of the fastest-growing self-hosted projects on GitHub.',
  PapaFrame:     'A custom digital photo frame — the Raspberry Pi 4 has enough GPU muscle to fade between 4K photos without breaking a sweat.',
  Transmission: 'Transmission ships as the default BitTorrent client on macOS, Ubuntu, and Fedora — first released in 2005 and still under 1 MB.',
  'Pi Connect':  'Raspberry Pi Connect launched in May 2024, giving every Pi a free browser-based remote desktop without port-forwarding.',
  Roadtrekker:   'YouTube was founded above a pizzeria in San Mateo in 2005 — its first video, "Me at the zoo," is still online.',
  hpenvy:        'The HP Envy line debuted in 2009 — originally HP\'s answer to the MacBook Pro before becoming a desktop family.',
  josephpi4:     'The Raspberry Pi 4 was the first Pi capable of driving two 4K displays at once — a real leap from the Pi 3.',
  pictureframejd: 'The first commercial digital picture frame, the Sony CyberFrame, launched in 2000 — it held a whopping 6 photos.',
  'Google photos': 'Launched in 2015 with free unlimited "high quality" backup — Google ended the unlimited tier on June 1, 2021.'
};

const ICONS = {
  link:     '<path d="M10 14a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/>',
  music:    '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  photo:    '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="m21 17-5-5-9 9"/>',
  film:     '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 3v18M17 3v18M3 7h4M3 12h4M3 17h4M17 7h4M17 12h4M17 17h4"/>',
  frame:    '<rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="10"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  pi:       '<path d="M4 7h16"/><path d="M8 7v13"/><path d="M16 7c0 8 0 13 2 13"/><path d="M12 7v10"/>',
  youtube:  '<rect x="2" y="6" width="20" height="12" rx="3"/><path d="m10 9 5 3-5 3z" fill="#fff"/>',
  globe:    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  cloud:    '<path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A4 4 0 0 0 6 18Z"/>',
  server:   '<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/><circle cx="7" cy="6.5" r="0.8" fill="#fff"/><circle cx="7" cy="17.5" r="0.8" fill="#fff"/>'
};

function expandUrl(url) {
  return url.replace(/\{host\}/g, location.hostname || 'localhost');
}

async function loadTiles() {
  const res = await fetch('/api/tiles');
  tiles = await res.json();
  render();
}

async function loadServers() {
  try {
    const res = await fetch('/api/servers');
    SERVERS = await res.json();
  } catch {
    SERVERS = [];
  }
  renderServers();
}

async function saveTiles() {
  await fetch('/api/tiles', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tiles)
  });
}

function renderServers() {
  const servers = document.getElementById('servers');
  servers.innerHTML = '';
  for (const server of SERVERS) {
    const card = document.createElement('div');
    card.className = 'server-card';
    card.innerHTML = `
      <div class="server-card-header">
        <div>
          <p class="server-label">${server.host}</p>
          <p class="server-role">${server.role}</p>
        </div>
        <p class="status-pill ${server.status === 'Online' ? 'online' : 'offline'}">${server.status}</p>
      </div>
      <dl class="server-meta">
        <dt>Model</dt><dd>${server.model}</dd>
        <dt>OS</dt><dd>${server.os}</dd>
        <dt>Kernel</dt><dd>${server.kernel}</dd>
        <dt>IP</dt><dd>${server.ip}</dd>
        <dt>Services</dt><dd>${server.services}</dd>
      </dl>
      <div class="server-metrics">
        <div><strong>Uptime</strong><span>${server.uptime}</span></div>
        <div><strong>Load</strong><span>${server.load}</span></div>
        <div><strong>CPU</strong><span>${server.cpu}</span></div>
        <div><strong>Memory</strong><span>${server.memory}</span></div>
        <div><strong>Disk</strong><span>${server.disk}</span></div>
      </div>
      <p class="server-fact">${server.fact}</p>
    `;
    servers.appendChild(card);
  }
}

function render() {
  grid.innerHTML = '';
  for (const t of tiles) {
    const a = document.createElement('a');
    a.className = 'tile';
    a.href = expandUrl(t.url);
    a.target = '_blank';
    a.rel = 'noopener';
    a.dataset.id = t.id;
    a.style.setProperty('--tile-color', t.color || '#4051b5');
    a.draggable = false;

    const icon = document.createElement('div');
    icon.className = 'icon';
    icon.style.background = `linear-gradient(135deg, ${t.color || '#4051b5'}, rgba(255,255,255,0.12))`;

    if (t.logo) {
      const img = document.createElement('img');
      img.src = t.logo;
      img.alt = t.name;
      img.onerror = () => {
        icon.innerHTML = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${ICONS[t.icon] || ICONS.link}</svg>`;
      };
      icon.appendChild(img);
    } else {
      icon.innerHTML = `<svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round">${ICONS[t.icon] || ICONS.link}</svg>`;
    }

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = t.name;

    const fact = FUN_FACTS[t.name];
    if (fact) {
      const tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = fact;
      a.appendChild(tip);
    }

    const controls = document.createElement('div');
    controls.className = 'tile-controls';
    controls.innerHTML = `
      <button class="edit" title="Edit">✎</button>
      <button class="del"  title="Remove">×</button>`;
    controls.querySelector('.edit').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      openDialog(t);
    });
    controls.querySelector('.del').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (confirm(`Remove "${t.name}"?`)) removeTile(t.id);
    });

    a.appendChild(icon);
    a.appendChild(label);
    a.appendChild(controls);

    a.addEventListener('click', (e) => {
      if (editing) { e.preventDefault(); }
    });

    a.addEventListener('dragstart', (e) => {
      if (!editing) { e.preventDefault(); return; }
      dragSrc = a;
      a.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
    });
    a.addEventListener('dragend', () => {
      a.classList.remove('dragging');
      grid.querySelectorAll('.tile').forEach(el => el.classList.remove('drag-over'));
    });
    a.addEventListener('dragover', (e) => {
      if (!editing || !dragSrc || dragSrc === a) return;
      e.preventDefault();
      a.classList.add('drag-over');
    });
    a.addEventListener('dragleave', () => a.classList.remove('drag-over'));
    a.addEventListener('drop', (e) => {
      if (!editing || !dragSrc || dragSrc === a) return;
      e.preventDefault();
      const srcId = dragSrc.dataset.id;
      const dstId = a.dataset.id;
      const srcIdx = tiles.findIndex(x => x.id === srcId);
      const dstIdx = tiles.findIndex(x => x.id === dstId);
      const [moved] = tiles.splice(srcIdx, 1);
      tiles.splice(dstIdx, 0, moved);
      saveTiles();
      render();
    });

    grid.appendChild(a);
  }
  grid.querySelectorAll('.tile').forEach(el => el.draggable = editing);
}

function setEditing(on) {
  editing = on;
  document.body.classList.toggle('editing', on);
  editBtn.classList.toggle('active', on);
  editBtn.textContent = on ? 'Done' : 'Edit';
  addBtn.hidden = !on;
  grid.querySelectorAll('.tile').forEach(el => el.draggable = on);
}

function openDialog(tile) {
  editingId = tile ? tile.id : null;
  dialogTitle.textContent = tile ? 'Edit tile' : 'Add tile';
  form.elements.name.value  = tile?.name  || '';
  form.elements.url.value   = tile?.url   || '';
  form.elements.color.value = tile?.color || '#4051b5';
  form.elements.icon.value  = tile?.icon  || 'link';
  dialog.showModal();
  setTimeout(() => form.elements.name.focus(), 0);
}

function removeTile(id) {
  tiles = tiles.filter(t => t.id !== id);
  saveTiles();
  render();
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const data = {
    name:  form.elements.name.value.trim(),
    url:   form.elements.url.value.trim(),
    color: form.elements.color.value,
    icon:  form.elements.icon.value
  };
  if (!data.name || !data.url) return;

  if (editingId) {
    const i = tiles.findIndex(t => t.id === editingId);
    if (i >= 0) tiles[i] = { ...tiles[i], ...data };
  } else {
    tiles.push({ id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ...data });
  }
  saveTiles();
  render();
  dialog.close();
});

cancelBtn.addEventListener('click', () => dialog.close());
watchdogCloseBtn.addEventListener('click', () => watchdogDialog.close());
watchdogBtn.addEventListener('click', () => watchdogDialog.showModal());
editBtn.addEventListener('click', () => setEditing(!editing));
addBtn.addEventListener('click', () => openDialog(null));

/* Theme toggle */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  themeBtn.title = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
}
function initTheme() {
  const saved = localStorage.getItem('papastuff-theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  applyTheme(saved || (prefersLight ? 'light' : 'dark'));
}
themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  localStorage.setItem('papastuff-theme', next);
});

/* Clocks */
function updateClocks() {
  const now = new Date();
  document.querySelectorAll('.clock').forEach(el => {
    const tz = el.dataset.tz;
    const time = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, timeZone: tz
    }).format(now);
    const date = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      timeZone: tz
    }).format(now);
    el.querySelector('.clock-time').textContent = time;
    el.querySelector('.clock-date').textContent = date;
  });
}

initTheme();
updateClocks();
setInterval(updateClocks, 1000);

loadTiles();
loadServers();
setInterval(loadServers, SERVERS_REFRESH_MS);
