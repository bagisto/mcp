#!/usr/bin/env node
// Bagisto MCP server — a local, extensible MCP for Bagisto AI agents.
//
// Capabilities live in folders under src/ (each with an index.mjs exporting
// { name, init?, tools }). The server auto-discovers them, so adding a new
// capability is just adding a folder — no changes here or in core/.
//
// Currently bundled capabilities: bagisto-api (API documentation search).

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from './core/config.mjs'
import { loadCapabilities, buildRegistry } from './core/loader.mjs'
import { startServer } from './core/server.mjs'

const srcDir = path.dirname(fileURLToPath(import.meta.url))

const capabilities = await loadCapabilities(srcDir, config)
const { ctx, tools, loaded } = await buildRegistry(capabilities, config)

await startServer({
  name: config.serverName,
  version: config.serverVersion,
  tools,
  ctx,
})

// Startup banner (stderr) — tells the user which server this is and exactly
// which capabilities are active right now (so it's clear it's API-only today).
const list = loaded.length
  ? loaded.map((c) => `  • ${c.name} — ${c.status} (${c.tools} tool${c.tools === 1 ? '' : 's'})`).join('\n')
  : '  • (none found)'

console.error(
  `${config.displayName} ready — ${loaded.length} capabilit${loaded.length === 1 ? 'y' : 'ies'} loaded, ${tools.length} tool${tools.length === 1 ? '' : 's'} total:\n` +
    `${list}\n` +
    'Add more capabilities by dropping a new folder under src/.'
)
