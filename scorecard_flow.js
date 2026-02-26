#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const net = require("net");
const path = require("path");
const tls = require("tls");

async function loadDotEnv(filePath = ".env") {
  let text;
  try {
    text = await fs.readFile(filePath, "utf8");
  } catch {
    return;
  }

  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice(7).trim()
      : trimmed;
    const eq = withoutExport.indexOf("=");
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (!key) continue;
    if (process.env[key] !== undefined) continue; // do not override

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }

    process.env[key] = value;
  }
}

class CookieJar {
  constructor() {
    /** @type {Array<{name:string,value:string,domain:string,path:string,secure:boolean}>} */
    this.cookies = [];
  }

  /**
   * @param {string} url
   * @param {Array<string>} setCookies
   */
  addFromResponse(url, setCookies) {
    if (!setCookies || !setCookies.length) return;
    const u = new URL(url);
    for (const setCookie of setCookies) {
      const parsed = this.#parseSetCookie(setCookie, u.hostname);
      if (!parsed) continue;
      this.#upsert(parsed);
    }
  }

  /**
   * @param {string} url
   */
  getCookieHeader(url) {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname || "/";
    const isHttps = u.protocol === "https:";

    const pairs = [];
    for (const cookie of this.cookies) {
      if (cookie.secure && !isHttps) continue;
      if (!this.#domainMatches(host, cookie.domain)) continue;
      if (!path.startsWith(cookie.path)) continue;
      pairs.push(`${cookie.name}=${cookie.value}`);
    }
    return pairs.length ? pairs.join("; ") : "";
  }

  #domainMatches(host, domain) {
    const d = domain.toLowerCase();
    return host === d || host.endsWith(`.${d}`);
  }

  #upsert(cookie) {
    const idx = this.cookies.findIndex(
      (c) =>
        c.name === cookie.name &&
        c.domain.toLowerCase() === cookie.domain.toLowerCase() &&
        c.path === cookie.path,
    );
    if (idx >= 0) this.cookies[idx] = cookie;
    else this.cookies.push(cookie);
  }

  #parseSetCookie(setCookie, defaultDomain) {
    if (!setCookie) return null;
    const parts = String(setCookie)
      .split(";")
      .map((p) => p.trim());
    const first = parts.shift();
    if (!first) return null;
    const eq = first.indexOf("=");
    if (eq < 1) return null;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();

    let domain = defaultDomain;
    let path = "/";
    let secure = false;

    for (const attr of parts) {
      const [rawKey, ...rest] = attr.split("=");
      const key = rawKey.trim().toLowerCase();
      const attrValue = rest.join("=").trim();
      if (key === "domain" && attrValue) {
        domain = attrValue.startsWith(".") ? attrValue.slice(1) : attrValue;
      } else if (key === "path" && attrValue) {
        path = attrValue.startsWith("/") ? attrValue : "/" + attrValue;
      } else if (key === "secure") {
        secure = true;
      }
    }

    return { name, value, domain, path, secure };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function getEnvNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function formatError(err) {
  if (!err) return "Unknown error";
  if (err instanceof Error) return err.stack || err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function encodeRespCommand(args) {
  const parts = [`*${args.length}\r\n`];
  for (const arg of args) {
    const s = arg === null || arg === undefined ? "" : String(arg);
    parts.push(`$${Buffer.byteLength(s)}\r\n${s}\r\n`);
  }
  return parts.join("");
}

function parseRespValue(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const prefix = buffer[offset];

  const readLine = (start) => {
    const end = buffer.indexOf("\r\n", start);
    if (end === -1) return null;
    return { line: buffer.slice(start, end).toString("utf8"), next: end + 2 };
  };

  // Simple string: +OK\r\n
  if (prefix === 43) {
    const l = readLine(offset + 1);
    if (!l) return null;
    return { value: l.line, next: l.next };
  }

  // Error: -ERR ...\r\n
  if (prefix === 45) {
    const l = readLine(offset + 1);
    if (!l) return null;
    const err = new Error(l.line);
    err.name = "RedisError";
    return { value: err, next: l.next };
  }

  // Integer: :1\r\n
  if (prefix === 58) {
    const l = readLine(offset + 1);
    if (!l) return null;
    return { value: Number(l.line), next: l.next };
  }

  // Bulk string: $len\r\n...\r\n
  if (prefix === 36) {
    const l = readLine(offset + 1);
    if (!l) return null;
    const len = Number(l.line);
    if (len === -1) return { value: null, next: l.next };
    const start = l.next;
    const end = start + len;
    if (end + 2 > buffer.length) return null;
    const data = buffer.slice(start, end);
    if (buffer[end] !== 13 || buffer[end + 1] !== 10) return null;
    return { value: data.toString("utf8"), next: end + 2 };
  }

  // Array: *n\r\n ... (n elements)
  if (prefix === 42) {
    const l = readLine(offset + 1);
    if (!l) return null;
    const count = Number(l.line);
    if (count === -1) return { value: null, next: l.next };
    const arr = [];
    let next = l.next;
    for (let i = 0; i < count; i++) {
      const parsed = parseRespValue(buffer, next);
      if (!parsed) return null;
      arr.push(parsed.value);
      next = parsed.next;
    }
    return { value: arr, next };
  }

  return null;
}

class RedisClient {
  constructor(redisUrl) {
    this.redisUrl = redisUrl;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.pending = [];
    this.connected = false;
    this.connecting = null;
  }

  async connect() {
    if (this.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.#connectInternal().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async #connectInternal() {
    const url = new URL(this.redisUrl);
    const isTls = url.protocol === "rediss:";
    const host = url.hostname;
    const port = url.port ? Number(url.port) : 6379;
    const db =
      url.pathname && url.pathname.length > 1
        ? Number(url.pathname.slice(1))
        : 0;
    const username = url.username || null;
    const password = url.password || null;

    await new Promise((resolve, reject) => {
      const onError = (err) => reject(err);
      const onConnect = () => resolve();
      const socket = isTls
        ? tls.connect({ host, port, servername: host })
        : net.createConnection({ host, port });
      this.socket = socket;
      socket.setKeepAlive(true, 10_000);
      socket.once("error", onError);
      socket.once("connect", onConnect);
      socket.on("data", (chunk) => this.#onData(chunk));
      socket.on("close", () => this.#onClose());
      socket.on("error", (err) => this.#onSocketError(err));
    });

    this.connected = true;

    if (password) {
      if (username) {
        await this.sendCommand(["AUTH", username, password]);
      } else {
        await this.sendCommand(["AUTH", password]);
      }
    }
    if (db && Number.isFinite(db) && db !== 0) {
      await this.sendCommand(["SELECT", String(db)]);
    }
    await this.sendCommand(["PING"]);
  }

  #onClose() {
    this.connected = false;
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    const pending = this.pending.splice(0);
    for (const p of pending) {
      p.reject(new Error("Redis connection closed"));
    }
  }

  #onSocketError(err) {
    // Prevent unhandled 'error' events and fail any in-flight commands.
    this.connected = false;
    const pending = this.pending.splice(0);
    for (const p of pending) {
      p.reject(err);
    }
  }

  #onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const parsed = parseRespValue(this.buffer, 0);
      if (!parsed) break;
      this.buffer = this.buffer.subarray(parsed.next);

      const waiter = this.pending.shift();
      if (!waiter) continue;

      if (parsed.value instanceof Error) {
        waiter.reject(parsed.value);
      } else {
        waiter.resolve(parsed.value);
      }
    }
  }

  async sendCommand(args) {
    await this.connect();
    if (!this.socket || !this.connected) {
      throw new Error("Redis not connected");
    }
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.socket.write(encodeRespCommand(args));
    });
  }

  async get(key) {
    const res = await this.sendCommand(["GET", key]);
    return res === null ? null : String(res);
  }

  async setEx(key, ttlSeconds, value) {
    const ttl = String(Math.max(1, Math.floor(Number(ttlSeconds) || 1)));
    await this.sendCommand(["SET", key, value, "EX", ttl]);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith("--")) continue;

    const eq = raw.indexOf("=");
    const key = (eq >= 0 ? raw.slice(2, eq) : raw.slice(2)).trim();
    const value =
      eq >= 0
        ? raw.slice(eq + 1)
        : argv[i + 1] && !argv[i + 1].startsWith("--")
          ? argv[++i]
          : true;
    args[key] = value;
  }
  return args;
}

function usage() {
  return [
    "Usage:",
    "  node scorecard_flow.js --iframeUrl <url> [--matchId <matchId>] [--clientId <id>]",
    "  (clientId auto-detect: tries local reference3/4.js, else iframe HTML)",
    "",
    "Worker mode (no args):",
    "  Reads Redis `Sky_scorecard_main` every 5s and writes `scorecard_data:sky:<eventId>` (TTL 48h).",
    "",
    "Optional:",
    "  --lang en (default: en)",
    "  --tz Etc:UTC (default: Etc:UTC)",
    "  --clientAlias common (default: common)",
    "  --feedsBaseUrl https://lmt.fn.sportradar.com (default: https://lmt.fn.sportradar.com)",
    "  --origin https://scorecard.oddstrad.com (sets Origin header)",
    "  --referer <url> (sets Referer header; default: iframeUrl)",
    "  --userAgent <ua> (default: Chrome UA)",
    "  --sendOriginHeaders (adds Origin/Referer from licensing token)",
    "  --out scorecard.json (writes get_scorecard response)",
    "  --licFile licensing.json (skip licensing call; read JSON from file)",
    "  --verbose (prints URLs + token info)",
  ].join("\n");
}

function normalizeOrigin(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return null;
  try {
    return new URL(s).origin;
  } catch {
    return null;
  }
}

function normalizeUrl(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || s === "null" || s === "undefined") return null;
  try {
    return new URL(s).toString();
  } catch {
    return null;
  }
}

function isHexClientId(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value.trim());
}

function extractClientIdFromText(text) {
  if (!text) return null;
  const str = String(text);
  const patterns = [
    /widgets\.sir\.sportradar\.com\/([0-9a-f]{32})\/licensing/i,
    /widgets\.sir\.sportradar\.com\/([0-9a-f]{32})\//i,
    /\bsrstore:([0-9a-f]{32})\b/i,
    /["']clientId["']\s*:\s*["']([0-9a-f]{32})["']/i,
    /\bclientId=([0-9a-f]{32})\b/i,
  ];
  for (const re of patterns) {
    const m = str.match(re);
    if (m && isHexClientId(m[1])) return m[1].toLowerCase();
  }
  return null;
}

function extractClientIdFromReferenceJs(text) {
  if (!text) return null;
  const str = String(text);
  const direct =
    str.match(/\bclientId\s*:\s*["']([0-9a-f]{32})["']/i) ||
    str.match(/\bclientId\s*=\s*["']([0-9a-f]{32})["']/i);
  if (direct && isHexClientId(direct[1])) return direct[1].toLowerCase();
  return extractClientIdFromText(str);
}

async function readTextFileIfExists(path) {
  try {
    return await fs.readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function discoverClientId({
  iframeUrlNormalized,
  headers,
  cookieJar,
  verbose,
}) {
  const referenceFiles = ["reference4.js", "reference3.js"];
  for (const file of referenceFiles) {
    const text = await readTextFileIfExists(file);
    const id = extractClientIdFromReferenceJs(text);
    if (id) return { clientId: id, source: file };
  }

  if (iframeUrlNormalized) {
    const html = await fetchText(iframeUrlNormalized, { headers, cookieJar });
    const id = extractClientIdFromText(html);
    if (id) return { clientId: id, source: "iframeHtml", iframeHtml: html };
    if (verbose) {
      process.stderr.write(
        "warn: could not auto-detect clientId from iframe HTML\n",
      );
    }
  }

  return { clientId: null, source: null, iframeHtml: null };
}

async function fetchText(url, { headers, cookieJar } = {}) {
  const finalHeaders = { ...(headers || {}) };
  if (cookieJar && !finalHeaders.Cookie) {
    const cookieHeader = cookieJar.getCookieHeader(url);
    if (cookieHeader) finalHeaders.Cookie = cookieHeader;
  }

  const controller = new AbortController();
  const timeoutMs = getEnvNumber("SKY_FETCH_TIMEOUT_MS", 15000);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, {
    headers: finalHeaders,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (cookieJar && typeof res.headers.getSetCookie === "function") {
    cookieJar.addFromResponse(url, res.headers.getSetCookie());
  }
  const body = await res.text();
  if (!res.ok) {
    const preview = body.length > 500 ? body.slice(0, 500) + "…" : body;
    throw new Error(`HTTP ${res.status} for ${url}\n${preview}`);
  }
  return body;
}

async function fetchJson(url, { headers, cookieJar } = {}) {
  const body = await fetchText(url, { headers, cookieJar });
  try {
    return JSON.parse(body);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from ${url}: ${err && err.message ? err.message : err}`,
    );
  }
}

function parseTokenParts(token) {
  const parts = {};
  String(token)
    .split("~")
    .forEach((seg) => {
      const idx = seg.indexOf("=");
      if (idx < 0) return;
      const key = seg.slice(0, idx);
      const value = seg.slice(idx + 1);
      parts[key] = value;
    });
  return parts;
}

function decodeBase64Json(base64Value) {
  const raw = Buffer.from(String(base64Value), "base64");
  return JSON.parse(raw.toString("utf8"));
}

function evpBytesToKeyMd5({ password, salt, keyLen, ivLen }) {
  const passwordBytes = Buffer.from(String(password), "utf8");
  const totalLen = keyLen + ivLen;

  let derived = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (derived.length < totalLen) {
    const md5 = crypto.createHash("md5");
    md5.update(block);
    md5.update(passwordBytes);
    md5.update(salt);
    block = md5.digest();
    derived = Buffer.concat([derived, block]);
  }

  return {
    key: derived.subarray(0, keyLen),
    iv: derived.subarray(keyLen, keyLen + ivLen),
  };
}

function decryptOpenSslSaltedAes256Cbc(base64Ciphertext, password) {
  const raw = Buffer.from(String(base64Ciphertext).trim(), "base64");
  if (raw.length < 16) {
    throw new Error("Ciphertext too short");
  }

  const magic = raw.subarray(0, 8).toString("utf8");
  if (magic !== "Salted__") {
    throw new Error(`Unexpected ciphertext header: ${JSON.stringify(magic)}`);
  }

  const salt = raw.subarray(8, 16);
  const ciphertext = raw.subarray(16);
  const { key, iv } = evpBytesToKeyMd5({
    password,
    salt,
    keyLen: 32,
    ivLen: 16,
  });

  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(true);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function buildFishnetUrl({
  feedsBaseUrl,
  clientAlias,
  lang,
  tz,
  feedPath,
  params,
  token,
}) {
  const base = String(feedsBaseUrl).replace(/\/+$/, "");
  return `${base}/${clientAlias}/${lang}/${tz}/${feedPath}/${params}?T=${String(token)}`;
}

function extractMatchIdFromIframeUrl(iframeUrl) {
  const parsed = parseScoreIframeUrl(iframeUrl);
  return parsed ? parsed.matchId : null;
}

function parseScoreIframeUrl(iframeUrl) {
  const normalized = normalizeUrl(iframeUrl);
  if (!normalized) return null;
  try {
    const u = new URL(normalized);
    const parts = u.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("get-scorecard-iframe");
    if (idx === -1) {
      const matchId = parts.length ? parts[parts.length - 1] : null;
      return {
        url: normalized,
        origin: u.origin,
        type: null,
        eventId: null,
        matchId,
      };
    }
    const typeRaw = parts[idx + 1];
    const eventId = parts[idx + 2] ?? null;
    const matchId = parts[idx + 3] ?? null;
    const type = typeRaw !== undefined ? Number(typeRaw) : null;
    return {
      url: normalized,
      origin: u.origin,
      type: Number.isFinite(type) ? type : null,
      eventId,
      matchId,
    };
  } catch {
    return null;
  }
}

function feedPathForIframeType(type) {
  if (type === 4) return "cricket/get_scorecard";
  if (type === 1) return "gismo/match_timelinedelta";
  if (type === 2) return "gismo/igc_match_timeline_delta";
  return null;
}

async function getRedisUrl() {
  const fromEnv = process.env.SKY_REDIS_URL || process.env.REDIS_URL;
  if (fromEnv) return fromEnv.trim();
  const fromFile = await readTextFileIfExists("sky_redis_url.txt");
  if (fromFile) return fromFile.trim();
  return null;
}

async function fetchScorecardOnce({
  clientId: clientIdInput,
  iframeUrl,
  matchId,
  feedPath,
  lang,
  tz,
  clientAlias,
  feedsBaseUrl,
  userAgent,
  origin,
  referer,
  sendOriginHeaders,
  verbose,
  quiet,
  licFile,
}) {
  const defaultLang = lang || "en";
  const defaultTz = tz || "Etc:UTC";
  const defaultClientAlias = clientAlias || "common";
  const defaultFeedsBaseUrl = feedsBaseUrl || "https://lmt.fn.sportradar.com";
  const defaultUserAgent =
    userAgent ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  const cookieJar = new CookieJar();
  const defaultHeaders = {
    "User-Agent": defaultUserAgent,
    Accept: "*/*",
  };

  const iframeUrlNormalized = normalizeUrl(iframeUrl);
  const derivedOrigin = iframeUrlNormalized
    ? new URL(iframeUrlNormalized).origin
    : null;
  const requestOrigin = normalizeOrigin(origin) || derivedOrigin || null;
  const requestReferer =
    normalizeUrl(referer) ||
    iframeUrlNormalized ||
    (requestOrigin ? requestOrigin + "/" : null);

  const preAuthHeaders = { ...defaultHeaders };
  if (requestOrigin) preAuthHeaders["Origin"] = requestOrigin;
  if (requestReferer) preAuthHeaders["Referer"] = requestReferer;

  let iframeHtmlPrefetch = null;
  let clientId = clientIdInput || null;
  let clientIdSource = clientId ? "input" : null;
  if (!clientId) {
    const discovered = await discoverClientId({
      iframeUrlNormalized,
      headers: preAuthHeaders,
      cookieJar,
      verbose: !!verbose,
    });
    clientId = discovered.clientId;
    clientIdSource = discovered.source;
    iframeHtmlPrefetch = discovered.iframeHtml || null;
  }
  if (!clientId) {
    throw new Error("Missing clientId (auto-detect failed)");
  }

  if (!quiet && verbose) {
    process.stdout.write(
      `clientId=${clientId} source=${clientIdSource || "(unknown)"}\n`,
    );
  }

  const licensingHeaders = { ...defaultHeaders };
  if (requestOrigin) licensingHeaders["Origin"] = requestOrigin;
  if (requestReferer) licensingHeaders["Referer"] = requestReferer;

  const licensing = licFile
    ? JSON.parse(await fs.readFile(String(licFile), "utf8"))
    : await fetchJson(
        `https://widgets.sir.sportradar.com/${clientId}/licensing`,
        {
          headers: licensingHeaders,
          cookieJar,
        },
      );

  if (
    !licensing ||
    (typeof licensing === "object" && licensing.valid === false)
  ) {
    throw new Error(
      `Licensing response not valid: ${JSON.stringify(licensing)}`,
    );
  }

  const licensingText =
    typeof licensing === "string"
      ? licensing
      : typeof licensing.text === "string"
        ? licensing.text
        : null;
  if (!licensingText) {
    throw new Error(`Missing licensing text: ${JSON.stringify(licensing)}`);
  }

  const decrypted = JSON.parse(
    decryptOpenSslSaltedAes256Cbc(licensingText, clientId),
  );
  const fishnetToken = decrypted && decrypted.fishnetToken;
  if (!fishnetToken || !fishnetToken.token) {
    throw new Error(
      `Missing fishnetToken in decrypted licensing: ${JSON.stringify(decrypted)}`,
    );
  }

  const extraHeaders = { ...defaultHeaders };
  if (sendOriginHeaders) {
    if (requestOrigin) extraHeaders["Origin"] = requestOrigin;
    if (requestReferer) extraHeaders["Referer"] = requestReferer;
  }

  const expirationIso =
    typeof fishnetToken.expirationTs === "number"
      ? new Date(fishnetToken.expirationTs).toISOString()
      : "(unknown)";
  if (!quiet) {
    if (verbose) {
      process.stdout.write(`fishnetToken.expiresAt=${expirationIso}\n`);
      process.stdout.write(`request.origin=${requestOrigin || "(missing)"}\n`);
      process.stdout.write(
        `request.referer=${requestReferer || "(missing)"}\n`,
      );
      const tokenParts = parseTokenParts(fishnetToken.token);
      process.stdout.write(
        `fishnetToken.exp=${tokenParts.exp || "(missing)"}\n`,
      );
      if (tokenParts.data) {
        try {
          const tokenData = decodeBase64Json(tokenParts.data);
          process.stdout.write(
            `fishnetToken.data=${JSON.stringify(tokenData)}\n`,
          );
        } catch {
          process.stdout.write("fishnetToken.data=(failed to decode)\n");
        }
      }
    } else {
      process.stdout.write(`fishnetToken.expiresAt=${expirationIso}\n`);
    }
  }

  if (iframeUrlNormalized) {
    if (!quiet && verbose)
      process.stdout.write(`iframe.url=${iframeUrlNormalized}\n`);
    const iframeHtml =
      iframeHtmlPrefetch ||
      (await fetchText(iframeUrlNormalized, {
        headers: extraHeaders,
        cookieJar,
      }));
    if (!quiet && verbose)
      process.stdout.write(
        `iframe.ok bytes=${Buffer.byteLength(iframeHtml, "utf8")}\n`,
      );
  }

  const scorecardUrl = buildFishnetUrl({
    feedsBaseUrl: defaultFeedsBaseUrl,
    clientAlias: defaultClientAlias,
    lang: defaultLang,
    tz: defaultTz,
    feedPath: feedPath || "cricket/get_scorecard",
    params: matchId,
    token: String(fishnetToken.token).trim(),
  });
  if (!quiet && verbose)
    process.stdout.write(`scorecard.url=${scorecardUrl}\n`);

  const scorecardBody = await fetchText(scorecardUrl, {
    headers: extraHeaders,
    cookieJar,
  });

  return {
    clientId,
    matchId,
    scorecardUrl,
    scorecardBody,
  };
}

async function runOnceCli(args) {
  const iframeUrl = args.iframeUrl || process.env.SR_IFRAME_URL;
  const iframeParsed = iframeUrl ? parseScoreIframeUrl(iframeUrl) : null;
  const matchId =
    args.matchId ||
    process.env.SR_MATCH_ID ||
    (iframeUrl ? extractMatchIdFromIframeUrl(iframeUrl) : null);

  if (!iframeUrl || !matchId) {
    process.stderr.write(usage() + "\n");
    process.exitCode = 2;
    return;
  }

  const feedPath =
    feedPathForIframeType(iframeParsed?.type) || "cricket/get_scorecard";

  const clientId = args.clientId || process.env.SR_CLIENT_ID;
  const lang = args.lang || "en";
  const tz = args.tz || "Etc:UTC";
  const clientAlias = args.clientAlias || "common";
  const feedsBaseUrl = args.feedsBaseUrl || "https://lmt.fn.sportradar.com";
  const userAgent =
    args.userAgent ||
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

  const { scorecardBody } = await fetchScorecardOnce({
    clientId,
    iframeUrl,
    matchId,
    feedPath,
    lang,
    tz,
    clientAlias,
    feedsBaseUrl,
    userAgent,
    origin: args.origin,
    referer: args.referer,
    sendOriginHeaders: !!args.sendOriginHeaders,
    verbose: !!args.verbose,
    quiet: false,
    licFile: args.licFile,
  });

  try {
    const parsed = JSON.parse(scorecardBody);
    const exception = parsed?.doc?.find?.(
      (d) => d?.event === "exception",
    )?.data;
    if (exception?.code === 403 || exception?.name === "Unauthorized") {
      process.stderr.write(
        `scorecard.error code=${exception.code} message=${JSON.stringify(exception.message || "")}\n`,
      );
      if (args.verbose) {
        process.stderr.write(
          `scorecard.error.full=${JSON.stringify(exception)}\n`,
        );
      }
      process.exitCode = 3;
    }
  } catch {
    // ignore
  }

  if (args.out) {
    await fs.writeFile(String(args.out), scorecardBody, "utf8");
    process.stdout.write(`scorecard.saved path=${args.out}\n`);
  } else {
    process.stdout.write(scorecardBody + "\n");
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  const workers = new Array(Math.max(1, limit)).fill(null).map(async () => {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

async function runWorker() {
  const redisUrl = await getRedisUrl();
  if (!redisUrl) {
    process.stderr.write(
      "Error: missing Redis URL. Set SKY_REDIS_URL/REDIS_URL (env or .env) or put it in sky_redis_url.txt\n",
    );
    process.exitCode = 2;
    return;
  }

  const mainKey = process.env.SKY_MAIN_KEY || "Sky_scorecard_main";
  const pollMs = getEnvNumber("SKY_POLL_MS", 5000);
  const ttlSeconds = getEnvNumber("SKY_TTL_SECONDS", 48 * 3600);
  const concurrency = Math.max(
    1,
    Math.floor(getEnvNumber("SKY_CONCURRENCY", 3)),
  );

  const redis = new RedisClient(redisUrl);
  await redis.connect();

  process.stdout.write(
    `[${nowIso()}] worker.started mainKey=${mainKey} pollMs=${pollMs} ttlSeconds=${ttlSeconds} concurrency=${concurrency}\n`,
  );

  // Try to discover a default clientId from local reference files once.
  let defaultClientId = null;
  try {
    const discovered = await discoverClientId({
      iframeUrlNormalized: null,
      headers: {},
      cookieJar: new CookieJar(),
      verbose: false,
    });
    defaultClientId = discovered.clientId;
  } catch {
    defaultClientId = null;
  }

  while (true) {
    const cycleStart = Date.now();
    let rawList = null;
    try {
      rawList = await redis.get(mainKey);
    } catch (err) {
      process.stderr.write(
        `[${nowIso()}] worker.redisGetError ${formatError(err)}\n`,
      );
      await sleep(2000);
      continue;
    }

    let list = [];
    try {
      const parsed = rawList ? JSON.parse(rawList) : [];
      list = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      process.stderr.write(
        `[${nowIso()}] worker.parseError key=${mainKey} ${formatError(err)}\n`,
      );
      list = [];
    }

    const tasks = list
      .map((item) => {
        const iframeUrl = item && item.score ? String(item.score) : null;
        const eventId =
          item && (item.eventId === 0 || item.eventId)
            ? String(item.eventId)
            : null;
        const parsed = iframeUrl ? parseScoreIframeUrl(iframeUrl) : null;
        const matchId = parsed ? parsed.matchId : null;
        const type = parsed ? parsed.type : null;
        const feedPath = feedPathForIframeType(type);
        if (!iframeUrl || !eventId || !matchId || !feedPath) return null;
        return {
          iframeUrl,
          eventId,
          matchId,
          type,
          feedPath,
          urlEventId: parsed?.eventId || null,
        };
      })
      .filter(Boolean);

    await mapLimit(
      tasks,
      concurrency,
      async ({ iframeUrl, eventId, matchId, type, feedPath, urlEventId }) => {
        const key = `scorecard_data:sky:${eventId}`;
        try {
          if (urlEventId && urlEventId !== eventId) {
            process.stderr.write(
              `[${nowIso()}] worker.warnEventIdMismatch itemEventId=${eventId} urlEventId=${urlEventId} matchId=${matchId}\n`,
            );
          }
          const { scorecardBody } = await fetchScorecardOnce({
            clientId: defaultClientId,
            iframeUrl,
            matchId,
            feedPath,
            lang: "en",
            tz: "Etc:UTC",
            clientAlias: "common",
            feedsBaseUrl: "https://lmt.fn.sportradar.com",
            origin: null,
            referer: null,
            userAgent: null,
            sendOriginHeaders: true,
            verbose: false,
            quiet: true,
          });

          await redis.setEx(key, ttlSeconds, scorecardBody);
          process.stdout.write(
            `[${nowIso()}] worker.updated type=${type} feed=${feedPath} eventId=${eventId} matchId=${matchId} bytes=${Buffer.byteLength(
              scorecardBody,
              "utf8",
            )}\n`,
          );
        } catch (err) {
          process.stderr.write(
            `[${nowIso()}] worker.updateError eventId=${eventId} matchId=${matchId} ${formatError(err)}\n`,
          );
        }
      },
    );

    const elapsed = Date.now() - cycleStart;
    const waitMs = Math.max(0, pollMs - elapsed);
    await sleep(waitMs);
  }
}

async function main() {
  // Node doesn't auto-load `.env`, so do it here (CWD first, then script dir).
  await loadDotEnv(".env");
  await loadDotEnv(path.join(__dirname, ".env"));
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage() + "\n");
    return;
  }

  if (Object.keys(args).length === 0) {
    return runWorker();
  }

  return runOnceCli(args);
}

main().catch((err) => {
  process.stderr.write((err && err.stack) || String(err));
  process.stderr.write("\n");
  process.exitCode = 1;
});
