import { createServer } from 'node:http';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { root, generatedFiles } from './content.mjs';
import { build } from './build.mjs';

const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
build();

const clients = new Set();
let revision = Date.now();
const reloadClient = `<script data-preview-revision="__REVISION__">
(() => {
  const events = new EventSource('/__reload');
  let current;
  events.onmessage = ({ data }) => {
    if (current !== undefined && current !== data) location.reload();
    current = data;
  };
})();
</script>`;

const server = createServer((request, response) => {
  try {
    if (request.url === '/__reload') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      response.write(`data: ${revision}\n\n`);
      clients.add(response);
      request.on('close', () => clients.delete(response));
      return;
    }
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '') || 'index.html';
    const file = resolve(root, path);
    if (!file.startsWith(`${root}${sep}`) || !(generatedFiles.has(path) || path.startsWith('assets/'))) {
      response.writeHead(404).end('Not found');
      return;
    }
    const content = readFileSync(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(extname(file) === '.html' ? content.toString('utf8').replace('</body>', `${reloadClient.replace('__REVISION__', String(revision))}\n</body>`) : content);
  } catch {
    response.writeHead(404).end('Not found');
  }
});
server.on('error', error => { console.error(error.message); clearInterval(poll); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port} (Ctrl+C to stop). Pages refresh automatically after successful builds.`));

// Poll this small source tree to work across macOS, Linux and synced folders.
function sourceStamp() {
  return ['content', 'src/templates', 'assets/css', 'assets/js'].flatMap(directory => {
    const base = resolve(root, directory);
    return readdirSync(base, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => { const file = resolve(entry.parentPath, entry.name); const stat = statSync(file); return `${file}:${stat.size}:${stat.mtimeMs}`; });
  }).sort().join('|');
}
let stamp = sourceStamp();
const poll = setInterval(() => {
  try {
    const next = sourceStamp();
    if (stamp !== next) {
      stamp = next;
      build();
      revision++;
      clients.forEach(client => client.write(`data: ${revision}\n\n`));
      console.log('Rebuilt. Browser refreshed.');
    }
  } catch (error) { console.error(`Build failed: ${error.message}`); }
}, 750);
function close() { clearInterval(poll); clients.forEach(client => client.end()); server.close(); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
