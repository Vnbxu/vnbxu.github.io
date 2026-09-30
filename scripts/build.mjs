import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import nunjucks from 'nunjucks';
import { root, loadContent, validateUrl } from './content.mjs';

const md = new MarkdownIt({ html: false, linkify: false });
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(resolve(root, 'src/templates'), { noCache: true }), { autoescape: true, trimBlocks: true, lstripBlocks: true });
env.addFilter('markdown', value => md.render(value));
env.addFilter('originalDate', value => value === 'Present' ? value : `${value.slice(0, 4)}.${Number(value.slice(5, 7))}`);
env.addFilter('monthYear', value => value === 'Present' ? value : `${monthNames[Number(value.slice(5, 7)) - 1].slice(0, 3)} ${value.slice(0, 4)}`);
env.addFilter('updateDate', value => `${monthNames[Number(value.slice(5, 7)) - 1]} ${value.slice(0, 4)}`);
env.addFilter('local', value => !/^(https?:|mailto:)/.test(value));

function xml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character]));
}

export function currentMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).slice(0, 7);
}

export function renderSite(data = loadContent(), { month = currentMonth(), savedMonths = {} } = {}) {
  const papers = [...data.publications].sort((a, b) => b.year - a.year);
  const byId = new Map(papers.map(paper => [paper.id, paper]));
  const groups = [...new Set(papers.map(paper => paper.year))].map(year => ({ year, papers: papers.filter(paper => paper.year === year) }));
  const context = {
    ...data,
    about: md.render(data.about),
    publications: papers,
    featured: (data.site.featured_publications ?? []).map(id => byId.get(id)),
    projects: data.projects.map(project => ({ ...project, paper: byId.get(project.publication), links: project.links ?? byId.get(project.publication)?.links ?? [] })),
    groups,
    scholar: data.site.links.find(link => link.label === 'Google Scholar'),
    asset_versions: Object.fromEntries(['css/site.css', 'js/publications.js'].map(path => [path.split('/')[0], createHash('sha256').update(readFileSync(resolve(root, 'assets', path))).digest('hex').slice(0, 10)])),
  };
  const pages = [
    { template: 'home.njk', title: 'Home', path: 'index.html', body_class: 'home-page', description: data.site.description, updated: data.site.updated === 'auto' ? savedMonths['index.html'] ?? month : data.site.updated },
    { template: 'publications.njk', title: 'Publications', path: 'publications.html', body_class: 'publications-page', description: `Publications by ${data.site.name}.`, updated: data.site.publications_updated === 'auto' ? savedMonths['publications.html'] ?? month : data.site.publications_updated },
  ];
  const outputs = new Map(pages.map(page => [page.path, env.render(page.template, { ...context, page }).trim() + '\n']));
  outputs.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page => `  <url><loc>${xml(`${data.site.url}/${page.path}`)}</loc></url>`).join('\n')}\n</urlset>\n`);
  outputs.set('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${data.site.url}/sitemap.xml\n`);
  validateOutput(outputs);
  return outputs;
}

export function validateOutput(outputs) {
  for (const [file, html] of outputs) {
    if (!file.endsWith('.html')) continue;
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
    if (new Set(ids).size !== ids.length) throw new Error(`${file}: duplicate HTML id`);
    if ([...html.matchAll(/<h1\b/g)].length !== 1) throw new Error(`${file}: expected exactly one h1`);
    for (const [, attribute] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const url = attribute.replaceAll('&amp;', '&');
      validateUrl(url, `${file} link`);
      if (/^(https?:|mailto:)/.test(url)) continue;
      const [target, anchor] = url.split('#');
      if (anchor) {
        const targetHtml = outputs.get(target.split('?')[0] || file);
        if (targetHtml && !targetHtml.includes(`id="${anchor}"`)) throw new Error(`${file}: missing anchor ${url}`);
      }
    }
  }
}

export function build({ check = false } = {}) {
  const savedMonths = {};
  if (check) {
    // A read-only check retains the published month, so CI does not mark a page
    // stale just because the calendar changed. Builds use the current month.
    for (const file of ['index.html', 'publications.html']) {
      let html;
      try { html = readFileSync(resolve(root, file), 'utf8'); } catch { continue; }
      const match = html.match(/<time datetime="(\d{4}-(?:0[1-9]|1[0-2]))">/);
      if (match) savedMonths[file] = match[1];
    }
  }
  const outputs = renderSite(loadContent(), { savedMonths });
  for (const [file, content] of outputs) {
    if (check) {
      let saved;
      try { saved = readFileSync(resolve(root, file), 'utf8'); } catch { /* Report missing output below. */ }
      if (saved !== content) throw new Error(`${file} is missing or stale. Run npm run build.`);
    } else {
      writeFileSync(resolve(root, file), content);
    }
  }
  return outputs;
}

export function releaseFiles(outputs = renderSite()) {
  const files = new Map([...outputs].filter(([file]) => file.endsWith('.html')));
  files.set('.nojekyll', '');
  const assets = new Set();
  function include(url, parent = '') {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return;
    const path = decodeURIComponent(url.split(/[?#]/)[0]);
    if (!path) return;
    const file = posix.normalize(posix.join(parent, path));
    if (files.has(file)) return;
    if (!file.startsWith('assets/')) throw new Error(`Export: unsupported local link ${file}. Put public resources in assets/.`);
    validateUrl(file, 'Export resource');
    assets.add(file);
  }
  for (const [file, html] of files) {
    if (!file.endsWith('.html')) continue;
    for (const [, url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) include(url.replaceAll('&amp;', '&'));
  }
  // Set iteration also visits dependencies added while reading a stylesheet.
  for (const file of assets) {
    const content = readFileSync(resolve(root, file));
    files.set(file, content);
    if (file.endsWith('.css')) {
      const css = content.toString('utf8');
      for (const [, url] of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) include(url, posix.dirname(file));
      for (const [, url] of css.matchAll(/@import\s+["']([^"']+)["']/g)) include(url, posix.dirname(file));
    }
  }
  return files;
}

export function exportSite() {
  const files = releaseFiles();
  const destination = resolve(root, '_local/publish');
  // This directory contains generated release files only; rebuild it to avoid
  // carrying obsolete resources into the next upload.
  rmSync(destination, { recursive: true, force: true });
  for (const [file, content] of files) {
    const target = resolve(destination, file);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, content);
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const check = process.argv.includes('--check');
    const exporting = process.argv.includes('--export');
    const outputs = exporting ? exportSite() : build({ check });
    console.log(exporting ? `Exported ${outputs.size} files to _local/publish/.` : `${check ? 'Checked' : 'Built'} ${outputs.size} static files. Content, local resources and anchors validated.`);
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
