// Lightweight backend for speed test logs
// Run with: node server.js
// This stores data in logs.json (simple file-based DB)

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;
const LOGS_FILE = path.join(__dirname, 'logs.json');

app.use(cors());
app.use(express.json());
app.use(express.static('dist')); // Serve built frontend

// Get client IP (server-side)
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0] 
    || req.headers['x-real-ip']
    || req.connection.remoteAddress
    || req.ip
    || 'Unknown';
}

// Initialize logs file
if (!fs.existsSync(LOGS_FILE)) {
  fs.writeFileSync(LOGS_FILE, JSON.stringify([]));
}

function readLogs() {
  try {
    return JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  // Keep only last 500
  const trimmed = logs.slice(-500);
  fs.writeFileSync(LOGS_FILE, JSON.stringify(trimmed, null, 2));
}

// API: Get all logs
app.get('/api/logs', (req, res) => {
  const logs = readLogs();
  res.json(logs);
});

// API: Save new log (with server-side IP detection)
app.post('/api/logs', async (req, res) => {
  try {
    const log = req.body;
    const clientIp = getClientIp(req);
    
    // Override IP with server-detected IP (more accurate)
    log.ip = clientIp !== 'Unknown' ? clientIp : log.ip;
    log.id = Date.now();
    log.time = new Date().toISOString();
    
    // Fetch ISP/Location server-side if not provided
    if (!log.isp || log.isp === 'Unknown' || log.isp === 'Detecting...') {
      try {
        const response = await fetch(`https://ipwho.is/${clientIp}`);
        const data = await response.json();
        if (data.success) {
          log.isp = data.connection?.isp || data.org || log.isp;
          log.location = `${data.city}, ${data.country}` || log.location;
        }
      } catch (e) {
        console.log('IP lookup failed:', e.message);
      }
    }
    
    const logs = readLogs();
    logs.push(log);
    writeLogs(logs);
    
    res.json({ success: true, log });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Clear logs
app.delete('/api/logs', (req, res) => {
  writeLogs([]);
  res.json({ success: true });
});

// API: Get stats
app.get('/api/stats', (req, res) => {
  const logs = readLogs();
  res.json({
    total: logs.length,
    latest: logs.slice(-10).reverse(),
  });
});

app.listen(PORT, () => {
  console.log(`✓ Speed Test Backend running on http://localhost:${PORT}`);
  console.log(`✓ API endpoints:`);
  console.log(`  GET  /api/logs   - Get all test logs`);
  console.log(`  POST /api/logs   - Save new test`);
  console.log(`  DELETE /api/logs - Clear all logs`);
  console.log(`✓ Data stored in: ${LOGS_FILE}`);
});