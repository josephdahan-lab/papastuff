import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '80', 10);
const TILES_FILE = path.join(__dirname, 'tiles.json');
const SERVERS_FILE = path.join(__dirname, 'servers.json');
const GLANCES_PORT = 61208;
const GLANCES_TIMEOUT_MS = 2500;

const DEFAULT_SERVERS = [
  {
    id: 's-precision',
    host: 'precision',
    image: '/img/photos/precision.jpg',
    role: 'Home server · photos · NAS',
    model: 'Dell Precision 3630 Tower',
    services: 'Immich · Jellyfin · PapaStreams · PapaStuff',
    fact: 'Dell launched the Precision workstation line in 1997, aimed at engineers and 3D designers who needed more than a desktop PC.'
  },
  {
    id: 's-hpenvy',
    host: 'hpenvy',
    image: '/img/photos/hpenvy.jpg',
    role: 'Main media + photo server',
    model: 'HP Envy desktop',
    services: 'Plex · Jellyfin · Immich',
    fact: 'The HP Envy line debuted in 2009 — originally HP\'s answer to the MacBook Pro before becoming a desktop family.'
  },
  {
    id: 's-josephpi4',
    host: 'josephpi4',
    image: '/img/photos/pi4-board.jpg',
    role: 'Edge node · downloads · digital frame',
    model: 'Raspberry Pi 4 Model B (8 GB)',
    services: 'Transmission · PapaFrame',
    fact: 'The Raspberry Pi 4 was the first Pi capable of driving two 4K displays at once — a leap from the Pi 3\'s single 1080p output.'
  },
  {
    id: 's-pictureframejd',
    host: 'pictureframejd',
    image: '/img/photos/papaframe.jpg',
    role: 'Digital picture frame',
    model: 'Raspberry Pi',
    services: 'PictureFrame',
    fact: 'The first commercial digital picture frame, the Sony CyberFrame, launched in 2000 — it held a whopping 6 photos.'
  },
  {
    id: 's-pictureframedidier2',
    host: 'pictureframedidier2',
    image: '/img/photos/pictureframe.jpg',
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

function loadServersConfig() {
  try {
    if (!fs.existsSync(SERVERS_FILE)) {
      fs.writeFileSync(SERVERS_FILE, JSON.stringify(DEFAULT_SERVERS, null, 2));
      return DEFAULT_SERVERS;
    }
    return JSON.parse(fs.readFileSync(SERVERS_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to load servers:', err);
    return DEFAULT_SERVERS;
  }
}

function saveServersConfig(servers) {
  fs.writeFileSync(SERVERS_FILE, JSON.stringify(servers, null, 2));
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

app.get('/api/servers/config', (req, res) => {
  res.json(loadServersConfig());
});

app.put('/api/servers/config', (req, res) => {
  if (!Array.isArray(req.body) || !req.body.every(s => s && typeof s.host === 'string' && s.host.trim())) {
    return res.status(400).json({ error: 'expected array of servers with a host' });
  }
  saveServersConfig(req.body);
  res.json({ ok: true });
});

app.get('/api/servers', async (req, res) => {
  const results = await Promise.all(loadServersConfig().map(async (cfg) => {
    try {
      const data = await fetchGlances(cfg);
      return buildServer(cfg, data);
    } catch {
      return buildServer(cfg, null);
    }
  }));
  res.json(results);
});

/* ---------- French joke of the day (deviens-marrant.fr) ---------- */

const JOKE_URL = 'https://deviens-marrant.fr/api/widget/v1/vanne-du-jour';
const JOKE_RETRY_MS = 10 * 60 * 1000;
let jokeCache = null;      // last good response
let jokeLastTry = 0;

function parisDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

app.get('/api/joke', async (req, res) => {
  const stale = !jokeCache || jokeCache.date !== parisDate();
  if (stale && Date.now() - jokeLastTry > JOKE_RETRY_MS) {
    jokeLastTry = Date.now();
    try {
      const r = await fetch(JOKE_URL, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (!j.amorce) throw new Error('unexpected response');
      jokeCache = {
        date: j.date, amorce: j.amorce, chute: j.chute || '', url: j.url,
        attribution: j.attribution || { name: 'Deviens Marrant', url: 'https://deviens-marrant.fr/' }
      };
    } catch (err) {
      console.error('Joke fetch failed:', err.message);
    }
  }
  if (!jokeCache) return res.status(503).json({ error: 'joke unavailable' });
  res.json(jokeCache);
});

/* ---------- Admin: application upgrades from GitHub ---------- */

const execFileP = promisify(execFile);
const HOME = os.homedir();

// Apps installed on this machine: repo folder, folder holding package.json (null = none), and systemd units to restart.
const APPS = [
  { id: 'papastuff',     name: 'PapaStuff',     dir: __dirname,                         npmDir: '',       services: ['papastuff'] },
  { id: 'papastreams',   name: 'PapaStreams',   dir: path.join(HOME, 'papastreams'),   npmDir: 'server', services: ['papastreams'] },
  { id: 'papabackup',    name: 'PapaBackup',    dir: path.join(HOME, 'papabackup'),    npmDir: null,     services: ['papabackup'] },
  { id: 'papabookmarks', name: 'PapaBookmarks', dir: path.join(HOME, 'papabookmarks'), npmDir: '',       services: ['papabookmarks'] },
  { id: 'papamonitor',   name: 'PapaMonitor',   dir: path.join(HOME, 'papamonitor'),   npmDir: null,     services: ['papamonitor', 'papamonitor-web'] }
];

const upgrading = new Set();

async function git(app, args, timeout = 30000) {
  const { stdout } = await execFileP('git', [
    '-C', app.dir,
    '-c', 'credential.helper=',
    '-c', 'credential.helper=!gh auth git-credential',
    ...args
  ], { timeout, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}

async function gitOr(app, args, fallback = null) {
  try { return await git(app, args); } catch { return fallback; }
}

async function versionAt(app, ref) {
  let pkgVersion = null;
  if (app.npmDir !== null) {
    const pkg = await gitOr(app, ['show', `${ref}:${app.npmDir ? app.npmDir + '/' : ''}package.json`]);
    if (pkg) {
      try { pkgVersion = JSON.parse(pkg).version || null; } catch { /* ignore */ }
    }
  }
  const tag = await gitOr(app, ['describe', '--tags', '--abbrev=0', ref]);
  const [commit, date, subject] = (await gitOr(app, ['log', '-1', '--format=%h%x09%cI%x09%s', ref], '')).split('\t');
  const version = pkgVersion ? `v${pkgVersion.replace(/^v/, '')}` : (tag || null);
  return { version, commit: commit || null, date: date || null, subject: subject || null };
}

async function appStatus(app, { fetch = true } = {}) {
  const base = { id: app.id, name: app.name, services: app.services, upgrading: upgrading.has(app.id) };
  if (!fs.existsSync(path.join(app.dir, '.git'))) return { ...base, error: 'not a git checkout' };
  try {
    const branch = await git(app, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const upstream = await gitOr(app, ['rev-parse', '--abbrev-ref', '@{u}'], `origin/${branch}`);
    let fetchError = null;
    if (fetch) {
      try { await git(app, ['fetch', '--quiet', '--tags', 'origin'], 20000); }
      catch (err) { fetchError = (err.stderr || err.message).trim().split('\n').pop(); }
    }
    // rev-list prints "<only in HEAD> <only in upstream>"
    const [ahead, behind] = (await git(app, ['rev-list', '--left-right', '--count', `HEAD...${upstream}`])).split(/\s+/).map(Number);
    const incoming = behind > 0
      ? (await git(app, ['log', '--format=%h %s', `HEAD..${upstream}`, '-n', '15'])).split('\n').filter(Boolean)
      : [];
    const localChanges = (await git(app, ['status', '--porcelain', '--untracked-files=no'])).split('\n').filter(Boolean).length;
    const remoteUrl = await gitOr(app, ['remote', 'get-url', 'origin'], '');
    return {
      ...base, branch, upstream, fetchError,
      repoUrl: remoteUrl.replace(/\.git$/, '').replace(/^git@github\.com:/, 'https://github.com/'),
      current: await versionAt(app, 'HEAD'),
      latest: await versionAt(app, upstream),
      behind, ahead, incoming, localChanges,
      canUpgrade: behind > 0 && ahead === 0 && !upgrading.has(app.id)
    };
  } catch (err) {
    return { ...base, error: (err.stderr || err.message).trim() };
  }
}

app.get('/api/admin/apps', async (req, res) => {
  const fetch = req.query.fetch !== '0';
  res.json({ host: os.hostname(), apps: await Promise.all(APPS.map(a => appStatus(a, { fetch }))) });
});

app.post('/api/admin/apps/:id/upgrade', async (req, res) => {
  const target = APPS.find(a => a.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'unknown app' });
  if (upgrading.has(target.id)) return res.status(409).json({ error: 'upgrade already running' });

  upgrading.add(target.id);
  const steps = [];
  try {
    const status = await appStatus(target);
    if (status.error) throw new Error(status.error);
    if (status.ahead > 0) throw new Error(`this copy has ${status.ahead} local commit(s) not on GitHub — push or reset them first`);
    if (status.behind === 0) return res.json({ ok: true, steps: ['Already up to date'] });

    const before = await git(target, ['rev-parse', 'HEAD']);
    try {
      await git(target, ['merge', '--ff-only', status.upstream]);
    } catch (err) {
      throw new Error(`git refused the update (local edits to files this update changes?): ${(err.stderr || err.message).trim()}`);
    }
    steps.push(`Updated ${status.current.commit} → ${status.latest.commit} (${status.behind} commit${status.behind === 1 ? '' : 's'})`);

    const changed = (await git(target, ['diff', '--name-only', before, 'HEAD'])).split('\n').filter(Boolean);
    if (target.npmDir !== null) {
      const prefix = target.npmDir ? `${target.npmDir}/` : '';
      if (changed.some(f => f === `${prefix}package.json` || f === `${prefix}package-lock.json`)) {
        await execFileP('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'],
          { cwd: path.join(target.dir, target.npmDir), timeout: 300000, maxBuffer: 8 * 1024 * 1024 });
        steps.push('Installed npm dependencies');
      }
    }
    if (changed.some(f => f.endsWith('requirements.txt'))) steps.push('⚠ requirements.txt changed — install Python packages by hand');
    if (changed.some(f => /\.(service|timer)$/.test(f))) steps.push('⚠ systemd unit files changed — copy them to /etc/systemd/system and run daemon-reload');

    if (target.dir === __dirname) {
      // Restarting ourselves: answer first, then restart from a detached process.
      spawn('sh', ['-c', `sleep 1; sudo -n systemctl restart ${target.services.join(' ')}`], { detached: true, stdio: 'ignore' }).unref();
      steps.push(`Restarting ${target.services.join(', ')} — this page will reload in a few seconds`);
    } else {
      await execFileP('sudo', ['-n', 'systemctl', 'restart', ...target.services], { timeout: 60000 });
      steps.push(`Restarted ${target.services.join(', ')}`);
    }
    res.json({ ok: true, steps });
  } catch (err) {
    res.status(500).json({ error: err.message, steps });
  } finally {
    upgrading.delete(target.id);
  }
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
