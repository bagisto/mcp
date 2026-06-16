// Capability loader. Each capability is a folder under src/ with an index.mjs
// that exports a default object:
//
//   export default {
//     name: 'bagisto-api',
//     async init(config) { return { context: {...}, status: 'human-readable status' } },
//     tools: [ { name, description, inputSchema, handler(args, ctx) }, ... ],
//   }
//
// Adding a capability = drop a new folder with that shape. No core edits.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Folders under src/ that are NOT capabilities.
const RESERVED = new Set(['core'])

export async function loadCapabilities(srcDir, config) {
  const disabled = new Set(config.disabledCapabilities || [])
  const capabilities = []

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || RESERVED.has(entry.name) || disabled.has(entry.name)) continue

    const indexPath = path.join(srcDir, entry.name, 'index.mjs')
    if (!fs.existsSync(indexPath)) continue

    // A broken capability must not take the whole server down — skip it and warn.
    try {
      const mod = await import(pathToFileURL(indexPath).href)
      const cap = mod.default
      if (cap && Array.isArray(cap.tools)) capabilities.push(cap)
    } catch (e) {
      console.error(`Skipping capability "${entry.name}" — failed to load: ${e.message}`)
    }
  }

  return capabilities
}

// Initialise each capability, merge their contributed context, and collect tools.
export async function buildRegistry(capabilities, config) {
  const ctx = { config }
  const tools = []
  const loaded = []

  for (const cap of capabilities) {
    let status = 'ready'
    if (typeof cap.init === 'function') {
      try {
        const contributed = await cap.init(config)
        if (contributed?.context) Object.assign(ctx, contributed.context)
        if (contributed?.status) status = contributed.status
      } catch (e) {
        status = `failed to initialise: ${e.message}`
      }
    }
    tools.push(...cap.tools)
    loaded.push({ name: cap.name, tools: cap.tools.length, status })
  }

  return { ctx, tools, loaded }
}
