// scripts/make-icons.cjs
// One-shot generator: writes /icons/sl-{192,512}.png. Pure Node (zlib + Buffer),
// no canvas / sharp dependency. Re-run only if the brand mark changes.
//
//   node scripts/make-icons.cjs
//
// Produces a rounded-square purple tile with a centred white "S". Both files
// are committed under public-served /icons/.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');

// Streamline brand purple (matches the admin default accent).
const BG = [0x7B, 0x3F, 0xE4];
const FG = [0xFF, 0xFF, 0xFF];

// ── PNG encoder ───────────────────────────────────────────────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, pixels /* RGBA Buffer */) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;           // bit depth
  ihdr[9] = 6;           // RGBA
  ihdr[10] = 0;          // compression
  ihdr[11] = 0;          // filter
  ihdr[12] = 0;          // interlace
  // Filter-byte 0 prepended per scanline.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ── Render: rounded square + centred "S" ──────────────────────────────────────
// Single-channel coverage mask is enough; we composite over BG with alpha.
function setRGBA(buf, i, r, g, b, a) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a; }

function distToRoundedRect(x, y, w, h, r) {
  // Negative inside, positive outside.
  const dx = Math.max(Math.abs(x - w / 2) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(y - h / 2) - (h / 2 - r), 0);
  return Math.hypot(dx, dy) - r;
}

// Draw an "S" by stroking three Bezier-ish arcs. We rasterise by sampling a
// signed distance to two stacked circles + a connecting bar.
function distToS(x, y, size) {
  // Place an "S" inside a 0..1 unit square, then scale.
  const u = x / size, v = y / size;
  // Top loop: circle centred (0.5, 0.32) r=0.18, opens bottom-right.
  // Bottom loop: circle centred (0.5, 0.68) r=0.18, opens top-left.
  const stroke = 0.10; // stroke half-width as a fraction of size
  const topR = 0.18, botR = 0.18;
  const dTop = Math.hypot(u - 0.5, v - 0.32) - topR;
  const dBot = Math.hypot(u - 0.5, v - 0.68) - botR;
  // Sectors: keep top arc on the upper-left + top, bottom arc on lower-right + bottom.
  const topSector = (v < 0.32) || (u < 0.5 && v < 0.5);
  const botSector = (v > 0.68) || (u > 0.5 && v > 0.5);
  let d = Infinity;
  if (topSector) d = Math.min(d, Math.abs(dTop) - stroke / 2);
  if (botSector) d = Math.min(d, Math.abs(dBot) - stroke / 2);
  // Connecting bar from (0.5, 0.32+0.18)≈(0.5, 0.50) down to (0.5, 0.68-0.18)=(0.5, 0.50).
  // The two loops naturally meet at v=0.50 so no extra bar needed.
  return d * size; // scale back to pixel units
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded-square mask → BG.
      const dRect = distToRoundedRect(x, y, size, size, radius);
      const aaRect = clamp01(0.5 - dRect);
      // S glyph mask → FG.
      const dS = distToS(x, y, size);
      const aaS = clamp01(0.5 - dS);
      // Composite: white over purple, both inside rounded square.
      const bgA = aaRect;
      const r = lerp(BG[0], FG[0], aaS);
      const g = lerp(BG[1], FG[1], aaS);
      const b = lerp(BG[2], FG[2], aaS);
      setRGBA(buf, i, Math.round(r), Math.round(g), Math.round(b), Math.round(bgA * 255));
    }
  }
  return buf;
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── Run ───────────────────────────────────────────────────────────────────────
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
for (const size of [192, 512]) {
  const pixels = render(size);
  const png = encodePng(size, size, pixels);
  const out = path.join(OUT_DIR, `sl-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
