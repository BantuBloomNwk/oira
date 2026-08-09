// Proves the tools work AND the guardrails hold, both directly and over the real MCP protocol.
import { fileURLToPath } from 'url';
import { checkColour, askOira } from './tools.mjs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const PALETTE = { season: 'Deep Winter', under: 'Cool', depthWord: 'Deep', depthNum: 4, monk: 8, earned: 5, lang: 'en' };
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  PASS', m); } else { fail++; console.log('  FAIL', m); } };

console.log('\n[direct tool tests]');
ok(/yours/i.test(await checkColour({ hex: '#8A2C4B', palette: PALETTE })), 'check_colour berry -> suits a Deep Winter Cool');
ok(/warm|cooler/i.test(await checkColour({ hex: '#C08A4A', palette: PALETTE })), 'check_colour camel -> flags the undertone clash');
ok((await askOira({ question: 'what are my colours?', palette: PALETTE })).includes('Deep Winter'), 'ask_oira season -> grounded');
ok(/vault|selfie|cryptography/i.test(await askOira({ question: 'is my data safe?', palette: PALETTE })), 'ask_oira privacy answer');

console.log('\n[guardrails]');
let blocked = false;
try { await checkColour({ hex: '#8A2C4B', palette: { ...PALETTE, selfie: 'data:...' } }); } catch { blocked = true; }
ok(blocked, 'rejects a palette carrying a raw "selfie" field (.strict redaction)');
blocked = false;
try { await checkColour({ hex: '#8A2C4B', palette: { ...PALETTE, ita: 41 } }); } catch { blocked = true; }
ok(blocked, 'rejects a palette carrying raw "ita" measurement');
blocked = false;
try { await checkColour({ hex: 'nothex', palette: PALETTE }); } catch { blocked = true; }
ok(blocked, 'rejects a malformed hex');

console.log('\n[end-to-end over the MCP protocol]');
const transport = new StdioClientTransport({ command: 'node', args: [fileURLToPath(new URL('./oira-mcp-server.mjs', import.meta.url))] });
const client = new Client({ name: 'oira-test-client', version: '0.1.0' });
await client.connect(transport);
const tools = (await client.listTools()).tools.map((t) => t.name);
ok(tools.includes('check_colour') && tools.includes('ask_oira'), 'server advertises the two read-only tools: ' + tools.join(', '));
ok(!tools.some((t) => /seal|settle|payout|match/.test(t)), 'server exposes NO money-moving tool');
const res = await client.callTool({ name: 'check_colour', arguments: { hex: '#0E6B5C', palette: PALETTE } });
ok(/yours|shade/i.test(res.content[0].text), 'callTool check_colour emerald over the wire: "' + res.content[0].text.slice(0, 60) + '..."');
await client.close();

console.log(`\n${fail ? 'FAILURES: ' + fail : 'ALL GREEN'} (${pass} passed)\n`);
process.exit(fail ? 1 : 0);
