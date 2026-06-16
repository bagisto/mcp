import { test } from 'node:test'
import assert from 'node:assert'
import {
  indexDocs,
  searchDocs,
  listEndpoints,
  parseLlmsFull,
  findDoc,
  normalizePath,
  snippet,
} from './docs.mjs'

const corpus = [
  {
    path: '/api/rest-api/admin/sales/orders/list',
    title: 'List Orders',
    transport: 'rest',
    menu: 'sales',
    body: 'List orders with filters. GET /api/admin/orders',
  },
  {
    path: '/api/graphql-api/shop/queries/products',
    title: 'Products',
    transport: 'graphql',
    menu: 'queries',
    body: 'query products',
  },
]

test('searchDocs ranks the matching page first', () => {
  const idx = indexDocs(corpus)
  const hits = searchDocs(idx, 'orders filters')
  assert.equal(hits[0].title, 'List Orders')
})

test('searchDocs returns nothing for an empty / stopword-only query', () => {
  const idx = indexDocs(corpus)
  assert.deepEqual(searchDocs(idx, ''), [])
  assert.deepEqual(searchDocs(idx, 'the and of'), [])
})

test('listEndpoints filters by transport', () => {
  assert.equal(listEndpoints(corpus, { transport: 'graphql' }).length, 1)
  assert.equal(listEndpoints(corpus, { transport: 'rest' })[0].title, 'List Orders')
})

test('parseLlmsFull reads sections into a corpus', () => {
  const text =
    '# Bagisto API — Full Documentation\n\n' +
    '\n\n---\n\n# List Orders\nURL: /api/rest-api/admin/sales/orders/list\n\nGET /api/admin/orders\n' +
    '\n\n---\n\n# Products\nURL: /api/graphql-api/shop/queries/products\n\nquery products\n'
  const parsed = parseLlmsFull(text)
  assert.equal(parsed.length, 2)
  assert.equal(parsed[0].title, 'List Orders')
  assert.equal(parsed[0].transport, 'rest')
  assert.equal(parsed[0].menu, 'sales')
  assert.equal(parsed[1].transport, 'graphql')
})

// Regression: real doc pages embed YAML frontmatter and markdown `---` rules
// inside their body. The parser must NOT split on `---` (which truncated 714
// of 753 pages to empty bodies). It must keep the whole page body.
test('parseLlmsFull preserves bodies that contain `---` (frontmatter / rules)', () => {
  const text =
    '\n\n---\n\n# Add to Cart\nURL: /api/rest-api/shop/cart/add-to-cart\n\n' +
    '---\n' +
    'outline: false\n' +
    'examples:\n' +
    '  - id: add-simple\n' +
    '    request: POST /api/shop/add-product-in-cart\n' +
    '    response: { "id": 6698 }\n' +
    '---\n\n' +
    '# Add to Cart\n\nSend `productId` + `quantity`.\n\n' +
    '---\n\n' + // an in-body horizontal rule
    'Related: groupedQty, bundleOptions.\n' +
    '\n\n---\n\n# Next Page\nURL: /api/rest-api/shop/cart/get-cart\n\nRead the cart.\n'

  const parsed = parseLlmsFull(text)
  assert.equal(parsed.length, 2)

  const addToCart = parsed[0]
  assert.equal(addToCart.path, '/api/rest-api/shop/cart/add-to-cart')
  // the whole body survives — frontmatter examples + the in-body rule content
  assert.ok(addToCart.body.includes('examples:'), 'frontmatter examples kept')
  assert.ok(addToCart.body.includes('"id": 6698'), 'response example kept')
  assert.ok(addToCart.body.includes('groupedQty'), 'content after an in-body --- kept')
  // it must NOT bleed into the next page
  assert.ok(!addToCart.body.includes('Read the cart'), 'no bleed into the next page')
  assert.equal(parsed[1].title, 'Next Page')
})

test('findDoc tolerates a trailing slash and surrounding whitespace', () => {
  assert.equal(findDoc(corpus, '/api/rest-api/admin/sales/orders/list')?.title, 'List Orders')
  assert.equal(findDoc(corpus, '/api/rest-api/admin/sales/orders/list/')?.title, 'List Orders')
  assert.equal(findDoc(corpus, '  /api/rest-api/admin/sales/orders/list  ')?.title, 'List Orders')
  assert.equal(findDoc(corpus, '/nope'), null)
})

test('normalizePath strips a trailing slash but keeps root', () => {
  assert.equal(normalizePath('/a/b/'), '/a/b')
  assert.equal(normalizePath('/a/b'), '/a/b')
  assert.equal(normalizePath('/'), '/')
})

test('snippet centers on the first matched term', () => {
  const body = 'X'.repeat(300) + ' the place-order endpoint finalises a cart ' + 'Y'.repeat(300)
  const s = snippet(body, ['place-order'])
  assert.ok(s.includes('place-order'), 'snippet contains the matched term')
  assert.ok(s.length <= 202, 'snippet is bounded')
})
