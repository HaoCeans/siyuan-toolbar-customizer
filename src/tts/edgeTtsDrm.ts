/**
 * Edge TTS Sec-MS-GEC v2（对齐 edge-tts ≥7.3 的 drm.generate_sec_ms_gec_v2）。
 * 旧版 v1（纯 SHA-256）已被服务端拒绝，握手返回 403。
 */

export const EDGE_TTS_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
export const EDGE_TTS_CHROMIUM_FULL_VERSION = "143.0.3650.75";
export const EDGE_TTS_CHROMIUM_MAJOR_VERSION =
  EDGE_TTS_CHROMIUM_FULL_VERSION.split(".", 1)[0]!;
export const EDGE_TTS_SEC_MS_GEC_VERSION = `2-${EDGE_TTS_CHROMIUM_FULL_VERSION}`;

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;
const U32 = 0xffffffffn;

const SHA256_INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
].map(BigInt);
const SHA256_STATE = [
  0xfd9fbea2, 0x91243ce7, 0xbe499094, 0xcd2e1e0a, 0x6c006f49, 0x04bd35ab,
  0xfeb0a7e4, 0x03effbd2,
].map(BigInt);
const SHA256_SCHEDULE = [
  0xeb24bf9e, 0x1558691f, 0xa0c09ee2, 0x0cfa32ba, 0xa622ee8c, 0xd1dd9491,
  0xc0dd25a0, 0xf9e70ab6, 0xf0c31573, 0x7058ce4e, 0x7188e606, 0x00e5ab33,
  0xd258b060, 0x72766564,
].map(BigInt);
const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
].map(BigInt);
const SHA256_ADJUSTMENT = 0xc9dc06a7n;
const SHA256_BLOCK_CONSTANTS = [
  ...SHA256_ROUND_CONSTANTS.slice(0, 14),
  SHA256_ADJUSTMENT,
  ...SHA256_ROUND_CONSTANTS.slice(15),
];
const SHA256_SIGMA0_ADJUSTMENT = 0x059c0b80n;
const SHA256_SIGMA1_ADJUSTMENT = 0x000b92c0n;

const CS64_COEFFICIENTS: ReadonlyArray<readonly [bigint, bigint]> = [
  [0xe82e91b1n, 0xb32700d0n],
  [0x44de24c6n, 0x88dff51dn],
  [0x3beb65bcn, 0x29514038n],
  [0xc89c5933n, 0xb328cbdfn],
  [0x8d1ec211n, 0xd405b4d5n],
  [0x314ef5d5n, 0x26e55f3cn],
  [0xe92491b1n, 0x607801c6n],
  [0xf0a5b9d5n, 0x82b2c1fbn],
  [0x06064cf3n, 0xfa51a3dan],
  [0xda79fa60n, 0x207cc464n],
  [0xbed20560n, 0x3c3c74f3n],
  [0x89f9c9f8n, 0xd2d14b61n],
  [0x35fa38c6n, 0xbb04a2c1n],
  [0xcb49e3c6n, 0xc5626167n],
];
const CS64_FACTOR = 0x82893933n;
const CS64_ADJUSTMENT0 = 0xf2f90b1an;
const CS64_ADJUSTMENT1 = 0x0b1a0000n;

let clockSkewSeconds = 0;
const sha256InitCache = new Map<string, bigint[]>();
const tokenHashCache = new Map<string, readonly [string, string]>();

function u32(n: bigint): bigint {
  return n & U32;
}

function rol16(value: bigint): bigint {
  value = u32(value);
  return u32((value << 16n) | (value >> 16n));
}

function wordsLe4Even(data: Uint8Array): bigint[] {
  const pad = (4 - (data.length % 4)) % 4;
  const padded = pad ? new Uint8Array(data.length + pad) : data;
  if (pad) {
    padded.set(data);
  }
  if (padded.length === 0) return [];
  const words: bigint[] = [];
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let i = 0; i < padded.length; i += 4) {
    words.push(BigInt(view.getUint32(i, true)));
  }
  if (words.length % 2) words.push(0n);
  return words;
}

function sigma0(value: bigint): bigint {
  return u32(
    (value >> 7n) ^ (value << 25n) ^ (value >> 18n) ^ (value << 14n) ^ (value >> 3n),
  );
}

function sigma1(value: bigint): bigint {
  return u32(
    (value >> 17n) ^
      (value << 15n) ^
      (value >> 19n) ^
      (value << 13n) ^
      (value >> 10n),
  );
}

function sha256Rounds(
  state: readonly bigint[],
  words: readonly bigint[],
  firstRound = 0,
): bigint[] {
  let [a, b, c, d, e, f, g, h] = state;
  const constants =
    firstRound === 14 ? SHA256_BLOCK_CONSTANTS : SHA256_ROUND_CONSTANTS;
  const aligned = Math.min(64, Math.floor((firstRound + 7) / 8) * 8);
  for (let index = firstRound; index < aligned; index++) {
    const rotE = e! * 0x100000001n;
    const rotA = a! * 0x100000001n;
    const t1 =
      h! +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (g! ^ (e! & (f! ^ g!))) +
      constants[index]! +
      words[index]!;
    const t2 =
      ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
      ((a! & b!) | (c! & (a! | b!)));
    [a, b, c, d, e, f, g, h] = [
      u32(t1 + t2),
      a!,
      b!,
      c!,
      u32(d! + t1),
      e!,
      f!,
      g!,
    ];
  }
  for (let index = aligned; index < 64; index += 8) {
    let rotE = e! * 0x100000001n;
    let rotA = a! * 0x100000001n;
    let t1 =
      h! +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (g! ^ (e! & (f! ^ g!))) +
      constants[index]! +
      words[index]!;
    d = u32(d! + t1);
    h = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((a! & b!) | (c! & (a! | b!))),
    );
    rotE = d * 0x100000001n;
    rotA = h * 0x100000001n;
    t1 =
      g! +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (f! ^ (d & (e! ^ f!))) +
      constants[index + 1]! +
      words[index + 1]!;
    c = u32(c! + t1);
    g = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((h & a!) | (b! & (h | a!))),
    );
    rotE = c * 0x100000001n;
    rotA = g * 0x100000001n;
    t1 =
      f! +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (e! ^ (c & (d ^ e!))) +
      constants[index + 2]! +
      words[index + 2]!;
    b = u32(b! + t1);
    f = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((g & h) | (a! & (g | h))),
    );
    rotE = b * 0x100000001n;
    rotA = f * 0x100000001n;
    t1 =
      e! +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (d ^ (b & (c ^ d))) +
      constants[index + 3]! +
      words[index + 3]!;
    a = u32(a! + t1);
    e = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((f & g) | (h & (f | g))),
    );
    rotE = a * 0x100000001n;
    rotA = e * 0x100000001n;
    t1 =
      d +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (c ^ (a & (b ^ c))) +
      constants[index + 4]! +
      words[index + 4]!;
    h = u32(h + t1);
    d = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((e & f) | (g & (e | f))),
    );
    rotE = h * 0x100000001n;
    rotA = d * 0x100000001n;
    t1 =
      c +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (b ^ (h & (a ^ b))) +
      constants[index + 5]! +
      words[index + 5]!;
    g = u32(g + t1);
    c = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((d & e) | (f & (d | e))),
    );
    rotE = g * 0x100000001n;
    rotA = c * 0x100000001n;
    t1 =
      b +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (a ^ (g & (h ^ a))) +
      constants[index + 6]! +
      words[index + 6]!;
    f = u32(f + t1);
    b = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((c & d) | (e & (c | d))),
    );
    rotE = f * 0x100000001n;
    rotA = b * 0x100000001n;
    t1 =
      a +
      ((rotE >> 6n) ^ (rotE >> 11n) ^ (rotE >> 25n)) +
      (h ^ (f & (g ^ h))) +
      constants[index + 7]! +
      words[index + 7]!;
    e = u32(e + t1);
    a = u32(
      t1 +
        ((rotA >> 2n) ^ (rotA >> 13n) ^ (rotA >> 22n)) +
        ((b & c) | (d & (b | c))),
    );
  }
  return [a!, b!, c!, d!, e!, f!, g!, h!];
}

function expandSha256Schedule(words: bigint[], firstWord = 16): void {
  for (let index = firstWord; index < 64; index++) {
    const x = words[index - 2]!;
    const y = words[index - 15]!;
    const s1 = (x >> 17n) ^ (x << 15n) ^ (x >> 19n) ^ (x << 13n) ^ (x >> 10n);
    const s0 = (y >> 7n) ^ (y << 25n) ^ (y >> 18n) ^ (y << 14n) ^ (y >> 3n);
    words.push(u32(s1 + words[index - 7]! + s0 + words[index - 16]!));
  }
}

function readBeUint(data: Uint8Array, start: number, len: number): bigint {
  let n = 0n;
  for (let i = 0; i < len; i++) {
    n = (n << 8n) | BigInt(data[start + i]!);
  }
  return n;
}

function sha256Init(data: Uint8Array): bigint[] {
  const key = toHexLower(data);
  const cached = sha256InitCache.get(key);
  if (cached) return cached;

  const words: bigint[] = Array(14).fill(0n);
  words.push(readBeUint(data, 0, 3));
  words.push(readBeUint(data, 3, 4));
  for (let index = 16; index < 30; index++) {
    let value = SHA256_SCHEDULE[index - 16]!;
    if (index - 2 >= 14) {
      value +=
        index === 16
          ? sigma1(words[index - 2]!) ^ SHA256_SIGMA1_ADJUSTMENT
          : sigma1(words[index - 2]!);
    }
    if (index - 7 >= 14) value += words[index - 7]!;
    if (index - 15 >= 14) {
      value +=
        index === 29
          ? sigma0(words[index - 15]!) ^ SHA256_SIGMA0_ADJUSTMENT
          : sigma0(words[index - 15]!);
    }
    words.push(u32(value));
  }
  words.push(
    u32(
      sigma1(words[28]!) +
        words[23]! +
        sigma0(words[15]!) +
        words[14]! +
        SHA256_ADJUSTMENT -
        SHA256_ROUND_CONSTANTS[14]!,
    ),
  );
  expandSha256Schedule(words, 31);
  const working = sha256Rounds(SHA256_STATE, words, 14);
  const result = SHA256_INITIAL.map((x, i) => u32(x + working[i]!));
  sha256InitCache.clear();
  sha256InitCache.set(key, result);
  return result;
}

function sha256Digest(data: Uint8Array): Uint8Array {
  if (data.length < 7) {
    throw new Error("Token salt must contain at least seven bytes");
  }
  const length = 57 + data.length;
  const tail = data.subarray(7);
  const zeroPad = ((55 - length) % 64 + 64) % 64;
  const padded = new Uint8Array(tail.length + 1 + zeroPad + 8);
  padded.set(tail, 0);
  padded[tail.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setBigUint64(padded.length - 8, BigInt(length * 8), false);

  let state = sha256Init(data.subarray(0, 7));
  for (let offset = 0; offset < padded.length; offset += 64) {
    const words: bigint[] = [];
    for (let i = 0; i < 16; i++) {
      words.push(BigInt(view.getUint32(offset + i * 4, false)));
    }
    expandSha256Schedule(words);
    const working = sha256Rounds(state, words);
    state = state.map((x, i) => u32(x + working[i]!));
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) {
    outView.setUint32(i * 4, Number(state[i]!), false);
  }
  return out;
}

function cs64Digest(data: Uint8Array, digest: Uint8Array): [bigint, bigint] {
  const digView = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
  const keyA = BigInt(digView.getUint32(0, true)) | 1n;
  const keyB = BigInt(digView.getUint32(4, true)) | 1n;
  const factors: [bigint, bigint] = [
    u32(keyA * CS64_FACTOR),
    u32(keyB * CS64_FACTOR),
  ];
  const terms: bigint[] = CS64_COEFFICIENTS.map(([coefficient], index) =>
    u32(coefficient * factors[index % 2]!),
  );
  const offsets: bigint[] = CS64_COEFFICIENTS.map(([, offset]) => offset);

  const prefixed = new Uint8Array(data.length + 1);
  prefixed.set(data, 1);
  wordsLe4Even(prefixed).forEach((word, index) => {
    let term = word * (index % 2 === 0 ? keyA : keyB);
    let offset = rol16(word) * (index % 2 === 0 ? 0xef0569fbn : 0xc31713dbn);
    if (index === 0) {
      term += CS64_ADJUSTMENT0 * factors[0]!;
      offset += CS64_ADJUSTMENT1;
    }
    terms.push(u32(term));
    offsets.push(u32(offset));
  });

  let swapAcc = 0n;
  let swapLast = 0n;
  let state = 0n;
  let acc = 0n;
  for (let index = 0; index < terms.length; index += 2) {
    const x = terms[index]!;
    const y = terms[index + 1]!;
    let t = rol16(u32(offsets[index]! + x));
    let q = u32(t * 0x76f50f34n);
    swapAcc += u32(rol16(q) * 0xc3efea97n + q);
    t = rol16(u32(offsets[index + 1]! + y));
    q = u32(t * 0x1881ce3cn);
    swapLast = u32(rol16(q) * 0x35bd1ec9n + q);
    swapAcc = u32(swapAcc + swapLast);

    state = u32(state * keyA + x);
    state = u32(rol16(state) * 0xcf98b111n);
    state = u32(rol16(state) * 0x87085b9fn);
    state = u32(rol16(state) * 0x12ceb96dn);
    state = u32(rol16(state) * 0x257e1d83n);
    acc += state;
    t = u32(state * keyB + y);
    t = u32(rol16(t) * 0xa27416f5n);
    t = u32(rol16(t) * 0xd38396ffn);
    state = u32(rol16(u32(rol16(t) * 0x7c932b89n)) * 0xbfa49f69n);
    acc = u32(acc + state);
  }
  return [swapLast ^ state, swapAcc ^ acc];
}

function toHexLower(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function toHexUpper(bytes: Uint8Array): string {
  return toHexLower(bytes).toUpperCase();
}

function tokenHash(data: Uint8Array): readonly [string, string] {
  const key = toHexLower(data);
  const cached = tokenHashCache.get(key);
  if (cached) return cached;
  const digest = sha256Digest(data);
  const [w0, w1] = cs64Digest(data, digest);
  const cs64 = new Uint8Array(8);
  const view = new DataView(cs64.buffer);
  view.setUint32(0, Number(u32(w0)), true);
  view.setUint32(4, Number(u32(w1)), true);
  const result = [toHexUpper(cs64), toHexUpper(digest)] as const;
  tokenHashCache.clear();
  tokenHashCache.set(key, result);
  return result;
}

export function getUnixTimestamp(): number {
  return Date.now() / 1000 + clockSkewSeconds;
}

export function adjClockSkewSeconds(skewSeconds: number): void {
  clockSkewSeconds += skewSeconds;
}

/** 测试用：重置时钟偏差 */
export function resetClockSkewForTests(): void {
  clockSkewSeconds = 0;
}

export function parseRfc2616Date(date: string): number | null {
  const ms = Date.parse(date);
  return Number.isFinite(ms) ? ms / 1000 : null;
}

/** 根据 403 响应 Date 头校正时钟偏差 */
export function adjustClockSkewFromDateHeader(
  dateHeader: string | undefined,
): boolean {
  if (!dateHeader) return false;
  const server = parseRfc2616Date(dateHeader);
  if (server == null) return false;
  adjClockSkewSeconds(server - getUnixTimestamp());
  return true;
}

/**
 * 生成 Sec-MS-GEC v2：`<16 hex>-<64 hex>`。
 * @param unixTimestamp 可选，便于单测固定时间窗口
 */
export function generateSecMsGecV2(unixTimestamp?: number): string {
  let ticks = unixTimestamp ?? getUnixTimestamp();
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= S_TO_NS / 100;
  const strToHash = new TextEncoder().encode(
    `${Math.trunc(ticks).toString()}${EDGE_TTS_TRUSTED_CLIENT_TOKEN}`,
  );
  const [cs64, sha256] = tokenHash(strToHash);
  return `${cs64}-${sha256}`;
}

export function generateSecMsGec(): string {
  return generateSecMsGecV2();
}
