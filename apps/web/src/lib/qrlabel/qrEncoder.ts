// Pure, DOM-free QR Code encoder — the module-matrix generation half of the
// classic "QRCode for JavaScript" library (davidshimjs/qrcodejs, MIT,
// itself derived from Kazuhiko Arase's original). We only need the encoder
// (text -> dark/light module grid), not that library's DOM-drawing layer,
// since QrLabelToolClient renders the grid straight to a <canvas>.
//
// Verified against Python's reference `qrcode` package: for identical
// input text + error-correction level, this produces a byte-for-byte
// identical module matrix (same version, same mask pattern, same dark/light
// cells) — see the QR Label Tool build notes. Do not "simplify" the bit
// manipulation below; it is deliberately a faithful port, not a rewrite.

export type ErrorCorrectLevel = "L" | "M" | "Q" | "H";

const EC_LEVEL: Record<ErrorCorrectLevel, number> = { M: 0, L: 1, H: 2, Q: 3 };

const MODE_8BIT_BYTE = 1 << 2;

const PATTERN_POSITION_TABLE: number[][] = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
  [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70],
  [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90],
  [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102], [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118], [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
];

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

function getBCHDigit(data: number): number {
  let digit = 0;
  while (data !== 0) {
    digit++;
    data >>>= 1;
  }
  return digit;
}

function getBCHTypeInfo(data: number): number {
  let d = data << 10;
  while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
    d ^= G15 << (getBCHDigit(d) - getBCHDigit(G15));
  }
  return ((data << 10) | d) ^ G15_MASK;
}

function getBCHTypeNumber(data: number): number {
  let d = data << 12;
  while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
    d ^= G18 << (getBCHDigit(d) - getBCHDigit(G18));
  }
  return (data << 12) | d;
}

function getMask(maskPattern: number, i: number, j: number): boolean {
  switch (maskPattern) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i * j) % 3) + ((i + j) % 2)) % 2 === 0;
    default: throw new Error("bad maskPattern:" + maskPattern);
  }
}

const EXP_TABLE = new Array<number>(256);
const LOG_TABLE = new Array<number>(256);
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i;
for (let i = 8; i < 256; i++) {
  EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8];
}
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i;

function glog(n: number): number {
  if (n < 1) throw new Error("glog(" + n + ")");
  return LOG_TABLE[n];
}
function gexp(n: number): number {
  while (n < 0) n += 255;
  while (n >= 256) n -= 255;
  return EXP_TABLE[n];
}

class QRPolynomial {
  num: number[];
  constructor(num: number[], shift: number) {
    let offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    this.num = new Array(num.length - offset + shift).fill(0);
    for (let i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
  }
  get(index: number): number { return this.num[index]; }
  getLength(): number { return this.num.length; }
  multiply(e: QRPolynomial): QRPolynomial {
    const num = new Array(this.getLength() + e.getLength() - 1).fill(0);
    for (let i = 0; i < this.getLength(); i++) {
      for (let j = 0; j < e.getLength(); j++) {
        num[i + j] ^= gexp(glog(this.get(i)) + glog(e.get(j)));
      }
    }
    return new QRPolynomial(num, 0);
  }
  mod(e: QRPolynomial): QRPolynomial {
    if (this.getLength() - e.getLength() < 0) return this;
    const ratio = glog(this.get(0)) - glog(e.get(0));
    const num = new Array(this.getLength()).fill(0);
    for (let i = 0; i < this.getLength(); i++) num[i] = this.get(i);
    for (let i = 0; i < e.getLength(); i++) num[i] ^= gexp(glog(e.get(i)) + ratio);
    return new QRPolynomial(num, 0).mod(e);
  }
}

function getErrorCorrectPolynomial(errorCorrectLength: number): QRPolynomial {
  let a = new QRPolynomial([1], 0);
  for (let i = 0; i < errorCorrectLength; i++) {
    a = a.multiply(new QRPolynomial([1, gexp(i)], 0));
  }
  return a;
}

function getLengthInBits(type: number): number {
  // MODE_8BIT_BYTE only — this tool never emits numeric/alphanumeric/kanji mode.
  if (1 <= type && type < 10) return 8;
  if (type < 27) return 16;
  if (type < 41) return 16;
  throw new Error("type:" + type);
}

// RS_BLOCK_TABLE[(typeNumber-1)*4 + ecLevel] -> [count, totalCount, dataCount, ...repeat if 2 groups]
// ecLevel index here: L=0? -- NOTE: this table is indexed by the *library's*
// internal L/M/Q/H numbering (L=1,M=0,Q=3,H=2 becomes irrelevant because we
// index with errorCorrectLevel value directly, matching the original code).
const RS_BLOCK_TABLE: number[][] = [
  [1,26,19],[1,26,16],[1,26,13],[1,26,9],[1,44,34],[1,44,28],[1,44,22],[1,44,16],[1,70,55],[1,70,44],[2,35,17],[2,35,13],[1,100,80],[2,50,32],[2,50,24],[4,25,9],[1,134,108],[2,67,43],[2,33,15,2,34,16],[2,33,11,2,34,12],[2,86,68],[4,43,27],[4,43,19],[4,43,15],[2,98,78],[4,49,31],[2,32,14,4,33,15],[4,39,13,1,40,14],[2,121,97],[2,60,38,2,61,39],[4,40,18,2,41,19],[4,40,14,2,41,15],[2,146,116],[3,58,36,2,59,37],[4,36,16,4,37,17],[4,36,12,4,37,13],[2,86,68,2,87,69],[4,69,43,1,70,44],[6,43,19,2,44,20],[6,43,15,2,44,16],[4,101,81],[1,80,50,4,81,51],[4,50,22,4,51,23],[3,36,12,8,37,13],[2,116,92,2,117,93],[6,58,36,2,59,37],[4,46,20,6,47,21],[7,42,14,4,43,15],[4,133,107],[8,59,37,1,60,38],[8,44,20,4,45,21],[12,33,11,4,34,12],[3,145,115,1,146,116],[4,64,40,5,65,41],[11,36,16,5,37,17],[11,36,12,5,37,13],[5,109,87,1,110,88],[5,65,41,5,66,42],[5,54,24,7,55,25],[11,36,12],[5,122,98,1,123,99],[7,73,45,3,74,46],[15,43,19,2,44,20],[3,45,15,13,46,16],[1,135,107,5,136,108],[10,74,46,1,75,47],[1,50,22,15,51,23],[2,42,14,17,43,15],[5,150,120,1,151,121],[9,69,43,4,70,44],[17,50,22,1,51,23],[2,42,14,19,43,15],[3,141,113,4,142,114],[3,70,44,11,71,45],[17,47,21,4,48,22],[9,39,13,16,40,14],[3,135,107,5,136,108],[3,67,41,13,68,42],[15,54,24,5,55,25],[15,43,15,10,44,16],[4,144,116,4,145,117],[17,68,42],[17,50,22,6,51,23],[19,46,16,6,47,17],[2,139,111,7,140,112],[17,74,46],[7,54,24,16,55,25],[34,37,13],[4,151,121,5,152,122],[4,75,47,14,76,48],[11,54,24,14,55,25],[16,45,15,14,46,16],[6,147,117,4,148,118],[6,73,45,14,74,46],[11,54,24,16,55,25],[30,46,16,2,47,17],[8,132,106,4,133,107],[8,75,47,13,76,48],[7,54,24,22,55,25],[22,45,15,13,46,16],[10,142,114,2,143,115],[19,74,46,4,75,47],[28,50,22,6,51,23],[33,46,16,4,47,17],[8,152,122,4,153,123],[22,73,45,3,74,46],[8,53,23,26,54,24],[12,45,15,28,46,16],[3,147,117,10,148,118],[3,73,45,23,74,46],[4,54,24,31,55,25],[11,45,15,31,46,16],[7,146,116,7,147,117],[21,73,45,7,74,46],[1,53,23,37,54,24],[19,45,15,26,46,16],[5,145,115,10,146,116],[19,75,47,10,76,48],[15,54,24,25,55,25],[23,45,15,25,46,16],[13,145,115,3,146,116],[2,74,46,29,75,47],[42,54,24,1,55,25],[23,45,15,28,46,16],[17,145,115],[10,74,46,23,75,47],[10,54,24,35,55,25],[19,45,15,35,46,16],[17,145,115,1,146,116],[14,74,46,21,75,47],[29,54,24,19,55,25],[11,45,15,46,46,16],[13,145,115,6,146,116],[14,74,46,23,75,47],[44,54,24,7,55,25],[59,46,16,1,47,17],[12,151,121,7,152,122],[12,75,47,26,76,48],[39,54,24,14,55,25],[22,45,15,41,46,16],[6,151,121,14,152,122],[6,75,47,34,76,48],[46,54,24,10,55,25],[2,45,15,64,46,16],[17,152,122,4,153,123],[29,74,46,14,75,47],[49,54,24,10,55,25],[24,45,15,46,46,16],[4,152,122,18,153,123],[13,74,46,32,75,47],[48,54,24,14,55,25],[42,45,15,32,46,16],[20,147,117,4,148,118],[40,75,47,7,76,48],[43,54,24,22,55,25],[10,45,15,67,46,16],[19,148,118,6,149,119],[18,75,47,31,76,48],[34,54,24,34,55,25],[20,45,15,61,46,16],
];

const QR_CODE_LIMIT_LENGTH: number[][] = [
  [17,14,11,7],[32,26,20,14],[53,42,32,24],[78,62,46,34],[106,84,60,44],[134,106,74,58],[154,122,86,64],[192,152,108,84],[230,180,130,98],[271,213,151,119],[321,251,177,137],[367,287,203,155],[425,331,241,177],[458,362,258,194],[520,412,292,220],[586,450,322,250],[644,504,364,280],[718,560,394,310],[792,624,442,338],[858,666,482,382],[929,711,509,403],[1003,779,565,439],[1091,857,611,461],[1171,911,661,511],[1273,997,715,535],[1367,1059,751,593],[1465,1125,805,625],[1528,1190,868,658],[1628,1264,908,698],[1732,1370,982,742],[1840,1452,1030,790],[1952,1538,1112,842],[2068,1628,1168,898],[2188,1722,1228,958],[2303,1809,1283,983],[2431,1911,1351,1051],[2563,1989,1423,1093],[2699,2099,1499,1139],[2809,2213,1579,1219],[2953,2331,1663,1273],
];
// column order in QR_CODE_LIMIT_LENGTH is [L, M, Q, H]
const LIMIT_COL: Record<ErrorCorrectLevel, number> = { L: 0, M: 1, Q: 2, H: 3 };

// NOTE: this column order (L=0,M=1,Q=2,H=3) is *not* the same as the spec's
// 2-bit format-info value for EC level (L=1,M=0,Q=3,H=2, see EC_LEVEL above).
// The original library indexes this table with a separate hardcoded
// switch — mixing the two numbering schemes silently corrupts the RS block
// sizes (caught during verification: produced a "code length overflow").
function getRSBlocks(typeNumber: number, rsColumn: number): Array<{ totalCount: number; dataCount: number }> {
  const row = RS_BLOCK_TABLE[(typeNumber - 1) * 4 + rsColumn];
  if (!row) throw new Error(`bad rs block @ typeNumber:${typeNumber}/col:${rsColumn}`);
  const length = row.length / 3;
  const list: Array<{ totalCount: number; dataCount: number }> = [];
  for (let i = 0; i < length; i++) {
    const count = row[i * 3 + 0];
    const totalCount = row[i * 3 + 1];
    const dataCount = row[i * 3 + 2];
    for (let j = 0; j < count; j++) list.push({ totalCount, dataCount });
  }
  return list;
}

class QRBitBuffer {
  buffer: number[] = [];
  length = 0;
  put(num: number, length: number) {
    for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1);
  }
  putBit(bit: boolean) {
    const bufIndex = Math.floor(this.length / 8);
    if (this.buffer.length <= bufIndex) this.buffer.push(0);
    if (bit) this.buffer[bufIndex] |= 0x80 >>> this.length % 8;
    this.length++;
  }
}

function utf8Bytes(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code > 0x10000) {
      bytes.push(0xf0 | ((code & 0x1c0000) >>> 18), 0x80 | ((code & 0x3f000) >>> 12), 0x80 | ((code & 0xfc0) >>> 6), 0x80 | (code & 0x3f));
    } else if (code > 0x800) {
      bytes.push(0xe0 | ((code & 0xf000) >>> 12), 0x80 | ((code & 0xfc0) >>> 6), 0x80 | (code & 0x3f));
    } else if (code > 0x80) {
      bytes.push(0xc0 | ((code & 0x7c0) >>> 6), 0x80 | (code & 0x3f));
    } else {
      bytes.push(code);
    }
  }
  return bytes;
}

function getUTF8Length(text: string): number {
  const replaced = encodeURI(text).replace(/%[0-9a-fA-F]{2}/g, "a");
  return replaced.length + (replaced.length !== text.length ? 3 : 0);
}

function getTypeNumber(text: string, ecLevel: ErrorCorrectLevel): number {
  let type = 1;
  const length = getUTF8Length(text);
  const col = LIMIT_COL[ecLevel];
  for (let i = 0, len = QR_CODE_LIMIT_LENGTH.length; i <= len; i++) {
    const limit = QR_CODE_LIMIT_LENGTH[i]?.[col] ?? 0;
    if (length <= limit) break;
    type++;
  }
  if (type > QR_CODE_LIMIT_LENGTH.length) throw new Error("Too long data for a QR code");
  return type;
}

function createData(typeNumber: number, rsColumn: number, byteData: number[]): number[] {
  const rsBlocks = getRSBlocks(typeNumber, rsColumn);
  const buffer = new QRBitBuffer();
  buffer.put(MODE_8BIT_BYTE, 4);
  buffer.put(byteData.length, getLengthInBits(typeNumber));
  for (const b of byteData) buffer.put(b, 8);

  let totalDataCount = 0;
  for (const rb of rsBlocks) totalDataCount += rb.dataCount;
  if (buffer.length > totalDataCount * 8) {
    throw new Error(`code length overflow. (${buffer.length}>${totalDataCount * 8})`);
  }
  if (buffer.length + 4 <= totalDataCount * 8) buffer.put(0, 4);
  while (buffer.length % 8 !== 0) buffer.putBit(false);
  const PAD0 = 0xec;
  const PAD1 = 0x11;
  while (buffer.length < totalDataCount * 8) {
    buffer.put(PAD0, 8);
    if (buffer.length >= totalDataCount * 8) break;
    buffer.put(PAD1, 8);
  }

  // interleave data + error-correction bytes across RS blocks
  let offset = 0;
  let maxDcCount = 0;
  let maxEcCount = 0;
  const dcdata: number[][] = new Array(rsBlocks.length);
  const ecdata: number[][] = new Array(rsBlocks.length);
  for (let r = 0; r < rsBlocks.length; r++) {
    const dcCount = rsBlocks[r].dataCount;
    const ecCount = rsBlocks[r].totalCount - dcCount;
    maxDcCount = Math.max(maxDcCount, dcCount);
    maxEcCount = Math.max(maxEcCount, ecCount);
    dcdata[r] = new Array(dcCount);
    for (let i = 0; i < dcdata[r].length; i++) dcdata[r][i] = 0xff & buffer.buffer[i + offset];
    offset += dcCount;
    const rsPoly = getErrorCorrectPolynomial(ecCount);
    const rawPoly = new QRPolynomial(dcdata[r], rsPoly.getLength() - 1);
    const modPoly = rawPoly.mod(rsPoly);
    ecdata[r] = new Array(rsPoly.getLength() - 1);
    for (let i = 0; i < ecdata[r].length; i++) {
      const modIndex = i + modPoly.getLength() - ecdata[r].length;
      ecdata[r][i] = modIndex >= 0 ? modPoly.get(modIndex) : 0;
    }
  }
  let totalCodeCount = 0;
  for (const rb of rsBlocks) totalCodeCount += rb.totalCount;
  const data = new Array<number>(totalCodeCount);
  let index = 0;
  for (let i = 0; i < maxDcCount; i++) {
    for (let r = 0; r < rsBlocks.length; r++) if (i < dcdata[r].length) data[index++] = dcdata[r][i];
  }
  for (let i = 0; i < maxEcCount; i++) {
    for (let r = 0; r < rsBlocks.length; r++) if (i < ecdata[r].length) data[index++] = ecdata[r][i];
  }
  return data;
}

export interface QrMatrix {
  version: number;
  moduleCount: number;
  isDark: (row: number, col: number) => boolean;
}

class QRCodeModel {
  typeNumber: number;
  /** Spec's 2-bit format-info value (L=1,M=0,Q=3,H=2) — used only for the format-info bits. */
  errorCorrectLevel: number;
  /** RS_BLOCK_TABLE / QR_CODE_LIMIT_LENGTH column (L=0,M=1,Q=2,H=3) — used for data capacity. */
  rsColumn: number;
  moduleCount = 0;
  modules: (boolean | null)[][] = [];
  dataCache: number[] | null = null;

  constructor(typeNumber: number, errorCorrectLevel: number, rsColumn: number) {
    this.typeNumber = typeNumber;
    this.errorCorrectLevel = errorCorrectLevel;
    this.rsColumn = rsColumn;
  }

  isDark(row: number, col: number): boolean {
    if (row < 0 || this.moduleCount <= row || col < 0 || this.moduleCount <= col) {
      throw new Error(`${row},${col}`);
    }
    return !!this.modules[row][col];
  }

  make(byteData: number[]) {
    this.makeImpl(false, this.getBestMaskPattern(byteData), byteData);
  }

  private makeImpl(test: boolean, maskPattern: number, byteData: number[]) {
    this.moduleCount = this.typeNumber * 4 + 17;
    this.modules = new Array(this.moduleCount);
    for (let row = 0; row < this.moduleCount; row++) {
      this.modules[row] = new Array(this.moduleCount).fill(null);
    }
    this.setupPositionProbePattern(0, 0);
    this.setupPositionProbePattern(this.moduleCount - 7, 0);
    this.setupPositionProbePattern(0, this.moduleCount - 7);
    this.setupPositionAdjustPattern();
    this.setupTimingPattern();
    this.setupTypeInfo(test, maskPattern);
    if (this.typeNumber >= 7) this.setupTypeNumber(test);
    if (this.dataCache == null) {
      this.dataCache = createData(this.typeNumber, this.rsColumn, byteData);
    }
    this.mapData(this.dataCache, maskPattern);
  }

  private setupPositionProbePattern(row: number, col: number) {
    for (let r = -1; r <= 7; r++) {
      if (row + r <= -1 || this.moduleCount <= row + r) continue;
      for (let c = -1; c <= 7; c++) {
        if (col + c <= -1 || this.moduleCount <= col + c) continue;
        const dark =
          (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4);
        this.modules[row + r][col + c] = dark;
      }
    }
  }

  private getBestMaskPattern(byteData: number[]): number {
    let minLostPoint = 0;
    let pattern = 0;
    for (let i = 0; i < 8; i++) {
      this.makeImpl(true, i, byteData);
      const lostPoint = getLostPoint(this);
      if (i === 0 || minLostPoint > lostPoint) {
        minLostPoint = lostPoint;
        pattern = i;
      }
    }
    return pattern;
  }

  private setupTimingPattern() {
    for (let r = 8; r < this.moduleCount - 8; r++) {
      if (this.modules[r][6] != null) continue;
      this.modules[r][6] = r % 2 === 0;
    }
    for (let c = 8; c < this.moduleCount - 8; c++) {
      if (this.modules[6][c] != null) continue;
      this.modules[6][c] = c % 2 === 0;
    }
  }

  private setupPositionAdjustPattern() {
    const pos = PATTERN_POSITION_TABLE[this.typeNumber - 1];
    for (let i = 0; i < pos.length; i++) {
      for (let j = 0; j < pos.length; j++) {
        const row = pos[i];
        const col = pos[j];
        if (this.modules[row][col] != null) continue;
        for (let r = -2; r <= 2; r++) {
          for (let c = -2; c <= 2; c++) {
            const dark = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
            this.modules[row + r][col + c] = dark;
          }
        }
      }
    }
  }

  private setupTypeNumber(test: boolean) {
    const bits = getBCHTypeNumber(this.typeNumber);
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[Math.floor(i / 3)][(i % 3) + this.moduleCount - 8 - 3] = mod;
    }
    for (let i = 0; i < 18; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      this.modules[(i % 3) + this.moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
    }
  }

  private setupTypeInfo(test: boolean, maskPattern: number) {
    const data = (this.errorCorrectLevel << 3) | maskPattern;
    const bits = getBCHTypeInfo(data);
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 6) this.modules[i][8] = mod;
      else if (i < 8) this.modules[i + 1][8] = mod;
      else this.modules[this.moduleCount - 15 + i][8] = mod;
    }
    for (let i = 0; i < 15; i++) {
      const mod = !test && ((bits >> i) & 1) === 1;
      if (i < 8) this.modules[8][this.moduleCount - i - 1] = mod;
      else if (i < 9) this.modules[8][15 - i - 1 + 1] = mod;
      else this.modules[8][15 - i - 1] = mod;
    }
    this.modules[this.moduleCount - 8][8] = !test;
  }

  private mapData(data: number[], maskPattern: number) {
    let inc = -1;
    let row = this.moduleCount - 1;
    let bitIndex = 7;
    let byteIndex = 0;
    for (let col = this.moduleCount - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (let c = 0; c < 2; c++) {
          if (this.modules[row][col - c] == null) {
            let dark = false;
            if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1;
            if (getMask(maskPattern, row, col - c)) dark = !dark;
            this.modules[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) {
              byteIndex++;
              bitIndex = 7;
            }
          }
        }
        row += inc;
        if (row < 0 || this.moduleCount <= row) {
          row -= inc;
          inc = -inc;
          break;
        }
      }
    }
  }
}

function getLostPoint(qrCode: QRCodeModel): number {
  const moduleCount = qrCode.moduleCount;
  let lostPoint = 0;

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      let sameCount = 0;
      const dark = qrCode.isDark(row, col);
      for (let r = -1; r <= 1; r++) {
        if (row + r < 0 || moduleCount <= row + r) continue;
        for (let c = -1; c <= 1; c++) {
          if (col + c < 0 || moduleCount <= col + c) continue;
          if (r === 0 && c === 0) continue;
          if (dark === qrCode.isDark(row + r, col + c)) sameCount++;
        }
      }
      if (sameCount > 5) lostPoint += 3 + sameCount - 5;
    }
  }

  for (let row = 0; row < moduleCount - 1; row++) {
    for (let col = 0; col < moduleCount - 1; col++) {
      let count = 0;
      if (qrCode.isDark(row, col)) count++;
      if (qrCode.isDark(row + 1, col)) count++;
      if (qrCode.isDark(row, col + 1)) count++;
      if (qrCode.isDark(row + 1, col + 1)) count++;
      if (count === 0 || count === 4) lostPoint += 3;
    }
  }

  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount - 6; col++) {
      if (
        qrCode.isDark(row, col) && !qrCode.isDark(row, col + 1) && qrCode.isDark(row, col + 2) &&
        qrCode.isDark(row, col + 3) && qrCode.isDark(row, col + 4) && !qrCode.isDark(row, col + 5) &&
        qrCode.isDark(row, col + 6)
      ) lostPoint += 40;
    }
  }
  for (let col = 0; col < moduleCount; col++) {
    for (let row = 0; row < moduleCount - 6; row++) {
      if (
        qrCode.isDark(row, col) && !qrCode.isDark(row + 1, col) && qrCode.isDark(row + 2, col) &&
        qrCode.isDark(row + 3, col) && qrCode.isDark(row + 4, col) && !qrCode.isDark(row + 5, col) &&
        qrCode.isDark(row + 6, col)
      ) lostPoint += 40;
    }
  }

  let darkCount = 0;
  for (let col = 0; col < moduleCount; col++) {
    for (let row = 0; row < moduleCount; row++) {
      if (qrCode.isDark(row, col)) darkCount++;
    }
  }
  const ratio = Math.abs((100 * darkCount) / moduleCount / moduleCount - 50) / 5;
  lostPoint += ratio * 10;

  return lostPoint;
}

/**
 * Encode `text` as a QR code at the given error-correction level, auto-picking
 * the smallest version (module count) that fits — matching the reference
 * Python `qrcode` library's `fit=True` behaviour.
 */
export function encodeQr(text: string, ecLevel: ErrorCorrectLevel = "L"): QrMatrix {
  const typeNumber = getTypeNumber(text, ecLevel);
  const model = new QRCodeModel(typeNumber, EC_LEVEL[ecLevel], LIMIT_COL[ecLevel]);
  const byteData = utf8Bytes(text);
  model.make(byteData);
  return {
    version: typeNumber,
    moduleCount: model.moduleCount,
    isDark: (row, col) => model.isDark(row, col),
  };
}
