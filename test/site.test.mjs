import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import nunjucks from 'nunjucks';
import { root, loadContent, validateContent, readYaml } from '../scripts/content.mjs';
import { renderSite, validateOutput, releaseFiles } from '../scripts/build.mjs';

test('renders every publication and preserves author order, equal authors and citations', () => {
  const content = loadContent();
  const html = renderSite(content).get('publications.html');
  const position = content.publications.map(paper => html.indexOf(`id="${paper.id}"`));
  assert.ok(position.every(index => index >= 0));
  assert.equal((html.match(/class="paper"/g) || []).length, content.publications.length);
  assert.equal((html.match(/<sup>\*<\/sup>/g) || []).length, content.publications.flatMap(paper => paper.authors).filter(author => author.equal).length);
  for (const paper of content.publications) {
    const article = html.match(new RegExp(`<article class="paper" id="${paper.id}"[\\s\\S]*?</article>`))[0];
    const authorLine = article.match(/<p class="paper-authors">(.*?)<\/p>/)[1];
    let cursor = -1;
    for (const author of paper.authors) {
      const next = authorLine.indexOf(nunjucks.lib.escape(author.name), cursor + 1);
      assert.ok(next > cursor, `${paper.id}: author order`);
      cursor = next;
    }
    if (paper.bibtex) assert.ok(article.includes(nunjucks.lib.escape(paper.bibtex)));
  }
});

test('build is deterministic and does not mutate the content', () => {
  const content = loadContent();
  const before = structuredClone(content);
  assert.deepEqual(renderSite(content), renderSite(content));
  assert.deepEqual(content, before);
});

test('minimal release contains every local page dependency and preserves binary resources', () => {
  const files = releaseFiles();
  assert.ok(files.has('.nojekyll'));
  assert.ok(!files.has('robots.txt'));
  assert.ok(!files.has('sitemap.xml'));
  for (const file of files.keys()) assert.ok(file.endsWith('.html') || file === '.nojekyll' || file.startsWith('assets/'));
  for (const [file, html] of files) {
    if (!file.endsWith('.html')) continue;
    for (const [, url] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (/^(?:https?:|mailto:|#)/.test(url)) continue;
      assert.ok(files.has(decodeURIComponent(url.split(/[?#]/)[0])), `Release is missing ${url}`);
    }
  }
  assert.deepEqual(files.get('assets/slides/aida_sigcomm26.pdf'), readFileSync(resolve(root, 'assets/slides/aida_sigcomm26.pdf')));
  assert.deepEqual(files.get('assets/images/favicon-hx.png'), readFileSync(resolve(root, 'assets/images/favicon-hx.png')));
});

test('rejects common content mistakes before generating files', () => {
  for (const [mutate, message] of [
    [data => { data.publications.push(structuredClone(data.publications[0])); }, /duplicate id/],
    [data => { data.site.featured_publications = ['missing-paper']; }, /unknown publication/],
    [data => { data.projects = [{ id: 'demo', name: 'Example', topic: 'Example', description: 'Example', publication: 'missing-paper' }]; }, /unknown publication/],
    [data => { data.publications[0].authors[0].equal = 'true'; }, /true or false/],
    [data => { data.education[0].start = '2025-13'; }, /YYYY-MM/],
    [data => { data.publications[0].links[0].url = 'assets/slides/missing.pdf'; }, /missing local resource/],
    [data => { data.publications[0].url = 'javascript:alert(1)'; }, /unsupported URL/],
    [data => { data.publications[0].url = '../private.txt'; }, /inside the website/],
    [data => { data.publications[0].title = ''; }, /non-empty text/],
  ]) {
    const content = loadContent();
    mutate(content);
    assert.throws(() => validateContent(content), message);
  }
});

test('YAML errors identify the file, including duplicate keys', () => {
  const dir = mkdtempSync(resolve(tmpdir(), 'homepage-test-'));
  try {
    const file = resolve(dir, 'bad.yml');
    writeFileSync(file, 'name: First\nname: Second\n');
    assert.throws(() => readYaml(file), /bad.yml.*Map keys/s);
  } finally { rmSync(dir, { recursive: true }); }
});

test('escapes structured content and disables embedded Markdown HTML', () => {
  const content = loadContent();
  content.publications[0].title = '<script>alert("title")</script>';
  content.about = '<script>alert("bio")</script>\n\n[Unsafe](javascript:alert(1))';
  const output = renderSite(content);
  assert.ok(output.get('publications.html').includes('&lt;script&gt;'));
  assert.ok(!output.get('index.html').includes('<script>alert'));
  assert.ok(!output.get('index.html').includes('href="javascript:'));
});

test('empty optional sections and publication list remain valid', () => {
  const content = loadContent();
  for (const key of ['publications', 'projects', 'education', 'experience', 'awards']) content[key] = [];
  content.site.featured_publications = [];
  validateContent(content);
  const output = renderSite(content);
  assert.ok(!output.get('index.html').includes('id="experience"'));
  assert.ok(output.get('publications.html').includes('0 publications'));
});

test('awards can omit the organization without rendering an empty line', () => {
  const content = loadContent();
  content.awards = [{ title: 'Example award', year: 2026 }];
  validateContent(content);
  const article = renderSite(content).get('index.html').match(/<article class="award-entry">([\s\S]*?)<\/article>/)[1];
  assert.ok(article.includes('Example award'));
  assert.ok(!article.includes('entry-organization'));
});

test('standalone and publication-linked projects render without duplicating publication data', () => {
  const content = loadContent();
  content.projects = [
    { id: 'linked', name: 'Example', topic: 'Example', description: 'Example', publication: content.publications[0].id },
    { id: 'standalone', name: 'Standalone', topic: 'Example', description: 'Example', links: [{ label: 'Code', url: 'https://example.com' }] },
  ];
  validateContent(content);
  const html = renderSite(content).get('index.html');
  assert.ok(html.includes('publications.html#aida-2026'));
  assert.ok(html.includes('id="project-standalone"'));
});

test('detects broken generated anchors and duplicate HTML IDs', () => {
  const output = renderSite();
  const broken = new Map(output);
  broken.set('index.html', broken.get('index.html').replace('href="#main"', 'href="#missing"'));
  assert.throws(() => validateOutput(broken), /missing anchor/);
  const duplicate = new Map(output);
  duplicate.set('index.html', duplicate.get('index.html').replace('</main>', '<div id="main"></div></main>'));
  assert.throws(() => validateOutput(duplicate), /duplicate HTML id/);
});

test('omitting the featured list hides the section without blocking builds', () => {
  const content = loadContent();
  delete content.site.featured_publications;
  validateContent(content);
  assert.ok(!renderSite(content).get('index.html').includes('id="selected-publications"'));
});

test('automatic dates use the build month without a separate state file', () => {
  const content = loadContent();
  content.site.updated = 'auto';
  content.site.publications_updated = 'auto';
  const original = renderSite(content, { month: '2026-09' });
  assert.deepEqual([...original.keys()], ['index.html', 'publications.html', 'sitemap.xml', 'robots.txt']);
  assert.ok(original.get('index.html').includes('<time datetime="2026-09">September 2026</time>'));
  const changed = renderSite(content, { month: '2026-10' });
  assert.ok(changed.get('publications.html').includes('<time datetime="2026-10">October 2026</time>'));
  // Read-only checks reuse the month in the published HTML across calendar changes.
  const checked = renderSite(content, { month: '2026-10', savedMonths: { 'index.html': '2026-09', 'publications.html': '2026-09' } });
  assert.deepEqual(checked, original);
});

test('manual months are supported and days or invalid months are rejected', () => {
  const content = loadContent();
  content.site.updated = '2026-08';
  content.site.publications_updated = '2026-09';
  validateContent(content);
  const output = renderSite(content);
  assert.ok(output.get('index.html').includes('August 2026'));
  assert.ok(output.get('publications.html').includes('September 2026'));
  for (const invalid of ['2026-09-15', '2026-13']) {
    content.site.updated = invalid;
    assert.throws(() => validateContent(content), /YYYY-MM/);
  }
});

test('paper resources open in new tabs and live reload stays out of production HTML', () => {
  const output = renderSite();
  const html = output.get('publications.html');
  for (const [, resources] of html.matchAll(/<div class="resource-links">(.*?)<\/div>/g)) {
    for (const [link] of resources.matchAll(/<a\b[^>]+>/g)) {
      assert.ok(link.includes('target="_blank"'));
      assert.ok(link.includes('rel="noopener noreferrer"'));
    }
  }
  assert.ok(!html.includes('Research archive'));
  for (const [file, page] of output) if (file.endsWith('.html')) assert.ok(!page.includes('/__reload'));
});
