# Bagisto MCP

A small, **extensible** [MCP](https://modelcontextprotocol.io) server for Bagisto AI agents. It **runs on your machine** (no service to host).

Capabilities live in folders under `src/`, and the server auto-discovers them — so it grows by **adding a folder**, no core changes. On startup it prints which capabilities are loaded, e.g.:

```
Bagisto MCP ready — 1 capability loaded, 4 tools total:
  • bagisto-api — 753 pages from https://api-docs.bagisto.com/llms-full.txt (4 tools)
```

## Capabilities

| Capability (folder) | What it adds |
|---------------------|--------------|
| **`bagisto-api`** | Search the Bagisto REST + GraphQL **API documentation** on demand. By default fetches the latest published docs from `https://api-docs.bagisto.com/llms-full.txt` (cached locally), so you don't need the docs repo and it stays current. |

*(Currently API-only. More capabilities — e.g. recipes, OpenAPI, changelog — can be added later as new folders under `src/`; see [Extending](#extending).)*

It's optional: the agent skills work without it. The MCP adds fast, token-efficient, on-demand search across all ~750 doc pages.

## Tools the agent gets

From the **`bagisto-api`** capability:

| Tool | What it does | When the agent uses it |
|------|--------------|------------------------|
| `search_api_docs(query, limit?)` | Ranked matching pages (title + URL + snippet) | "find the add-to-cart endpoint", "how do I cancel an order" |
| `list_endpoints(transport?, menu?)` | Endpoints filtered by `rest`/`graphql` and menu (`sales`, `catalog`, …) | "list all admin sales endpoints" |
| `get_doc(path)` | Full content of one page by its URL path | After a search, to read the exact request/response of a page |
| `refresh_api_docs()` | Re-fetches the latest docs **without a restart** | "the docs were updated — refresh", or after the docs site redeploys, mid-session |

## Prerequisites

- **Node 18+** (uses the built-in `fetch`).

## Install

```bash
git clone https://github.com/bagisto/mcp    # or however you obtain this repo
cd mcp
npm install
```

## Register with your agent

### Claude Code

The command needs the **absolute path to `src/index.mjs` in this repo** — not a placeholder. The easiest, typo-proof way is to run it **from inside the cloned repo** and let the shell fill the path in with `$(pwd)`:

```bash
cd /path/to/mcp          # the folder you cloned (where this README lives)

claude mcp add bagisto-mcp -- node "$(pwd)/src/index.mjs"
```

Prefer an explicit path? Replace `<ABSOLUTE_PATH_TO_REPO>` with your real folder (run `pwd` inside the repo to see it):

```bash
claude mcp add bagisto-mcp -- node <ABSOLUTE_PATH_TO_REPO>/src/index.mjs
# e.g.  node /home/me/projects/mcp/src/index.mjs
```

**Verify:**

```bash
claude mcp list              # expect:  bagisto-mcp  …  ✓ Connected
```

> **Seeing `✗ Failed to connect`?** The path is wrong — almost always because the placeholder (`<ABSOLUTE_PATH_TO_REPO>` or a literal `/absolute/path/to/...`) was left in, so Node can't find the file. Remove it and re-add with the `$(pwd)` form above:
> ```bash
> claude mcp remove bagisto-mcp
> cd /path/to/mcp && claude mcp add bagisto-mcp -- node "$(pwd)/src/index.mjs"
> ```

Then in a session, just ask normally — e.g. *"use search_api_docs to find the place-order endpoint"*, or simply *"build a checkout flow"* (the shop skill + this MCP work together).

**Remove it:**

```bash
claude mcp remove bagisto-mcp
```

### Codex CLI

Codex reads MCP servers from `~/.codex/config.toml`. Add a **stdio** entry pointing at the absolute path to `src/index.mjs` (run `pwd` inside the repo to get the folder):

```toml
[mcp_servers.bagisto-mcp]
command = "node"
args = ["<ABSOLUTE_PATH_TO_REPO>/src/index.mjs"]
# optional — pin to a local snapshot or a staging mirror:
# env = { BAGISTO_DOCS_LLMS = "/path/to/llms-full.txt" }
```

Recent Codex builds can also add it straight from the CLI (run from inside the cloned repo so `$(pwd)` fills the path):

```bash
cd /path/to/mcp
codex mcp add bagisto-mcp -- node "$(pwd)/src/index.mjs"
codex mcp list                 # expect:  bagisto-mcp
```

Restart Codex; the server appears as `bagisto-mcp` and its tools (`search_api_docs`, `list_endpoints`, `get_doc`, `refresh_api_docs`) become available.

### Cursor, Windsurf & other MCP clients

Most clients read a JSON config (Cursor: `~/.cursor/mcp.json` or a project `.cursor/mcp.json`; Windsurf: `~/.codeium/windsurf/mcp_config.json`). Add a **stdio** server — `node` with the **absolute path** to `src/index.mjs` (run `pwd` inside the repo):

```json
{
  "mcpServers": {
    "bagisto-mcp": {
      "command": "node",
      "args": ["<ABSOLUTE_PATH_TO_REPO>/src/index.mjs"]
    }
  }
}
```

Replace `<ABSOLUTE_PATH_TO_REPO>` with your real folder (e.g. `/home/me/projects/mcp`). To pin/override the docs source, add an `"env": { "BAGISTO_DOCS_LLMS": "<url-or-file>" }` block — see [corpus source](#where-it-gets-the-docs-corpus-source).

> **VS Code** uses a slightly different shape — `"servers"` (not `"mcpServers"`) with `"type": "stdio"`, in `.vscode/mcp.json` — but the same `command` + `args`.

## Where it gets the docs (corpus source)

Resolved in this order:

1. **`BAGISTO_DOCS_LLMS`** override — an `llms-full.txt` **URL** *or* a local **file path**.
2. A bundled `llms-full.txt` sitting next to `src/` (optional offline snapshot).
3. **Default:** fetch `https://api-docs.bagisto.com/llms-full.txt`, and cache it locally (`llms-full.cache.txt`) so a brief network outage still works.

### Use cases for the override

| Goal | Command |
|------|---------|
| **Default** — always the latest published docs | `claude mcp add bagisto-mcp -- node …/src/index.mjs` |
| **Pin to a local snapshot** (version-lock / fully offline) | `claude mcp add bagisto-mcp --env BAGISTO_DOCS_LLMS=/path/to/llms-full.txt -- node …/src/index.mjs` |
| **Point at a different docs host** (staging, internal mirror) | `claude mcp add bagisto-mcp --env BAGISTO_DOCS_LLMS=https://staging.example.com/llms-full.txt -- node …/src/index.mjs` |

## Keeping it fresh

The server loads its corpus **once at startup** and answers from memory — it does **not** poll. To pick up newly-published docs you have two options:

- **Refresh in-session (no restart) — recommended:** call the **`refresh_api_docs`** tool, e.g. just tell the agent *"refresh the Bagisto API docs"*. It re-pulls the live `llms-full.txt` and swaps it in for the rest of the session — ideal for a long-running editor/IDE session you don't want to restart. (If the re-fetch fails, it keeps the docs it already had.)
- **Restart:** start a new agent session, or reload/re-add the MCP. The startup banner shows what it loaded.

> Either way, the MCP only mirrors what's **currently published** at the docs URL. So the docs site must be regenerated + deployed first:
> ```bash
> cd /path/to/bagisto-api-docs && npm run llms:generate   # rewrites src/public/llms-full.txt → deploy
> ```
> Then `refresh_api_docs` (or a restart) pulls it.

## Test

```bash
npm test
```

Runs the indexing/search unit tests (no network, no SDK required).

## How it works

A thin entry (`src/index.mjs`) loads the shared **core** (`src/core/`) and **auto-discovers capabilities** — every folder under `src/` that exports a capability module. Each capability contributes its data (via `init`) and its tools; the core builds one tool registry and serves it over stdio. The `bagisto-api` capability loads `llms-full.txt`, parses it into one record per page (`title`, `url`, `transport`, `menu`, `body`), and builds an in-memory token index. No database, no per-query network calls.

## Extending

Add a capability by **creating a folder** under `src/` (e.g. `src/recipes/`) with an `index.mjs` that exports:

```js
import { text } from '../core/helpers.mjs'

export default {
  name: 'recipes',
  // optional — load data once and add it to the shared context:
  async init(config) {
    return { context: { recipes: [...] }, status: 'loaded 12 recipes' }
  },
  // the tools this capability adds (handlers get (args, ctx)):
  tools: [
    {
      name: 'get_recipe',
      description: 'Return an end-to-end build recipe by name.',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      handler: (args, ctx) => text(/* … use ctx.recipes … */),
    },
  ],
}
```

The core auto-discovers it on the next start — **no changes** to `src/index.mjs` or `src/core/`. Put any logic/tests in the same folder (`*.test.mjs` is picked up by `npm test`). Disable a capability without deleting it via `BAGISTO_MCP_DISABLE=recipes`.

The startup banner then lists it alongside `bagisto-api`, so users always see exactly which capabilities are active.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Startup says "no corpus" | The site couldn't be reached and no local snapshot/cache exists. Check your connection, or set `BAGISTO_DOCS_LLMS` to a reachable URL or a local file. |
| Search returns stale results | The server holds the corpus it loaded at startup. Call **`refresh_api_docs`** to re-pull the latest in-session (no restart), or restart the MCP. Make sure the docs site was regenerated + deployed first. |
| `fetch is not defined` | You're on Node < 18. Upgrade Node. |
| Tools don't appear in the agent | Confirm the server is registered (`claude mcp list` / `codex mcp list`, or your client's MCP panel) and points at the **absolute** path to `src/index.mjs`; restart the agent so it reconnects. |

## License

[MIT](LICENSE)
