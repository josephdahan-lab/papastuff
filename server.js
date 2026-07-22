import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '80', 10);
const TILES_FILE = path.join(__dirname, 'tiles.json');
const GLANCES_PORT = 61208;
const GLANCES_TIMEOUT_MS = 2500;

const SERVERS_CONFIG = [
  {
    host: 'hpenvy',
    role: 'Main media + photo server',
    model: 'HP Envy desktop',
    services: 'Plex · Jellyfin · Immich',
    fact: 'The HP Envy line debuted in 2009 — originally HP\'s answer to the MacBook Pro before becoming a desktop family.'
  },
  {
    host: 'josephpi4',
    role: 'Edge node · downloads · digital frame',
    model: 'Raspberry Pi 4 Model B (8 GB)',
    services: 'Transmission · PapaFrame',
    fact: 'The Raspberry Pi 4 was the first Pi capable of driving two 4K displays at once — a leap from the Pi 3\'s single 1080p output.'
  },
  {
    host: 'pictureframejd',
    role: 'Digital picture frame',
    model: 'Raspberry Pi',
    services: 'PictureFrame',
    fact: 'The first commercial digital picture frame, the Sony CyberFrame, launched in 2000 — it held a whopping 6 photos.'
  },
  {
    host: 'pictureframedidier2',
    role: 'Digital picture frame',
    model: 'Raspberry Pi',
    services: 'PictureFrame',
    fact: 'The first commercial digital picture frame, the Sony CyberFrame, launched in 2000 — it held a whopping 6 photos.'
  }
];

const DEFAULT_TILES = [
  { id: 't1', name: 'PapaStreams',  url: 'http://{host}:3000',          icon: 'music',     color: '#e91e63' },
  { id: 't2', name: 'Immich',       url: 'http://{host}:2283',          icon: 'photo',     color: '#4051b5' },
  { id: 't3', name: 'Jellyfin',     url: 'http://{host}:8096',          icon: 'film',      color: '#7c4dff' },
  { id: 't4', name: 'PapaFrame',    url: 'http://josephpi4:8000',       icon: 'frame',     color: '#ff9800' },
  { id: 't5', name: 'Transmission', url: 'http://josephpi4:9091',       icon: 'download',  color: '#009688' },
  { id: 't6', name: 'Pi Connect',   url: 'https://connect.raspberrypi.com', icon: 'pi',    color: '#c51a4a' },
  { id: 't7', name: 'Roadtrekker',  url: 'https://www.youtube.com/@therealroadtrekker', icon: 'youtube', color: '#ff0000' }
];

function loadTiles() {
  try {
    if (!fs.existsSync(TILES_FILE)) {
      fs.writeFileSync(TILES_FILE, JSON.stringify(DEFAULT_TILES, null, 2));
      return DEFAULT_TILES;
    }
    return JSON.parse(fs.readFileSync(TILES_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to load tiles:', err);
    return DEFAULT_TILES;
  }
}

function saveTiles(tiles) {
  fs.writeFileSync(TILES_FILE, JSON.stringify(tiles, null, 2));
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tiles', (req, res) => {
  res.json(loadTiles());
});

app.put('/api/tiles', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'expected array' });
  saveTiles(req.body);
  res.json({ ok: true });
});

async function fetchGlances(server) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GLANCES_TIMEOUT_MS);
  try {
    for (const v of [4, 3]) {
      const res = await fetch(`http://${server.host}:${GLANCES_PORT}/api/${v}/all`, { signal: ctrl.signal });
      if (res.ok) return await res.json();
      if (res.status !== 404) throw new Error(`HTTP ${res.status}`);
    }
    throw new Error('no compatible glances API (tried v4, v3)');
  } finally {
    clearTimeout(timer);
  }
}

function pct(n) {
  return n != null && Number.isFinite(n) ? `${Math.round(n)}%` : '—';
}

function formatUptime(seconds) {
  if (!Number.isFinite(seconds)) return '—';
  const d = Math.floor(seconds / 86400);
  if (d >= 1) return `${d} day${d === 1 ? '' : 's'}`;
  const h = Math.floor(seconds / 3600);
  if (h >= 1) return `${h}h`;
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

function pickRootFs(fs) {
  if (!Array.isArray(fs) || fs.length === 0) return '—';
  const root = fs.find(f => f.mnt_point === '/') || fs[0];
  return pct(root?.percent);
}

function buildServer(cfg, data) {
  if (!data) {
    return {
      ...cfg, status: 'Offline',
      os: '—', kernel: '—', ip: '—',
      uptime: '—', cpu: '—', memory: '—', disk: '—', load: '—'
    };
  }
  const sys = data.system || {};
  const ip = data.ip || {};
  const load = data.load || {};
  return {
    ...cfg,
    status: 'Online',
    os: sys.linux_distro || sys.os_name || '—',
    kernel: sys.os_version || sys.platform || '—',
    ip: ip.address || '—',
    uptime: typeof data.uptime === 'string' ? data.uptime : formatUptime(data.uptime),
    cpu: pct(data.cpu?.total),
    memory: pct(data.mem?.percent),
    disk: pickRootFs(data.fs),
    load: Number.isFinite(load.min1) ? load.min1.toFixed(2) : '—'
  };
}

app.get('/api/servers', async (req, res) => {
  const results = await Promise.all(SERVERS_CONFIG.map(async (cfg) => {
    try {
      const data = await fetchGlances(cfg);
      return buildServer(cfg, data);
    } catch {
      return buildServer(cfg, null);
    }
  }));
  res.json(results);
});

app.listen(PORT, () => {
  console.log(`\n  PapaStuff launcher running on http://localhost:${PORT}\n`);
}).on('error', (err) => {
  if (err.code === 'EACCES') {
    console.error(`\nERROR: permission denied binding port ${PORT}.`);
    console.error('Either run with sudo, set PORT=8080, or grant the node binary the cap_net_bind_service capability:');
    console.error('  sudo setcap cap_net_bind_service=+ep $(readlink -f $(which node))\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});
