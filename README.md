# Ultimate Web Search MCP Server

Production-grade multi-engine web search MCP server. Works with **OpenClaw**, **AstrBot**, and any MCP-compatible client.

## 鉁?Features

- **5 Search Engines**: Bing, Quark (澶稿厠), Sogou (鎼滅嫍), 360, Yandex
- **Parallel Search**: Query multiple engines simultaneously, merge & deduplicate
- **Anti-Scraping**: UA rotation, adaptive rate limiting, random jitter
- **Circuit Breaker**: Auto-isolate failing engines, fast recovery
- **LRU Cache**: 1000 search + 300 page cache, 15min TTL
- **Concurrency Control**: Per-engine + global limits, adaptive under load
- **Smart Extraction**: Mozilla Readability + Cheerio (100KB per page)
- **Metrics**: Real-time engine stats, cache hit rate, latency tracking
- **Zero API Keys**: All engines work without authentication

## 馃搧 Project Structure

```
ultimate-web-search-mcp/
鈹溾攢鈹€ openclaw/          # OpenClaw version
鈹?  鈹溾攢鈹€ server.js
鈹?  鈹斺攢鈹€ package.json
鈹溾攢鈹€ astrbot/           # AstrBot version
鈹?  鈹溾攢鈹€ server.js
鈹?  鈹斺攢鈹€ package.json
鈹溾攢鈹€ README.md
鈹溾攢鈹€ LICENSE
鈹斺攢鈹€ .gitignore
```

## 馃殌 Quick Start

### OpenClaw

```bash
cd openclaw
npm install
```

Add to `~/.openclaw/openclaw.json`:

```json
{
  "mcp": {
    "servers": {
      "web-search": {
        "command": "node",
        "args": ["/path/to/openclaw/server.js"]
      }
    }
  }
}
```

### AstrBot

```bash
cd astrbot
npm install
```

Add MCP server in AstrBot WebUI:

```json
{
  "command": "node",
  "args": ["/path/to/astrbot/server.js"]
}
```

### Claude Desktop

```bash
cd openclaw
npm install
```

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "node",
      "args": ["/path/to/openclaw/server.js"]
    }
  }
}
```

## 馃摝 Tools

| Tool | Description |
|------|-------------|
| `search` | Multi-engine parallel web search |
| `fetch_page` | Fetch full page content (up to 100KB) |
| `extract` | Extract content by CSS selector |
| `search_and_read` | Search + read top results in one step |
| `list_engines` | View engine status, cache, metrics |

## 馃寪 Engines

| Engine | Region | Strength |
|--------|--------|----------|
| **Bing** | Global | Most stable, good quality |
| **Quark** | China | Best Chinese content |
| **Sogou** | China | WeChat articles, Chinese web |
| **360** | China | Alternative Chinese results |
| **Yandex** | Global | Russian/European content |

## 馃洝锔?Stability

- **Circuit Breaker**: 4 failures 鈫?open 鈫?30s 鈫?half-open 鈫?success 鈫?closed
- **Adaptive Rate Limiting**: 150ms base, auto-reduces up to 70% under load
- **Concurrency Control**: 4 per engine, 20 global max
- **Cache**: 1000 search + 300 page, LRU eviction

## 馃搳 Performance

| Metric | Value |
|--------|-------|
| Concurrent queries | 15+ |
| Success rate | 100% |
| Avg latency | ~2s |
| Cache hit | <10ms |
| Max page size | 100KB |

## 馃搫 License

MIT
