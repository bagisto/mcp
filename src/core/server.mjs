// Generic MCP server wiring. Builds ListTools + CallTool from the tool registry
// and passes the shared context to each handler. Never changes when a new
// capability is added.

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

import { text } from './helpers.mjs'

export async function startServer({ name, version, tools, ctx }) {
  const server = new Server({ name, version }, { capabilities: { tools: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name: toolName, arguments: args = {} } = request.params
    const tool = tools.find((t) => t.name === toolName)
    if (!tool) return text(`Unknown tool: ${toolName}`)
    try {
      return await tool.handler(args, ctx)
    } catch (e) {
      return text(`Error in ${toolName}: ${e.message}`)
    }
  })

  await server.connect(new StdioServerTransport())
  return server
}
