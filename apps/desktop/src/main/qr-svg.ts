// Zero-dependency ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC-L, Versions 1..10)
// Used for LAN / Tailscale Web Companion pairing links (#token=...).

const VERSION_SPECS: Array<{ totalCodewords: number; ecCodewordsPerBlock: number; blocks: number; align: number[] }> = [
  { totalCodewords: 0, ecCodewordsPerBlock: 0, blocks: 0, align: [] },
  { totalCodewords: 26, ecCodewordsPerBlock: 7, blocks: 1, align: [] },
  { totalCodewords: 44, ecCodewordsPerBlock: 10, blocks: 1, align: [6, 18] },
  { totalCodewords: 70, ecCodewordsPerBlock: 15, blocks: 1, align: [6, 22] },
  { totalCodewords: 100, ecCodewordsPerBlock: 20, blocks: 1, align: [6, 26] },
  { totalCodewords: 134, ecCodewordsPerBlock: 26, blocks: 1, align: [6, 30] },
  { totalCodewords: 172, ecCodewordsPerBlock: 18, blocks: 2, align: [6, 34] },
  { totalCodewords: 196, ecCodewordsPerBlock: 20, blocks: 2, align: [6, 22, 38] },
  { totalCodewords: 242, ecCodewordsPerBlock: 24, blocks: 2, align: [6, 24, 42] },
  { totalCodewords: 292, ecCodewordsPerBlock: 30, blocks: 2, align: [6, 26, 46] },
  { totalCodewords: 346, ecCodewordsPerBlock: 18, blocks: 4, align: [6, 28, 50] }
];

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) GF_EXP[i] = GF_EXP[i - 255];
})();

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    const factor = GF_EXP[i];
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], factor);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, degree: number): Uint8Array {
  const gen = rsGeneratorPoly(degree);
  const rem = new Uint8Array(degree);
  for (let i = 0; i < data.length; i += 1) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[degree - 1] = 0;
    for (let j = 0; j < degree; j += 1) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

export function renderQrSvg(text: string, margin = 2): string | null {
  const payload = Buffer.from(text, "utf8");
  let version = 0;
  for (let v = 1; v <= 10; v += 1) {
    const spec = VERSION_SPECS[v];
    const dataCodewords = spec.totalCodewords - spec.ecCodewordsPerBlock * spec.blocks;
    const headerBits = v <= 9 ? 12 : 20;
    const capacity = Math.floor((dataCodewords * 8 - headerBits) / 8);
    if (payload.length <= capacity) {
      version = v;
      break;
    }
  }
  if (!version) return null;

  const spec = VERSION_SPECS[version];
  const dataCodewords = spec.totalCodewords - spec.ecCodewordsPerBlock * spec.blocks;
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, version <= 9 ? 8 : 16);
  for (const byte of payload) pushBits(byte, 8);
  const maxBits = dataCodewords * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx += 1;
  }

  const dataBytes = new Uint8Array(dataCodewords);
  for (let i = 0; i < dataCodewords; i += 1) {
    let b = 0;
    for (let bit = 0; bit < 8; bit += 1) b = (b << 1) | bits[i * 8 + bit];
    dataBytes[i] = b;
  }

  // Split into blocks (for versions 1..10 ECC-L, version 10 has 2 short + 2 long blocks: 68*2 + 69*2 = 274)
  const shortBlockLen = Math.floor(dataCodewords / spec.blocks);
  const numLongBlocks = dataCodewords % spec.blocks;
  const numShortBlocks = spec.blocks - numLongBlocks;
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < spec.blocks; b += 1) {
    const len = shortBlockLen + (b >= numShortBlocks ? 1 : 0);
    const block = dataBytes.subarray(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    ecBlocks.push(rsRemainder(block, spec.ecCodewordsPerBlock));
  }

  const interleaved: number[] = [];
  const maxBlockLen = shortBlockLen + (numLongBlocks > 0 ? 1 : 0);
  for (let i = 0; i < maxBlockLen; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) interleaved.push(block[i]);
    }
  }
  for (let i = 0; i < spec.ecCodewordsPerBlock; i += 1) {
    for (const block of ecBlocks) interleaved.push(block[i]);
  }

  const size = version * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunc = (x: number, y: number, dark: boolean) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  const drawFinder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunc(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  };

  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);

  for (let i = 0; i < size; i += 1) {
    if (!isFunction[6][i]) setFunc(i, 6, i % 2 === 0);
    if (!isFunction[i][6]) setFunc(6, i, i % 2 === 0);
  }

  for (const ay of spec.align) {
    for (const ax of spec.align) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === size - 7) || (ax === size - 7 && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const dist = Math.max(Math.abs(dx), Math.abs(dy));
          setFunc(ax + dx, ay + dy, dist !== 1);
        }
      }
    }
  }

  // Reserve format info bits & dark module
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      if (!isFunction[8][i]) setFunc(i, 8, false);
      if (!isFunction[i][8]) setFunc(8, i, false);
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setFunc(size - 1 - i, 8, false);
    if (i < 7) setFunc(8, size - 1 - i, false);
  }
  setFunc(8, size - 8, true);

  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vBits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const bit = ((vBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(a, b, bit);
      setFunc(b, a, bit);
    }
  }

  // Place data bits (zigzag)
  let bitIdx = 0;
  const totalBits = interleaved.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIdx < totalBits) {
          const dark = ((interleaved[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1) !== 0;
          modules[y][x] = dark;
          bitIdx += 1;
        }
      }
    }
  }

  // Apply mask 0: (x + y) % 2 === 0, ECC-L = 01
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isFunction[y][x] && (x + y) % 2 === 0) {
        modules[y][x] = !modules[y][x];
      }
    }
  }

  const formatData = (0b01 << 3) | 0;
  let fRem = formatData;
  for (let i = 0; i < 10; i += 1) fRem = (fRem << 1) ^ ((fRem >>> 9) * 0x537);
  const formatBits = ((formatData << 10) | fRem) ^ 0x5412;
  const getFmt = (i: number) => ((formatBits >>> i) & 1) !== 0;

  for (let i = 0; i <= 5; i += 1) modules[8][i] = getFmt(i);
  modules[8][7] = getFmt(6);
  modules[8][8] = getFmt(7);
  modules[7][8] = getFmt(8);
  for (let i = 9; i < 15; i += 1) modules[14 - i][8] = getFmt(i);
  for (let i = 0; i < 8; i += 1) modules[8][size - 1 - i] = getFmt(i);
  for (let i = 8; i < 15; i += 1) modules[size - 15 + i][8] = getFmt(i);
  modules[size - 8][8] = true;

  const viewSize = size + margin * 2;
  let path = "";
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (modules[y][x]) path += `M${x + margin},${y + margin}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewSize} ${viewSize}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#111111"/></svg>`;
}
