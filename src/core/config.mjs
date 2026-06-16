// Central config for the Bagisto MCP server. Env-overridable so the same build
// works against the live docs, a local snapshot, or a staging mirror.

export const config = {
  // Server identity (shown in the MCP handshake + the startup banner).
  serverName: 'bagisto-mcp',
  serverVersion: '1.0.0',
  displayName: 'Bagisto MCP',

  // --- bagisto-api capability ---
  // A URL or local file path that overrides the docs source; empty = default.
  docsSource: process.env.BAGISTO_DOCS_LLMS || '',
  defaultDocsUrl: 'https://api-docs.bagisto.com/llms-full.txt',
  fetchTimeoutMs: 10000,

  // Optional: comma-separated capability folder names to skip (e.g. "recipes").
  disabledCapabilities: (process.env.BAGISTO_MCP_DISABLE || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
}
