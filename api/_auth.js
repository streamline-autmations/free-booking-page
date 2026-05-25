// api/_auth.js
// Shared helpers for the Vercel serverless admin functions.
// Files prefixed with "_" are NOT routed by Vercel — import-only.
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Service-role client (server-side only — key lives in Vercel env, never shipped to browser).
function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
}

// HMAC secret. Prefer a dedicated secret; fall back to the service key so it still works if unset.
function secret() {
  return process.env.ADMIN_TOKEN_SECRET || process.env.SUPABASE_SERVICE_KEY || 'dev-only-insecure-secret';
}

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Stateless signed token, bound to businessId + expiry. A valid token can only be
// minted by admin-auth after a correct PIN, and is verifiable by every write function
// without any shared session store.
function signToken(businessId) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${businessId}.${exp}`;
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64');
}

function verifyToken(token, businessId) {
  try {
    if (!token) return false;
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [bizId, exp, sig] = decoded.split('.');
    if (bizId !== businessId) return false;
    if (!exp || Date.now() > Number(exp)) return false;
    const expect = crypto.createHmac('sha256', secret()).update(`${bizId}.${exp}`).digest('hex');
    const a = Buffer.from(sig || '', 'hex');
    const b = Buffer.from(expect, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function sha256(str) {
  return crypto.createHash('sha256').update(String(str)).digest('hex');
}

// Vercel auto-parses JSON bodies, but be defensive if it arrives as a string.
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = { getSupabase, signToken, verifyToken, sha256, readBody };
