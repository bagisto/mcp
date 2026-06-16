// Shared result helpers so every tool returns a consistent MCP shape.

export function text(value) {
  return { content: [{ type: 'text', text: String(value) }] }
}
