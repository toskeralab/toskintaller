/**
 * Gera um banner BMP (24-bit, bottom-up) com gradiente horizontal entre duas cores.
 * O NSIS carrega BMP nativamente via LR_LOADFROMFILE — sem dependências externas.
 */
export interface GradientBannerOptions {
  width?: number;
  height?: number;
  from: string; // "#RRGGBB"
  to: string; // "#RRGGBB"
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`cor inválida: ${hex} (use #RRGGBB)`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function generateGradientBmp(opts: GradientBannerOptions): Buffer {
  const width = opts.width ?? 400;
  const height = opts.height ?? 60;
  const [r0, g0, b0] = hexToRgb(opts.from);
  const [r1, g1, b1] = hexToRgb(opts.to);

  const rowSize = Math.ceil((width * 3) / 4) * 4; // alinhamento a 4 bytes
  const pixelDataSize = rowSize * height;
  const fileSize = 54 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);
  // BITMAPFILEHEADER
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10); // offset dos pixels
  // BITMAPINFOHEADER
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(24, 28); // bpp
  buf.writeUInt32LE(0, 30); // compression = BI_RGB
  buf.writeUInt32LE(pixelDataSize, 34);

  // Pixels (bottom-up, BGR)
  for (let y = 0; y < height; y++) {
    const rowStart = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) {
      const t = x / Math.max(width - 1, 1);
      const r = Math.round(r0 + (r1 - r0) * t);
      const g = Math.round(g0 + (g1 - g0) * t);
      const b = Math.round(b0 + (b1 - b0) * t);
      const p = rowStart + x * 3;
      buf[p] = b;
      buf[p + 1] = g;
      buf[p + 2] = r;
    }
  }
  return buf;
}