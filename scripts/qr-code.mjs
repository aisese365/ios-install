import { deflateSync } from "node:zlib";

const VERSION_DATA = [
  { version: 1, dataCodewords: 19, eccCodewords: 7, alignment: [] },
  { version: 2, dataCodewords: 34, eccCodewords: 10, alignment: [6, 18] },
  { version: 3, dataCodewords: 55, eccCodewords: 15, alignment: [6, 22] },
  { version: 4, dataCodewords: 80, eccCodewords: 20, alignment: [6, 26] }
];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CRC_TABLE = createCrcTable();
const GF_EXP = new Array(512);
const GF_LOG = new Array(256);

initGaloisField();

export function createQrCodePng(text, options = {}) {
  const modules = createQrCodeModules(text);
  return createPng(modules, {
    borderModules: options.borderModules ?? 4,
    scale: options.scale ?? 8
  });
}

function createQrCodeModules(text) {
  const bytes = new TextEncoder().encode(text);
  const qrVersion = selectVersion(bytes.length);
  const size = qrVersion.version * 4 + 17;
  const modules = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

  drawFunctionPatterns(modules, isFunction, qrVersion.version);
  const dataCodewords = createDataCodewords(bytes, qrVersion.dataCodewords);
  const eccCodewords = createErrorCorrectionCodewords(dataCodewords, qrVersion.eccCodewords);
  drawCodewords(modules, isFunction, [...dataCodewords, ...eccCodewords], 0);
  drawFormatBits(modules, isFunction, 0);

  return modules;
}

function selectVersion(byteLength) {
  const requiredBits = 4 + 8 + byteLength * 8;
  const version = VERSION_DATA.find((item) => requiredBits <= item.dataCodewords * 8);

  if (!version) {
    throw new Error("DOMAIN is too long to encode in qrcode.png.");
  }

  return version;
}

function createDataCodewords(bytes, dataCodewordCount) {
  const capacityBits = dataCodewordCount * 8;
  const bits = [];

  appendBits(bits, 0b0100, 4);
  appendBits(bits, bytes.length, 8);
  bytes.forEach((byte) => appendBits(bits, byte, 8));
  appendBits(bits, 0, Math.min(4, capacityBits - bits.length));

  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let codeword = 0;
    for (let j = 0; j < 8; j += 1) {
      codeword = (codeword << 1) | bits[i + j];
    }
    codewords.push(codeword);
  }

  for (let pad = 0xec; codewords.length < dataCodewordCount; pad ^= 0xfd) {
    codewords.push(pad);
  }

  return codewords;
}

function createErrorCorrectionCodewords(dataCodewords, eccCodewordCount) {
  const generator = createReedSolomonGenerator(eccCodewordCount);
  const result = [...dataCodewords, ...Array(eccCodewordCount).fill(0)];

  for (let i = 0; i < dataCodewords.length; i += 1) {
    const factor = result[i];
    if (factor === 0) continue;

    for (let j = 0; j < generator.length; j += 1) {
      result[i + j] ^= galoisMultiply(generator[j], factor);
    }
  }

  return result.slice(dataCodewords.length);
}

function createReedSolomonGenerator(degree) {
  let result = [1];

  for (let i = 0; i < degree; i += 1) {
    const next = Array(result.length + 1).fill(0);

    for (let j = 0; j < result.length; j += 1) {
      next[j] ^= result[j];
      next[j + 1] ^= galoisMultiply(result[j], GF_EXP[i]);
    }

    result = next;
  }

  return result;
}

function drawFunctionPatterns(modules, isFunction, version) {
  const size = modules.length;

  drawFinderPattern(modules, isFunction, 0, 0);
  drawFinderPattern(modules, isFunction, size - 7, 0);
  drawFinderPattern(modules, isFunction, 0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    setFunctionModule(modules, isFunction, i, 6, dark);
    setFunctionModule(modules, isFunction, 6, i, dark);
  }

  const alignment = VERSION_DATA.find((item) => item.version === version).alignment;
  for (const x of alignment) {
    for (const y of alignment) {
      if (!isFunction[y][x]) {
        drawAlignmentPattern(modules, isFunction, x, y);
      }
    }
  }

  drawFormatBits(modules, isFunction, 0);
}

function drawFinderPattern(modules, isFunction, left, top) {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const x = left + dx;
      const y = top + dy;

      if (x < 0 || y < 0 || y >= modules.length || x >= modules.length) continue;

      const inPattern = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
      const dark =
        inPattern &&
        (dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4));

      setFunctionModule(modules, isFunction, x, y, dark);
    }
  }
}

function drawAlignmentPattern(modules, isFunction, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, isFunction, centerX + dx, centerY + dy, distance !== 1);
    }
  }
}

function drawFormatBits(modules, isFunction, mask) {
  const size = modules.length;
  const bits = createFormatBits(mask);

  for (let i = 0; i <= 5; i += 1) setFunctionModule(modules, isFunction, 8, i, getBit(bits, i));
  setFunctionModule(modules, isFunction, 8, 7, getBit(bits, 6));
  setFunctionModule(modules, isFunction, 8, 8, getBit(bits, 7));
  setFunctionModule(modules, isFunction, 7, 8, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunctionModule(modules, isFunction, 14 - i, 8, getBit(bits, i));

  for (let i = 0; i < 8; i += 1) setFunctionModule(modules, isFunction, size - 1 - i, 8, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setFunctionModule(modules, isFunction, 8, size - 15 + i, getBit(bits, i));
  setFunctionModule(modules, isFunction, 8, size - 8, true);
}

function createFormatBits(mask) {
  const errorCorrectionLevelLow = 1;
  const data = (errorCorrectionLevelLow << 3) | mask;
  let remainder = data;

  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }

  return ((data << 10) | remainder) ^ 0x5412;
}

function drawCodewords(modules, isFunction, codewords, mask) {
  const size = modules.length;
  let bitIndex = 0;
  let upward = true;

  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;

    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = upward ? size - 1 - vertical : vertical;

      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (isFunction[y][x]) continue;

        let dark = false;
        if (bitIndex < codewords.length * 8) {
          dark = getBit(codewords[Math.floor(bitIndex / 8)], 7 - (bitIndex % 8));
        }

        modules[y][x] = dark !== getMaskBit(mask, x, y);
        bitIndex += 1;
      }
    }

    upward = !upward;
  }
}

function createPng(modules, { borderModules, scale }) {
  const moduleCount = modules.length;
  const size = (moduleCount + borderModules * 2) * scale;
  const bytesPerPixel = 4;
  const rowLength = 1 + size * bytesPerPixel;
  const raw = Buffer.alloc(rowLength * size);

  for (let y = 0; y < size; y += 1) {
    const rowOffset = y * rowLength;
    raw[rowOffset] = 0;

    for (let x = 0; x < size; x += 1) {
      const moduleX = Math.floor(x / scale) - borderModules;
      const moduleY = Math.floor(y / scale) - borderModules;
      const dark =
        moduleX >= 0 && moduleY >= 0 && moduleX < moduleCount && moduleY < moduleCount && modules[moduleY][moduleX];
      const color = dark ? 0 : 255;
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;

      raw[pixelOffset] = color;
      raw[pixelOffset + 1] = color;
      raw[pixelOffset + 2] = color;
      raw[pixelOffset + 3] = 255;
    }
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    createPngChunk("IHDR", createIhdr(size, size)),
    createPngChunk("IDAT", deflateSync(raw)),
    createPngChunk("IEND", Buffer.alloc(0))
  ]);
}

function createIhdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function createPngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function appendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i -= 1) {
    bits.push((value >>> i) & 1);
  }
}

function setFunctionModule(modules, isFunction, x, y, dark) {
  modules[y][x] = dark;
  isFunction[y][x] = true;
}

function getMaskBit(mask, x, y) {
  if (mask !== 0) {
    throw new Error(`Unsupported QR mask: ${mask}`);
  }

  return (x + y) % 2 === 0;
}

function getBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function initGaloisField() {
  let value = 1;

  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = value;
    GF_LOG[value] = i;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }

  for (let i = 255; i < GF_EXP.length; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
}

function galoisMultiply(left, right) {
  if (left === 0 || right === 0) return 0;
  return GF_EXP[GF_LOG[left] + GF_LOG[right]];
}

function createCrcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    return value >>> 0;
  });
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
