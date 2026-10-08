#!/usr/bin/env node
/**
 * LAN gateway — run the event on a local server, with phones on the same Wi-Fi.
 *
 *   phone ──HTTPS──▶ this gateway (port 443) ──HTTP──▶ Docker nginx (127.0.0.1:3000) ──▶ app
 *
 * Why it exists:
 *  - Phones only share GPS with HTTPS pages, so the gateway serves HTTPS with a local certificate.
 *  - Docker Desktop (Windows/macOS) replaces every visitor's address with its own gateway address,
 *    so the app could not tell phones apart. The gateway sees the real phone address and passes it
 *    on in X-Forwarded-For, which nginx trusts only in LAN mode (deploy/real-ip.lan.conf).
 *
 * Usage:  node scripts/lan-gateway.mjs
 * Env:    LAN_PORT (443), LAN_HTTP_PORT (80, redirects to HTTPS), LAN_TARGET (http://127.0.0.1:3000)
 * No dependencies. Needs `openssl` once, to create the certificate in deploy/certs/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.LAN_PORT || 443);
const HTTP_PORT = Number(process.env.LAN_HTTP_PORT || 80);
const TARGET = new URL(process.env.LAN_TARGET || 'http://127.0.0.1:3000');
const CERT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deploy/certs');
const KEY = path.join(CERT_DIR, 'lan-key.pem');
const CERT = path.join(CERT_DIR, 'lan-cert.pem');
const CERT_IPS = path.join(CERT_DIR, 'lan-cert-ips.txt');

/** IPv4 addresses of real network adapters (skips loopback, WSL, Docker and VM adapters). */
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|docker|VirtualBox|VMware|Loopback|br-|veth/i.test(name)) continue;
    for (const a of addrs || []) {
      // Node reports family as either "IPv4" or 4, depending on its version.
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  return out;
}

function findOpenssl() {
  const candidates = ['openssl', 'C:/Program Files/Git/usr/bin/openssl.exe', 'C:/Program Files/Git/mingw64/bin/openssl.exe'];
  for (const c of candidates) {
    try { execFileSync(c, ['version'], { stdio: 'ignore' }); return c; } catch { /* try next */ }
  }
  return null;
}

/** Self-signed certificate for this computer's LAN addresses; recreated when the addresses change. */
function ensureCertificate(ips) {
  const wanted = [...ips].sort().join(',');
  if (existsSync(KEY) && existsSync(CERT) && existsSync(CERT_IPS) && readFileSync(CERT_IPS, 'utf8').trim() === wanted) return;
  const openssl = findOpenssl();
  if (!openssl) {
    console.error('openssl was not found. Install Git for Windows (it includes openssl) or put openssl on PATH, then run again.');
    process.exit(1);
  }
  mkdirSync(CERT_DIR, { recursive: true });
  const san = ['DNS:localhost', 'IP:127.0.0.1', ...ips.map((ip) => `IP:${ip}`)].join(',');
  execFileSync(openssl, ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '825',
    '-subj', '/CN=MC2026 Voting (local)', '-addext', `subjectAltName=${san}`,
    '-keyout', KEY, '-out', CERT], { stdio: 'ignore' });
  writeFileSync(CERT_IPS, wanted);
  console.log(`Created a local HTTPS certificate for ${ips.join(', ') || 'localhost'}.`);
}

const clientAddress = (req) => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');

/** Forward one request; the phone's address replaces any X-Forwarded-For it sent. */
function forward(req, res) {
  const headers = { ...req.headers, 'x-forwarded-for': clientAddress(req), 'x-forwarded-proto': 'https' };
  const upstream = http.request({
    protocol: TARGET.protocol, hostname: TARGET.hostname, port: TARGET.port, path: req.url, method: req.method, headers,
  }, (up) => {
    res.writeHead(up.statusCode || 502, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('The voting server is not running. Start it with: docker compose up -d');
  });
  // Live-results streams stay open; drop the upstream request as soon as the phone leaves.
  res.on('close', () => upstream.destroy());
  req.pipe(upstream);
}

const ips = lanAddresses();
ensureCertificate(ips);

https.createServer({ key: readFileSync(KEY), cert: readFileSync(CERT) }, forward)
  .on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' || e.code === 'EACCES'
      ? `Port ${PORT} is not available. Try another one, e.g. LAN_PORT=8443 node scripts/lan-gateway.mjs`
      : e.message);
    process.exit(1);
  })
  .listen(PORT, '0.0.0.0', () => {
    const port = PORT === 443 ? '' : `:${PORT}`;
    console.log('\nMC2026 LAN gateway is running. Phones on the same Wi-Fi can open:');
    for (const ip of ips) console.log(`  https://${ip}${port}/        admin: https://${ip}${port}/admin`);
    if (ips[0]) {
      const net = ips[0].split('.').slice(0, 3).join('.');
      console.log(`\nSet PUBLIC_URL=https://${ips[0]}${port} in .env so the QR code points here.`);
      console.log(`In Admin › Settings › On-site access, allow this Wi-Fi with: ${net}.0/24`);
    }
    console.log('Phones will show a certificate warning the first time: choose "Advanced" › "Proceed".\n');
  });

// Plain-HTTP port only redirects, so typing the address without https:// still works.
http.createServer((req, res) => {
  const host = (req.headers.host || '').replace(/:\d+$/, '');
  res.writeHead(301, { location: `https://${host}${PORT === 443 ? '' : `:${PORT}`}${req.url}` });
  res.end();
}).on('error', () => { /* optional: port in use, HTTPS still works */ }).listen(HTTP_PORT, '0.0.0.0');
