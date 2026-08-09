#!/usr/bin/env node
// Oira concierge MCP server (advisory, read-only). See docs/MCP-ARCHITECTURE.md.
// Exposes ONLY governed, read-only tools over the coarse palette. No seal/match/settle/payout
// tool exists here by design. Speaks MCP over stdio, so any MCP client (Claude Desktop, an agent
// runtime, a server-side Gemma) can use it.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Palette } from './policy.mjs';
import { checkColour, askOira } from './tools.mjs';

const server = new McpServer({ name: 'oira-concierge', version: '0.1.0' });

server.tool(
  'check_colour',
  'Judge whether a specific shade suits her, using only her coarse palette (season/undertone/depth). Never sees raw traits. Input: hex colour + palette.',
  { hex: z.string().regex(/^#?[0-9a-fA-F]{6}$/), palette: Palette },
  async ({ hex, palette }) => {
    try { return { content: [{ type: 'text', text: await checkColour({ hex, palette }) }] }; }
    catch (e) { return { isError: true, content: [{ type: 'text', text: 'refused: ' + e.message }] }; }
  },
);

server.tool(
  'ask_oira',
  'Answer a beauty question (what suits her, her season, how brands pay, privacy, her colour history) over her coarse palette only. Advisory, read-only. Input: question + palette.',
  { question: z.string().min(1).max(300), palette: Palette },
  async ({ question, palette }) => {
    try { return { content: [{ type: 'text', text: await askOira({ question, palette }) }] }; }
    catch (e) { return { isError: true, content: [{ type: 'text', text: 'refused: ' + e.message }] }; }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write('[oira-mcp] concierge server ready (stdio)\n');
