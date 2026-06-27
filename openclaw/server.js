#!/usr/bin/env node
/**
 * Ultimate Web Search MCP Server v4.0 - Production Grade
 * ========================================================
 * Maximum performance + stability for real-world workloads.
 *
 * Engines: Bing, Quark, Sogou, 360, Yandex
 * Features:
 * - Adaptive rate limiting (auto-adjusts under load)
 * - Per-engine concurrency control
 * - Circuit breaker with fast recovery
 * - LRU cache (1000 search + 200 page)
 * - Request deduplication (in-flight merging)
 * - Connection pooling (HTTP keep-alive)
 * - Smart retry with UA rotation
 * - Parallel multi-engine search
 * - Readability content extraction (100KB)
 * - Health monitoring & metrics
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import * as cheerio from "cheerio";

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Configuration
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const CFG = {
  // Content limits
  maxContentChars: 100_000,
  defaultContentChars: 50_000,

  // Timeouts
  fetchTimeout: 15_000,
  searchTimeout: 12_000,

  // Retry
  maxRetries: 2,
  retryBaseMs: 800,

  // Cache
  cacheTtl: 15 * 60 * 1000,   // 15 min
  pageCacheTtl: 10 * 60 * 1000, // 10 min
  cacheMax: 1000,
  pageCacheMax: 300,

  // Circuit breaker
  breaker: {
    threshold: 4,       // failures before open
    halfOpenMax: 1,     // test requests in half-open
    resetMs: 30_000,    // 30s cooldown
  },

  // Rate limiting (adaptive)
  rateMs: 150,            // base delay per engine
  rateJitter: [50, 150],  // random jitter range
  rateLoadFactor: 0.7,    // reduce delay up to 70% under load

  // Concurrency
  maxConcurrentPerEngine: 4,
  maxGlobalConcurrent: 20,

  // User agents
  ua: [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  ],
};

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Utilities
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];
const now = () => Date.now();

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Metrics
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const metrics = {
  searches: 0,
  cacheHits: 0,
  errors: 0,
  engineCalls: {},
  engineErrors: {},
  avgLatency: 0,
  _latencies: [],

  recordSearch(cached) {
    this.searches++;
    if (cached) this.cacheHits++;
  },

  recordEngine(eng, success, latencyMs) {
    const key = eng;
    this.engineCalls[key] = (this.engineCalls[key] || 0) + 1;
    if (!success) {
      this.engineErrors[key] = (this.engineErrors[key] || 0) + 1;
      this.errors++;
    }
    this._latencies.push(latencyMs);
    if (this._latencies.length > 100) this._latencies.shift();
    this.avgLatency = Math.round(this._latencies.reduce((a, b) => a + b, 0) / this._latencies.length);
  },

  getSummary() {
    const engineStats = Object.keys(this.engineCalls).map((eng) => {
      const calls = this.engineCalls[eng] || 0;
      const errs = this.engineErrors[eng] || 0;
      const rate = calls > 0 ? ((calls - errs) / calls * 100).toFixed(0) : "0";
      return `${eng}: ${calls} calls, ${rate}% success`;
    });
    return [
      `Searches: ${this.searches} (${this.cacheHits} cached)`,
      `Errors: ${this.errors}`,
      `Avg latency: ${this.avgLatency}ms`,
      ...engineStats,
    ].join("\n");
  },
};

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// LRU Cache
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?class LRU {
  constructor(max, ttl) { this.max = max; this.ttl = ttl; this.m = new Map(); }
  get(k) {
    const e = this.m.get(k);
    if (!e) return null;
    if (now() - e.t > this.ttl) { this.m.delete(k); return null; }
    this.m.delete(k); this.m.set(k, e);
    return e.v;
  }
  set(k, v) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value);
    this.m.set(k, { v, t: now() });
  }
  clear() { this.m.clear(); }
  get size() { return this.m.size; }
}

const searchCache = new LRU(CFG.cacheMax, CFG.cacheTtl);
const pageCache = new LRU(CFG.pageCacheMax, CFG.pageCacheTtl);

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Circuit Breaker (with half-open state)
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?class CircuitBreaker {
  constructor() { this.engines = new Map(); }

  getState(name) {
    const s = this.engines.get(name) || { failures: 0, state: "closed", lastFail: 0, halfOpenAttempts: 0 };
    // Auto-recover from open to half-open
    if (s.state === "open" && now() - s.lastFail > CFG.breaker.resetMs) {
      s.state = "half-open";
      s.halfOpenAttempts = 0;
    }
    return s;
  }

  canPass(name) {
    const s = this.getState(name);
    if (s.state === "closed") return true;
    if (s.state === "half-open" && s.halfOpenAttempts < CFG.breaker.halfOpenMax) return true;
    return false;
  }

  recordSuccess(name) {
    this.engines.set(name, { failures: 0, state: "closed", lastFail: 0, halfOpenAttempts: 0 });
  }

  recordFailure(name) {
    const s = this.getState(name);
    s.failures++;
    s.lastFail = now();
    if (s.state === "half-open") {
      s.state = "open";
      s.halfOpenAttempts = 0;
    } else if (s.failures >= CFG.breaker.threshold) {
      s.state = "open";
    }
    this.engines.set(name, s);
  }

  recordHalfOpenAttempt(name) {
    const s = this.getState(name);
    s.halfOpenAttempts++;
    this.engines.set(name, s);
  }

  isOpen(name) { return !this.canPass(name); }

  getStatus() {
    const out = {};
    for (const [k] of this.engines) out[k] = this.getState(k);
    return out;
  }
}

const breaker = new CircuitBreaker();

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Rate Limiter (adaptive)
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const rlTimestamps = new Map();
const engineConcurrency = new Map();
let globalConcurrency = 0;

async function rateLimit(eng) {
  const load = Math.min(globalConcurrency / 10, 1);
  const delay = CFG.rateMs * (1 - load * CFG.rateLoadFactor) + rand(...CFG.rateJitter);
  const elapsed = now() - (rlTimestamps.get(eng) || 0);
  if (elapsed < delay) await sleep(delay - elapsed);
  rlTimestamps.set(eng, now());
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Concurrency Control
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?async function withEngineLimit(eng, fn) {
  // Wait for global slot
  while (globalConcurrency >= CFG.maxGlobalConcurrent) await sleep(50 + rand(20, 50));
  // Wait for engine slot
  while ((engineConcurrency.get(eng) || 0) >= CFG.maxConcurrentPerEngine) await sleep(50 + rand(20, 50));

  engineConcurrency.set(eng, (engineConcurrency.get(eng) || 0) + 1);
  globalConcurrency++;
  try {
    return await fn();
  } finally {
    engineConcurrency.set(eng, (engineConcurrency.get(eng) || 1) - 1);
    globalConcurrency--;
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// HTTP Fetch (with dedup, retry, UA rotation)
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const inflightRequests = new Map();

async function dedupedFetch(url, opts) {
  if (inflightRequests.has(url)) return inflightRequests.get(url);
  const promise = httpFetch(url, opts).finally(() => inflightRequests.delete(url));
  inflightRequests.set(url, promise);
  return promise;
}

async function httpFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || CFG.fetchTimeout);

  const headers = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "User-Agent": opts.ua || pick(CFG.ua),
    ...opts.headers,
  };
  if (opts.referer) headers["Referer"] = opts.referer;

  try {
    for (let attempt = 0; attempt <= CFG.maxRetries; attempt++) {
      try {
        const resp = await fetch(url, { headers, redirect: "follow", signal: controller.signal, keepalive: true });
        if (resp.ok) return resp;
        if (attempt === CFG.maxRetries) return resp;
        // Backoff on rate limit or ban
        if (resp.status === 429 || resp.status === 403) {
          await sleep(CFG.retryBaseMs * (attempt + 1) + rand(300, 800));
          headers["User-Agent"] = pick(CFG.ua);
          continue;
        }
        return resp;
      } catch (err) {
        if (attempt === CFG.maxRetries) throw err;
      }
      await sleep(CFG.retryBaseMs * (attempt + 1) + rand(100, 400));
    }
  } finally {
    clearTimeout(timeout);
  }
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Search Engines
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
async function searchBing(query, count = 8) {
  return withEngineLimit("bing", async () => {
    await rateLimit("bing");
    const t0 = now();
    try {
      const resp = await httpFetch(
        `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&setmkt=zh-CN`,
        { timeout: CFG.searchTimeout, referer: "https://www.bing.com/" }
      );
      const $ = cheerio.load(await resp.text());
      const results = [];
      $("li.b_algo").each((i, el) => {
        if (i >= count) return false;
        const a = $(el).find("h2 a");
        const title = a.text().trim();
        const url = a.attr("href") || "";
        const snippet = $(el).find(".b_caption p").first().text().trim();
        if (title && url.startsWith("http")) results.push({ title, url, snippet, engine: "bing" });
      });
      breaker.recordSuccess("bing");
      metrics.recordEngine("bing", true, now() - t0);
      return results;
    } catch (e) {
      breaker.recordFailure("bing");
      metrics.recordEngine("bing", false, now() - t0);
      throw e;
    }
  });
}

async function searchQuark(query, count = 8) {
  return withEngineLimit("quark", async () => {
    await rateLimit("quark");
    const t0 = now();
    try {
      const resp = await httpFetch(
        `https://quark.sm.cn/s?q=${encodeURIComponent(query)}&safe=1&from=smor`,
        { timeout: CFG.searchTimeout, referer: "https://quark.sm.cn/" }
      );
      const html = await resp.text();
      const $ = cheerio.load(html);
      const results = [];

      // Quark embeds results in script tags as JSON
      $("script").each((i, el) => {
        const text = $(el).html() || "";
        if (!text.includes('"title"') || !text.includes('"summary"')) return;
        const matches = text.match(/\{[^{}]*"title"[^{}]*"summary"[^{}]*\}/g);
        if (!matches) return;
        for (const m of matches) {
          if (results.length >= count) break;
          try {
            const obj = JSON.parse(m.replace(/<[^>]+>/g, ""));
            if (obj.title && obj.title.length > 5) {
              results.push({ title: obj.title, url: obj.url || "", snippet: (obj.summary || "").slice(0, 200), engine: "quark" });
            }
          } catch {}
        }
      });

      // Fallback: extract from <a> tags
      if (results.length < 2) {
        $("a").each((i, el) => {
          if (results.length >= count) return false;
          const title = $(el).text().trim();
          const url = $(el).attr("href") || "";
          if (title.length > 15 && title.length < 200 && url.startsWith("http") && !url.includes("quark.sm.cn")) {
            if (!results.some((r) => r.title === title)) results.push({ title, url, snippet: "", engine: "quark" });
          }
        });
      }

      breaker.recordSuccess("quark");
      metrics.recordEngine("quark", true, now() - t0);
      return results;
    } catch (e) {
      breaker.recordFailure("quark");
      metrics.recordEngine("quark", false, now() - t0);
      throw e;
    }
  });
}

async function searchSogou(query, count = 8) {
  return withEngineLimit("sogou", async () => {
    await rateLimit("sogou");
    const t0 = now();
    try {
      const resp = await httpFetch(
        `https://www.sogou.com/web?query=${encodeURIComponent(query)}&num=${count}`,
        { timeout: CFG.searchTimeout, referer: "https://www.sogou.com/", headers: { "Accept-Language": "zh-CN,zh;q=0.9" } }
      );
      const $ = cheerio.load(await resp.text());
      const results = [];
      $("h3 a").each((i, el) => {
        if (results.length >= count) return false;
        const title = $(el).text().trim();
        let url = $(el).attr("href") || "";
        if (url.startsWith("/link")) url = "https://www.sogou.com" + url;
        if (title.length > 5 && title.length < 200) results.push({ title, url, snippet: "", engine: "sogou" });
      });
      breaker.recordSuccess("sogou");
      metrics.recordEngine("sogou", true, now() - t0);
      return results;
    } catch (e) {
      breaker.recordFailure("sogou");
      metrics.recordEngine("sogou", false, now() - t0);
      throw e;
    }
  });
}

async function search360(query, count = 8) {
  return withEngineLimit("360", async () => {
    await rateLimit("360");
    const t0 = now();
    try {
      const resp = await httpFetch(
        `https://www.so.com/s?q=${encodeURIComponent(query)}&pn=1&src=srp`,
        { timeout: CFG.searchTimeout, referer: "https://www.so.com/", headers: { "Accept-Language": "zh-CN,zh;q=0.9" } }
      );
      const $ = cheerio.load(await resp.text());
      const results = [];
      $(".result,.res-list").each((i, el) => {
        if (i >= count) return false;
        const a = $(el).find("h3 a, a").first();
        const title = a.text().trim();
        const url = a.attr("href") || "";
        const snippet = $(el).find("p.res-desc,.res-comm-con,p").first().text().trim();
        if (title && title.length > 3) results.push({ title, url, snippet, engine: "360" });
      });
      breaker.recordSuccess("360");
      metrics.recordEngine("360", true, now() - t0);
      return results.slice(0, count);
    } catch (e) {
      breaker.recordFailure("360");
      metrics.recordEngine("360", false, now() - t0);
      throw e;
    }
  });
}

async function searchYandex(query, count = 8) {
  return withEngineLimit("yandex", async () => {
    await rateLimit("yandex");
    const t0 = now();
    try {
      const resp = await httpFetch(
        `https://yandex.com/search/?text=${encodeURIComponent(query)}&lr=21422`,
        { timeout: CFG.searchTimeout, referer: "https://yandex.com/" }
      );
      const $ = cheerio.load(await resp.text());
      const results = [];
      $(".serp-item,.OrganicTitleContentWrapper").each((i, el) => {
        if (i >= count) return false;
        const a = $(el).find("a.Link, a").first();
        const title = a.text().trim();
        const url = a.attr("href") || "";
        const snippet = $(el).find(".OrganicTextContentWrapper, p").first().text().trim();
        if (title && url.startsWith("http")) results.push({ title, url, snippet, engine: "yandex" });
      });
      breaker.recordSuccess("yandex");
      metrics.recordEngine("yandex", true, now() - t0);
      return results.slice(0, count);
    } catch (e) {
      breaker.recordFailure("yandex");
      metrics.recordEngine("yandex", false, now() - t0);
      throw e;
    }
  });
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Engine Registry
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const ENGINES = {
  bing: searchBing,
  quark: searchQuark,
  sogou: searchSogou,
  "360": search360,
  yandex: searchYandex,
};

const DEFAULT_ENGINES = ["bing", "quark", "sogou"];

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Multi-Search Orchestrator
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?async function multiSearch(query, { engines = DEFAULT_ENGINES, count = 8, strategy = "parallel" } = {}) {
  // Check cache
  const cacheKey = `s:${engines.join(",")}:${count}:${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    metrics.recordSearch(true);
    return cached;
  }
  metrics.recordSearch(false);

  // Filter out circuit-broken engines
  const available = engines.filter((e) => !breaker.isOpen(e));

  let allResults = [];

  if (strategy === "parallel" && available.length > 1) {
    // Parallel: run all engines simultaneously
    const settled = await Promise.allSettled(
      available.map(async (eng) => {
        const fn = ENGINES[eng];
        if (!fn) return [];
        try {
          return await fn(query, count);
        } catch {
          return [];
        }
      })
    );
    for (const result of settled) {
      if (result.status === "fulfilled") allResults.push(...result.value);
    }
  } else {
    // Fallback: try engines in order, stop on first success
    for (const eng of available) {
      const fn = ENGINES[eng];
      if (!fn) continue;
      try {
        const results = await fn(query, count);
        if (results.length > 0) { allResults = results; break; }
      } catch {}
    }
  }

  // Deduplicate by normalized URL
  const seen = new Set();
  const deduped = [];
  for (const r of allResults) {
    const key = r.url.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
    if (!seen.has(key) && r.title) { seen.add(key); deduped.push(r); }
  }

  const results = deduped.slice(0, count);
  searchCache.set(cacheKey, results);
  return results;
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Content Extraction
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const NOISE_SELECTORS = "script,style,nav,footer,header,aside,iframe,noscript,svg,[role=navigation],[role=banner],[role=contentinfo],.ad,.ads,.sidebar,.menu,.nav,.cookie,.popup,#sidebar,#footer,#header,#nav,#menu,#comments";
const MAIN_SELECTORS = ["article", "main", '[role="main"]', ".post-content", ".entry-content", ".article-content", ".content", ".post", ".story-body", "#content"];

async function fetchPage(url, maxChars = CFG.defaultContentChars) {
  const cacheKey = `p:${maxChars}:${url}`;
  const cached = pageCache.get(cacheKey);
  if (cached) return cached;

  const resp = await dedupedFetch(url, {
    timeout: CFG.fetchTimeout,
    headers: { Accept: "text/html,application/xhtml+xml", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
  });
  const html = await resp.text();
  let result;

  // Strategy 1: Readability (best for articles)
  try {
    const doc = new JSDOM(html, { url });
    const reader = new Readability(doc.window.document, { charThreshold: 100 });
    const article = reader.parse();
    if (article?.textContent?.trim().length > 200) {
      const content = article.textContent.replace(/\s+/g, " ").trim();
      result = {
        title: article.title || "",
        byline: article.byline || "",
        content: content.slice(0, maxChars),
        excerpt: article.excerpt || content.slice(0, 300),
        truncated: content.length > maxChars,
        totalLength: content.length,
        method: "readability",
      };
    }
  } catch {}

  // Strategy 2: Cheerio smart extraction
  if (!result) {
    const $ = cheerio.load(html);
    $(NOISE_SELECTORS).remove();

    let bestContent = "";
    for (const selector of MAIN_SELECTORS) {
      const text = $(selector).first().text().replace(/\s+/g, " ").trim();
      if (text.length > bestContent.length) bestContent = text;
    }
    if (bestContent.length < 200) bestContent = $("body").text().replace(/\s+/g, " ").trim();

    result = {
      title: $("title").text().trim(),
      byline: "",
      content: bestContent.slice(0, maxChars),
      excerpt: bestContent.slice(0, 300),
      truncated: bestContent.length > maxChars,
      totalLength: bestContent.length,
      method: "cheerio",
    };
  }

  pageCache.set(cacheKey, result);
  return result;
}

async function extractWithSelector(url, selector, maxChars = CFG.defaultContentChars) {
  const resp = await dedupedFetch(url, { timeout: CFG.fetchTimeout });
  const html = await resp.text();
  const $ = cheerio.load(html);
  const elements = $(selector);

  if (elements.length === 0) return { error: `No elements found: ${selector}` };

  let content = "";
  elements.each((i, el) => {
    content += $(el).text().replace(/\s+/g, " ").trim() + "\n";
  });

  return {
    selector,
    count: elements.length,
    content: content.slice(0, maxChars),
    truncated: content.length > maxChars,
    totalLength: content.length,
  };
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// MCP Server
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const server = new McpServer({ name: "ultimate-web-search-mcp", version: "4.0.0" });

// --- search ---
server.tool("search",
  "Multi-engine web search (Bing, Quark, Sogou, 360, Yandex). Parallel search, deduplication, anti-scraping, circuit breaker.",
  {
    query: z.string().describe("Search query"),
    engines: z.array(z.enum(["bing", "quark", "sogou", "360", "yandex"])).default(["bing", "quark", "sogou"]).describe("Search engines"),
    count: z.number().min(1).max(30).default(8).describe("Max results"),
    strategy: z.enum(["parallel", "fallback"]).default("parallel").describe("parallel=combine all; fallback=stop on first success"),
  },
  async ({ query, engines, count, strategy }) => {
    try {
      const results = await multiSearch(query, { engines, count, strategy });
      if (!results.length) return { content: [{ type: "text", text: `No results for "${query}".` }] };
      const text = results.map((r, i) => `${i + 1}. **${r.title}** [${r.engine}]\n   ${r.url}\n   ${r.snippet || ""}`).join("\n\n");
      return { content: [{ type: "text", text: `${results.length} results:\n\n${text}` }] };
    } catch (e) { return { content: [{ type: "text", text: `Search error: ${e.message}` }], isError: true }; }
  }
);

// --- fetch_page ---
server.tool("fetch_page",
  "Fetch full page content (up to 100KB). Readability + Cheerio extraction, cached.",
  {
    url: z.string().url().describe("URL to fetch"),
    max_chars: z.number().min(1000).max(200_000).default(CFG.defaultContentChars).describe("Max chars"),
  },
  async ({ url, max_chars }) => {
    try {
      const result = await fetchPage(url, max_chars);
      return {
        content: [{
          type: "text",
          text: `# ${result.title}\n\n${result.content}${result.truncated ? `\n\n[Truncated at ${max_chars}/${result.totalLength}]` : ""}\n\n---\n${result.method} | ${result.totalLength} chars`,
        }],
      };
    } catch (e) { return { content: [{ type: "text", text: `Fetch error: ${e.message}` }], isError: true }; }
  }
);

// --- extract ---
server.tool("extract",
  "Extract content by CSS selector.",
  {
    url: z.string().url().describe("URL"),
    selector: z.string().describe("CSS selector"),
    max_chars: z.number().min(1000).max(200_000).default(CFG.defaultContentChars).describe("Max chars"),
  },
  async ({ url, selector, max_chars }) => {
    try {
      const result = await extractWithSelector(url, selector, max_chars);
      if (result.error) return { content: [{ type: "text", text: result.error }], isError: true };
      return { content: [{ type: "text", text: `${result.count} elements:\n\n${result.content}${result.truncated ? `\n[Truncated]` : ""}` }] };
    } catch (e) { return { content: [{ type: "text", text: `Extract error: ${e.message}` }], isError: true }; }
  }
);

// --- search_and_read ---
server.tool("search_and_read",
  "Search + read top results in parallel. One-step deep research.",
  {
    query: z.string().describe("Search query"),
    engines: z.array(z.enum(["bing", "quark", "sogou", "360", "yandex"])).default(["bing", "quark", "sogou"]).describe("Engines"),
    read_count: z.number().min(1).max(5).default(1).describe("Pages to read"),
    max_chars_per_page: z.number().min(1000).max(100_000).default(30_000).describe("Max chars per page"),
  },
  async ({ query, engines, read_count, max_chars_per_page }) => {
    try {
      const results = await multiSearch(query, { engines, count: 10, strategy: "parallel" });
      if (!results.length) return { content: [{ type: "text", text: "No results." }] };

      const reads = await Promise.allSettled(
        results.slice(0, read_count).map(async (r) => {
          try { return { ...r, page: await fetchPage(r.url, max_chars_per_page) }; }
          catch (e) { return { ...r, page: null, error: e.message }; }
        })
      );

      const list = results.map((r, i) => `${i + 1}. ${r.title} [${r.engine}] 鈥?${r.url}`).join("\n");
      let pages = "";
      for (const pr of reads) {
        if (pr.status !== "fulfilled") continue;
        const r = pr.value;
        if (r.page) pages += `\n\n## ${r.page.title}\n${r.url}\n\n${r.page.content}${r.page.truncated ? `\n[Truncated]` : ""}`;
        else pages += `\n\n## ${r.title}\n[Failed: ${r.error}]`;
      }
      return { content: [{ type: "text", text: `Results:\n${list}\n\n---${pages}` }] };
    } catch (e) { return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true }; }
  }
);

// --- list_engines ---
server.tool("list_engines",
  "List engine status, cache stats, circuit breaker, metrics.",
  {},
  async () => {
    const engineList = Object.keys(ENGINES).map((name) => {
      const state = breaker.getState(name);
      const statusIcon = state.state === "closed" ? "鉁? : state.state === "half-open" ? "馃煛" : "馃敶";
      return `- **${name}**: ${statusIcon} ${state.state} (${state.failures} failures)`;
    });

    return {
      content: [{
        type: "text",
        text: [
          "## Engines",
          ...engineList,
          "",
          "## Cache",
          `- Search: ${searchCache.size}/${CFG.cacheMax} (TTL: ${CFG.cacheTtl / 1000}s)`,
          `- Page: ${pageCache.size}/${CFG.pageCacheMax} (TTL: ${CFG.pageCacheTtl / 1000}s)`,
          "",
          "## Concurrency",
          `- Active: ${globalConcurrency}/${CFG.maxGlobalConcurrent}`,
          `- Per engine: ${CFG.maxConcurrentPerEngine} max`,
          "",
          "## Metrics",
          metrics.getSummary(),
        ].join("\n"),
      }],
    };
  }
);

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?// Start Server
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Ultimate Web Search MCP v4.0 running");
