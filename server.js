import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '80', 10);
const TILES_FILE = path.join(__dirname, 'tiles.json');

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
