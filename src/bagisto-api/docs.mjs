// Pure helpers for indexing + searching the Bagisto API docs corpus.
// A corpus item is: { path, title, transport, menu, body }
//   - path:      the page URL (e.g. /api/rest-api/admin/sales/orders/list)
//   - transport: 'rest' | 'graphql' | 'other'
//   - menu:      the surface sub-section (e.g. 'sales', 'catalog')
//
// These functions are dependency-free and covered by docs.test.mjs.
// loadCorpus() is the only IO function (reads a generated llms-full.txt).

import fs from 'node:fs'

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'for', 'in', 'on', 'with',
  'is', 'are', 'be', 'by', 'your', 'this', 'that', 'it', 'as', 'at', 'from',
])

const MAX_LIMIT = 50

export function tokenize(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t)
  )
}

// Normalize a doc URL path for tolerant matching (trim, drop trailing slash).
export function normalizePath(p) {
  let s = String(p || '').trim()
  if (s.length > 1) s = s.replace(/\/+$/, '')
  return s
}

// Parse a generated llms-full.txt into a corpus.
//
// Each page is emitted by the docs generator as:
//   \n\n---\n\n# <title>\nURL: <url>\n\n<body>\n
// The body is raw page markdown that frequently CONTAINS `---` lines itself
// (YAML frontmatter delimiters, the `examples:` block, markdown rules), so we
// MUST NOT split the file on `---`. Instead we anchor on the page header
// (`# <title>` immediately followed by `URL: /<path>`) and take each body as
// everything up to the next header. This preserves the full page content,
// including the frontmatter `examples:` blocks that hold the request/response
// shapes.
export function parseLlmsFull(text) {
  const str = String(text)
  const corpus = []
  const headerRe = /^#[ \t]+(.+?)[ \t]*\r?\nURL:[ \t]*(\/\S*)[ \t]*$/gm
  const matches = [...str.matchAll(headerRe)]

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const title = m[1].trim()
    const path = m[2].trim()

    const bodyStart = m.index + m[0].length
    const bodyEnd = i + 1 < matches.length ? matches[i + 1].index : str.length
    const body = str
      .slice(bodyStart, bodyEnd)
      .replace(/\n[ \t]*---[ \t]*\s*$/, '') // drop the trailing `---` page separator
      .trim()

    const transport = path.includes('/rest-api/')
      ? 'rest'
      : path.includes('/graphql-api/')
        ? 'graphql'
        : 'other'

    const segs = path.split('/').filter(Boolean)
    const surfaceIdx = segs.findIndex((s) => s === 'admin' || s === 'shop')
    const menu = surfaceIdx >= 0 && segs[surfaceIdx + 1] ? segs[surfaceIdx + 1] : ''

    corpus.push({ path, title, transport, menu, body })
  }

  return corpus
}

export function indexDocs(corpus) {
  return corpus.map((doc) => ({
    doc,
    tokens: new Set(tokenize(`${doc.title} ${doc.path} ${doc.body}`)),
    titleTokens: new Set(tokenize(`${doc.title} ${doc.path}`)),
  }))
}

export function searchDocs(index, query, limit = 10) {
  const terms = tokenize(query)
  if (!terms.length) return []
  const n = Math.max(1, Math.min(Number(limit) || 10, MAX_LIMIT))

  const scored = index
    .map((entry) => {
      let score = 0
      for (const term of terms) {
        if (entry.titleTokens.has(term)) score += 3
        else if (entry.tokens.has(term)) score += 1
      }
      return { doc: entry.doc, score }
    })
    .filter((r) => r.score > 0)

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, n).map((r) => r.doc)
}

export function listEndpoints(corpus, filter = {}) {
  return corpus.filter(
    (d) =>
      (!filter.transport || d.transport === filter.transport) &&
      (!filter.menu || d.menu === filter.menu)
  )
}

// Find a page by path, tolerant of a trailing slash / surrounding whitespace.
export function findDoc(corpus, path) {
  const want = normalizePath(path)
  if (!want) return null
  return corpus.find((d) => normalizePath(d.path) === want) || null
}

// A snippet for search results, centered on the first matched term when possible.
export function snippet(body, terms, len = 200) {
  const flat = String(body).replace(/\s+/g, ' ').trim()
  const list = Array.isArray(terms) ? terms : tokenize(terms)
  if (!list.length) return flat.slice(0, len)

  const low = flat.toLowerCase()
  let pos = -1
  for (const t of list) {
    const i = low.indexOf(t)
    if (i !== -1 && (pos === -1 || i < pos)) pos = i
  }
  if (pos === -1) return flat.slice(0, len)

  const start = Math.max(0, pos - 60)
  const end = start + len
  return (start > 0 ? '…' : '') + flat.slice(start, end) + (end < flat.length ? '…' : '')
}

export function loadCorpus(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return parseLlmsFull(text)
}
