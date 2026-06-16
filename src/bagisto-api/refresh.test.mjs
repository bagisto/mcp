import { test } from 'node:test'
import assert from 'node:assert'
import { fileURLToPath } from 'node:url'
import capability from './index.mjs'

// Point the loader at the bundled snapshot so the test never hits the network.
const cachePath = fileURLToPath(new URL('./llms-full.cache.txt', import.meta.url))

test('bagisto-api exposes the expected tools (incl. refresh)', () => {
  const names = capability.tools.map((t) => t.name)
  for (const n of ['search_api_docs', 'list_endpoints', 'get_doc', 'refresh_api_docs']) {
    assert.ok(names.includes(n), `missing tool: ${n}`)
  }
})

test('refresh_api_docs reloads the corpus into ctx without a restart', async () => {
  const refresh = capability.tools.find((t) => t.name === 'refresh_api_docs')
  const ctx = {
    config: { docsSource: cachePath, defaultDocsUrl: 'http://invalid.invalid/x', fetchTimeoutMs: 1000 },
    docs: { corpus: [], index: [], source: null },
  }

  const res = await refresh.handler({}, ctx)
  const out = res.content[0].text

  assert.match(out, /Refreshed/)
  assert.ok(ctx.docs.corpus.length > 100, 'corpus was repopulated in place')
  // and a subsequent get_doc now resolves against the refreshed corpus
  const get = capability.tools.find((t) => t.name === 'get_doc')
  const page = get.handler({ path: ctx.docs.corpus[0].path }, ctx)
  assert.ok(page.content[0].text.startsWith('# '), 'get_doc works after refresh')
})
