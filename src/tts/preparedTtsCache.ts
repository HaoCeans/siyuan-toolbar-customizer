import { sha256 } from "@noble/hashes/sha2";
import { getFileBlob, putFile, removeFile } from "../api";

export const PREPARED_TTS_CACHE_SCHEMA_VERSION = 2;
export const PREPARED_TTS_CACHE_AUDIO_DIR = "/data/storage/petal/siyuan-toolbar-customizer/tts-cache/audio";
const CACHE_MANIFEST_DATA_KEY = "preparedTtsCacheManifest";
const DEFAULT_MAX_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 50;

export interface PreparedCacheDescriptor {
  docId: string;
  contentHash: string;
  mode: "free" | "api";
  provider: string;
  model: string;
  synthesisSchemaVersion: number;
  paragraphSchemaVersion: number;
  wavSchemaVersion: number;
  speed: number;
  speaker: string | number;
  start: number;
  end: number;
  autoReadAction: "stop" | "next" | "prev";
  trailingText?: string;
}

export interface PreparedTtsTiming {
  paragraphIndex: number;
  startTime: number;
  endTime: number;
}

export interface PreparedTtsCacheEntry {
  key: string;
  descriptor: PreparedCacheDescriptor;
  timings: PreparedTtsTiming[];
  duration: number;
  byteSize: number;
  path: string;
  createdAt: number;
  lastAccessedAt: number;
  startParagraph: number;
  endParagraph: number;
  completionSpeechIncluded: boolean;
}

export interface PutPreparedTtsCacheMetadata {
  timings: PreparedTtsTiming[];
  duration: number;
  startParagraph: number;
  endParagraph: number;
  completionSpeechIncluded?: boolean;
}

export interface PreparedTtsCacheOptions {
  maxBytes?: number;
  maxEntries?: number;
}

interface PreparedTtsCacheManifest {
  schemaVersion: number;
  entries: Record<string, PreparedTtsCacheEntry>;
}

let manifest: PreparedTtsCacheManifest = createEmptyManifest();
let initialized = false;
let maxBytes = DEFAULT_MAX_BYTES;
let maxEntries = DEFAULT_MAX_ENTRIES;
let operationQueue: Promise<unknown> = Promise.resolve();

function createEmptyManifest(): PreparedTtsCacheManifest {
  return { schemaVersion: PREPARED_TTS_CACHE_SCHEMA_VERSION, entries: {} };
}

function getPluginInstance(): any {
  const plugin = typeof window === "undefined" ? null : (window as any).__pluginInstance;
  if (!plugin) throw new Error("Prepared TTS cache requires an initialized plugin instance");
  return plugin;
}

function cloneDescriptor(descriptor: PreparedCacheDescriptor): PreparedCacheDescriptor {
  return {
    docId: descriptor.docId,
    contentHash: descriptor.contentHash,
    mode: descriptor.mode,
    provider: descriptor.provider,
    model: descriptor.model,
    synthesisSchemaVersion: descriptor.synthesisSchemaVersion,
    paragraphSchemaVersion: descriptor.paragraphSchemaVersion,
    wavSchemaVersion: descriptor.wavSchemaVersion,
    speed: descriptor.speed,
    speaker: descriptor.speaker,
    start: descriptor.start,
    end: descriptor.end,
    autoReadAction: descriptor.autoReadAction,
    ...(descriptor.trailingText === undefined ? {} : { trailingText: descriptor.trailingText }),
  };
}

function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Cache descriptor contains a non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter(key => record[key] !== undefined).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalSerialize(record[key])}`).join(",")}}`;
  }
  throw new Error(`Unsupported cache descriptor value: ${typeof value}`);
}

function bytesToHex(bytes: Uint8Array): string {
  let result = "";
  for (const byte of bytes) result += byte.toString(16).padStart(2, "0");
  return result;
}

async function isValidPreparedWav(blob: Blob, expectedByteSize?: number): Promise<boolean> {
  if (blob.size < 44 || (expectedByteSize !== undefined && blob.size !== expectedByteSize)) return false;
  const bytes = new Uint8Array(await blob.slice(0, 44).arrayBuffer());
  const ascii = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (ascii(0, 4) !== "RIFF" || ascii(8, 4) !== "WAVE" || ascii(12, 4) !== "fmt " || ascii(36, 4) !== "data") return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(4, true) + 8 === blob.size
    && view.getUint32(40, true) + 44 === blob.size
    && view.getUint16(20, true) === 1
    && view.getUint16(22, true) === 1
    && view.getUint16(34, true) === 16;
}

function isCacheEntry(value: unknown): value is PreparedTtsCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<PreparedTtsCacheEntry>;
  const descriptor = entry.descriptor as Partial<PreparedCacheDescriptor> | undefined;
  const validDescriptor = Boolean(descriptor)
    && typeof descriptor!.docId === "string"
    && typeof descriptor!.contentHash === "string"
    && (descriptor!.mode === "free" || descriptor!.mode === "api")
    && typeof descriptor!.provider === "string"
    && typeof descriptor!.model === "string"
    && Number.isFinite(descriptor!.synthesisSchemaVersion)
    && Number.isFinite(descriptor!.paragraphSchemaVersion)
    && Number.isFinite(descriptor!.wavSchemaVersion)
    && Number.isFinite(descriptor!.speed)
    && (typeof descriptor!.speaker === "string" || Number.isFinite(descriptor!.speaker))
    && Number.isInteger(descriptor!.start)
    && Number.isInteger(descriptor!.end)
    && descriptor!.start! >= 0
    && descriptor!.end! >= descriptor!.start!
    && (descriptor!.autoReadAction === "stop" || descriptor!.autoReadAction === "next" || descriptor!.autoReadAction === "prev")
    && (descriptor!.trailingText === undefined || typeof descriptor!.trailingText === "string");
  if (!validDescriptor) return false;
  if (typeof entry.key !== "string" || !/^[a-f0-9]{64}$/.test(entry.key)) return false;
  if (typeof entry.path !== "string" || !Number.isFinite(entry.byteSize) || entry.byteSize! < 44) return false;
  if (!Number.isFinite(entry.duration) || entry.duration! <= 0) return false;
  if (!Number.isFinite(entry.createdAt) || !Number.isFinite(entry.lastAccessedAt)) return false;
  if (!Number.isInteger(entry.startParagraph) || !Number.isInteger(entry.endParagraph)) return false;
  if (entry.startParagraph! !== descriptor!.start || entry.endParagraph! !== descriptor!.end) return false;
  if (typeof entry.completionSpeechIncluded !== "boolean" || !Array.isArray(entry.timings)) return false;
  let previousEnd = 0;
  for (const timing of entry.timings) {
    if (!timing || typeof timing !== "object") return false;
    const candidate = timing as Partial<PreparedTtsTiming>;
    if (!Number.isInteger(candidate.paragraphIndex)
      || !Number.isFinite(candidate.startTime)
      || !Number.isFinite(candidate.endTime)
      || candidate.paragraphIndex! < entry.startParagraph!
      || candidate.paragraphIndex! > entry.endParagraph!
      || candidate.startTime! < previousEnd
      || candidate.endTime! <= candidate.startTime!
      || candidate.endTime! > entry.duration! + 0.01) return false;
    previousEnd = candidate.endTime!;
  }
  return entry.timings.length === entry.endParagraph! - entry.startParagraph! + 1
    && buildPreparedTtsCacheKey(descriptor as PreparedCacheDescriptor) === entry.key;
}

function migrateManifest(value: unknown): PreparedTtsCacheManifest {
  if (!value || typeof value !== "object") return createEmptyManifest();
  const candidate = value as Partial<PreparedTtsCacheManifest>;
  if (candidate.schemaVersion !== PREPARED_TTS_CACHE_SCHEMA_VERSION || !candidate.entries || typeof candidate.entries !== "object") {
    return createEmptyManifest();
  }

  const entries: Record<string, PreparedTtsCacheEntry> = {};
  for (const [key, entry] of Object.entries(candidate.entries)) {
    if (isCacheEntry(entry) && entry.key === key && entry.path === getPreparedTtsAudioPath(key)) entries[key] = entry;
  }
  return { schemaVersion: PREPARED_TTS_CACHE_SCHEMA_VERSION, entries };
}

function enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function saveManifest(): Promise<void> {
  const plugin = await getPluginInstance();
  await plugin.saveData(CACHE_MANIFEST_DATA_KEY, manifest);
}

async function ensureInitialized(): Promise<void> {
  if (!initialized) await initPreparedTtsCache();
}

function cloneEntry(entry: PreparedTtsCacheEntry): PreparedTtsCacheEntry {
  return {
    ...entry,
    descriptor: cloneDescriptor(entry.descriptor),
    timings: entry.timings.map(timing => ({ ...timing })),
  };
}

async function evictOverflowEntries(protectedKey: string): Promise<PreparedTtsCacheEntry[]> {
  const removed: PreparedTtsCacheEntry[] = [];
  const sorted = Object.values(manifest.entries)
    .filter(entry => entry.key !== protectedKey)
    .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  let byteSize = Object.values(manifest.entries).reduce((sum, entry) => sum + entry.byteSize, 0);
  let entryCount = Object.keys(manifest.entries).length;

  while ((byteSize > maxBytes || entryCount > maxEntries) && sorted.length > 0) {
    const entry = sorted.shift()!;
    delete manifest.entries[entry.key];
    removed.push(entry);
    byteSize -= entry.byteSize;
    entryCount--;
  }
  return removed;
}

export function hashPreparedTtsContent(text: string): string {
  return bytesToHex(sha256(new TextEncoder().encode(text)));
}

export function buildPreparedTtsCacheKey(descriptor: PreparedCacheDescriptor): string {
  const canonical = canonicalSerialize(cloneDescriptor(descriptor));
  return hashPreparedTtsContent(canonical);
}

export function getPreparedTtsAudioPath(key: string): string {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid prepared TTS cache key");
  return `${PREPARED_TTS_CACHE_AUDIO_DIR}/${key}.wav`;
}

export async function initPreparedTtsCache(options: PreparedTtsCacheOptions = {}): Promise<void> {
  return enqueueOperation(async () => {
    if (initialized) return;
    maxBytes = Math.max(0, options.maxBytes ?? DEFAULT_MAX_BYTES);
    maxEntries = Math.max(0, options.maxEntries ?? DEFAULT_MAX_ENTRIES);

    const plugin = await getPluginInstance();
    manifest = migrateManifest(await plugin.loadData(CACHE_MANIFEST_DATA_KEY));
    let changed = false;
    for (const [key, entry] of Object.entries(manifest.entries)) {
      const blob = await getFileBlob(entry.path);
      if (!blob || !await isValidPreparedWav(blob, entry.byteSize)) {
        delete manifest.entries[key];
        changed = true;
        if (blob) await removeFile(entry.path);
      }
    }
    initialized = true;
    if (changed) await saveManifest();
  });
}

export async function getPreparedTtsCacheEntry(key: string, shouldTouch = true): Promise<PreparedTtsCacheEntry | null> {
  await ensureInitialized();
  const entry = manifest.entries[key];
  if (!entry) return null;
  if (shouldTouch) await touchPreparedTtsCacheEntry(key);
  return cloneEntry(manifest.entries[key] || entry);
}

export async function putPreparedTtsWav(
  descriptor: PreparedCacheDescriptor,
  wav: Blob,
  metadata: PutPreparedTtsCacheMetadata,
): Promise<PreparedTtsCacheEntry> {
  await ensureInitialized();
  return enqueueOperation(async () => {
    const key = buildPreparedTtsCacheKey(descriptor);
    const path = getPreparedTtsAudioPath(key);
    const previousManifest = manifest;
    const previousBlob = previousManifest.entries[key] ? await getFileBlob(path) : null;
    if (!await putFile(path, false, wav)) throw new Error(`Failed to write prepared TTS WAV: ${path}`);

    const now = Date.now();
    const entry: PreparedTtsCacheEntry = {
      key,
      descriptor: cloneDescriptor(descriptor),
      timings: metadata.timings.map(timing => ({ ...timing })),
      duration: metadata.duration,
      byteSize: wav.size,
      path,
      createdAt: previousManifest.entries[key]?.createdAt ?? now,
      lastAccessedAt: now,
      startParagraph: metadata.startParagraph,
      endParagraph: metadata.endParagraph,
      completionSpeechIncluded: metadata.completionSpeechIncluded === true,
    };
    manifest = { schemaVersion: PREPARED_TTS_CACHE_SCHEMA_VERSION, entries: { ...previousManifest.entries, [key]: entry } };
    const evicted = await evictOverflowEntries(key);

    try {
      await saveManifest();
    } catch (error) {
      manifest = previousManifest;
      if (previousBlob) await putFile(path, false, previousBlob);
      else await removeFile(path);
      throw error;
    }

    for (const evictedEntry of evicted) await removeFile(evictedEntry.path);
    return cloneEntry(entry);
  });
}

export async function readPreparedTtsWav(keyOrEntry: string | PreparedTtsCacheEntry): Promise<Blob | null> {
  await ensureInitialized();
  const key = typeof keyOrEntry === "string" ? keyOrEntry : keyOrEntry.key;
  const entry = manifest.entries[key];
  if (!entry) return null;
  const blob = await getFileBlob(entry.path);
  if (!blob || !await isValidPreparedWav(blob, entry.byteSize)) {
    await deletePreparedTtsCacheEntry(key, Boolean(blob));
    return null;
  }
  await touchPreparedTtsCacheEntry(key);
  return blob;
}

export async function deletePreparedTtsCacheEntry(key: string, removeAudio = true): Promise<boolean> {
  await ensureInitialized();
  return enqueueOperation(async () => {
    const entry = manifest.entries[key];
    if (!entry) return false;
    const previousManifest = manifest;
    const entries = { ...manifest.entries };
    delete entries[key];
    manifest = { schemaVersion: PREPARED_TTS_CACHE_SCHEMA_VERSION, entries };
    try {
      await saveManifest();
    } catch (error) {
      manifest = previousManifest;
      throw error;
    }
    if (removeAudio) await removeFile(entry.path);
    return true;
  });
}

export async function touchPreparedTtsCacheEntry(key: string): Promise<boolean> {
  await ensureInitialized();
  return enqueueOperation(async () => {
    const entry = manifest.entries[key];
    if (!entry) return false;
    const previousLastAccessedAt = entry.lastAccessedAt;
    entry.lastAccessedAt = Date.now();
    try {
      await saveManifest();
    } catch (error) {
      entry.lastAccessedAt = previousLastAccessedAt;
      throw error;
    }
    return true;
  });
}

export async function flushPreparedTtsCache(): Promise<void> {
  await ensureInitialized();
  await enqueueOperation(saveManifest);
}
