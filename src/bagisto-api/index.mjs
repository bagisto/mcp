// Capability: bagisto-api — search the Bagisto REST + GraphQL API documentation.
//
// Exposes four tools (search_api_docs / list_endpoints / get_doc /
// refresh_api_docs) over the generated llms-full.txt corpus. It owns its own
// data loading via init().

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { text } from '../core/helpers.mjs'
import {
  parseLlmsFull,
  indexDocs,
  searchDocs,
  listEndpoints,
  findDoc,
  snippet,
  tokenize,
} from './docs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const isUrl = (s) => /^https?:\/\//i.test(s)
const cacheFile = () => path.join(here, 'llms-full.cache.txt')

// Resolve the docs corpus text. Order:
//   1. config.docsSource as a local file (override)
//   2. a bundled llms-full.txt snapshot next to this capability (offline)
//   3. fetch the configured/default URL (validated + cached; falls back to cache)
async function loadCorpusText(config) {
  const src = config.docsSource

  if (src && !isUrl(src) && fs.existsSync(src)) {
    return { text: fs.readFileSync(src, 'utf8'), source: src }
  }

  if (!src || !isUrl(src)) {
    for (const p of [path.join(here, 'llms-full.txt'), path.join(here, '..', 'llms-full.txt')]) {
      if (fs.existsSync(p)) return { text: fs.readFileSync(p, 'utf8'), source: p }
    }
  }

  const url = src && isUrl(src) ? src : config.defaultDocsUrl
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs)
    let body
    try {
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      body = await res.text()
    } finally {
      clearTimeout(timer)
    }
    // Only trust + cache a response that parses as the docs corpus — never
    // overwrite a good cache with an HTML error page or an empty body.
    if (parseLlmsFull(body).length === 0) {
      throw new Error('fetched docs did not parse (unexpected format or empty body)')
    }
    try { fs.writeFileSync(cacheFile(), body) } catch { /* cache is best-effort */ }
    return { text: body, source: url }
  } catch (e) {
    if (fs.existsSync(cacheFile())) {
      return { text: fs.readFileSync(cacheFile(), 'utf8'), source: `${cacheFile()} (cached — fetch failed: ${e.message})` }
    }
    return { text: '', source: null }
  }
}

// Load + parse + index the docs corpus. Shared by init() (startup) and the
// refresh_api_docs tool (on demand). Returns everything the tools read.
async function loadDocs(config) {
  const { text: corpusText, source } = await loadCorpusText(config)
  const corpus = corpusText ? parseLlmsFull(corpusText) : []
  const index = indexDocs(corpus)
  const status = corpus.length
    ? `${corpus.length} pages from ${source}`
    : 'no corpus (docs unreachable — set BAGISTO_DOCS_LLMS to a URL or file)'
  return { corpus, index, source, status }
}

const tools = [
  {
    name: 'search_api_docs',
    description:
      'Search the Bagisto API documentation. Returns the best-matching endpoint pages with their title, URL, and a snippet.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search terms, e.g. "create order" or "cart coupon".' },
        limit: { type: 'integer', description: 'Max results (default 10).' },
      },
      required: ['query'],
    },
    handler: (args, ctx) => {
      const docs = ctx.docs
      if (!docs || !docs.index.length) {
        return text(
          'No docs corpus loaded — could not reach the docs site and no local snapshot was found. Check your connection, or set BAGISTO_DOCS_LLMS to an llms-full.txt URL or file path.'
        )
      }
      const query = (args.query || '').trim()
      if (!query) return text('Provide a search query, e.g. "add to cart", "cancel order", or "checkout payment methods".')
      const terms = tokenize(query)
      const hits = searchDocs(docs.index, query, args.limit || 10)
      if (!hits.length) return text(`No matches for "${query}".`)
      return text(hits.map((d) => `- ${d.title} (${d.path}) [${d.transport}]\n  ${snippet(d.body, terms)}`).join('\n'))
    },
  },
  {
    name: 'list_endpoints',
    description:
      'List documented Bagisto API endpoints, optionally filtered by transport (rest|graphql) and menu (e.g. sales, catalog).',
    inputSchema: {
      type: 'object',
      properties: {
        transport: { type: 'string', enum: ['rest', 'graphql', 'other'] },
        menu: { type: 'string', description: 'Surface sub-section, e.g. sales, catalog, customers.' },
      },
    },
    handler: (args, ctx) => {
      const results = listEndpoints(ctx.docs?.corpus || [], { transport: args.transport, menu: args.menu })
      if (!results.length) return text('No endpoints match that filter.')
      return text(results.map((d) => `- ${d.title} (${d.path}) [${d.transport}]`).join('\n'))
    },
  },
  {
    name: 'get_doc',
    description: 'Return the full content of one documentation page by its URL path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The page URL, e.g. /api/rest-api/admin/sales/orders/list' },
      },
      required: ['path'],
    },
    handler: (args, ctx) => {
      const doc = findDoc(ctx.docs?.corpus || [], args.path || '')
      if (!doc) return text(`No page found at ${args.path}. Use list_endpoints or search_api_docs to find the path.`)
      return text(`# ${doc.title}\nURL: ${doc.path}\n\n${doc.body}`)
    },
  },
  {
    name: 'refresh_api_docs',
    description:
      'Re-fetch the latest Bagisto API documentation from the source — no server restart needed. Use when the docs site has been updated and you want the newest endpoints in this session.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (args, ctx) => {
      const before = ctx.docs?.corpus?.length ?? 0
      const next = await loadDocs(ctx.config)
      if (!next.corpus.length) {
        return text(`Refresh failed — ${next.status}. Kept the previous ${before} page(s).`)
      }
      // Swap the corpus + index in place so every subsequent tool call sees it.
      ctx.docs = next
      return text(`Refreshed — now ${next.corpus.length} pages from ${next.source} (was ${before}).`)
    },
  },
]

export default {
  name: 'bagisto-api',
  description: 'Bagisto REST + GraphQL API documentation search.',

  async init(config) {
    const docs = await loadDocs(config)
    return { context: { docs }, status: docs.status }
  },

  tools,
}
