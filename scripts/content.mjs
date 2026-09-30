import { readFileSync, existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';

export const root = resolve(import.meta.dirname, '..');
export const generatedFiles = new Set(['index.html', 'publications.html', 'sitemap.xml', 'robots.txt']);
const slugPattern = /^[a-z][a-z0-9-]*$/;

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}
function object(value, label) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), `${label}: expected an object`);
}
function text(value, label) {
  requireValue(typeof value === 'string' && value.trim().length > 0, `${label}: expected non-empty text`);
}
function list(value, label) {
  requireValue(Array.isArray(value), `${label}: expected a YAML list (use [] for an empty section)`);
}
function uniqueIds(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    object(entry, label);
    text(entry.id, `${label}.id`);
    requireValue(slugPattern.test(entry.id), `${label}: invalid id "${entry.id}" (use lowercase letters, numbers and hyphens)`);
    requireValue(!seen.has(entry.id), `${label}: duplicate id "${entry.id}"`);
    seen.add(entry.id);
  }
}
function date(value, label, allowPresent = false) {
  if (allowPresent && value === 'Present') return;
  text(value, label);
  requireValue(/^\d{4}-(0[1-9]|1[0-2])$/.test(value), `${label}: use a quoted YYYY-MM date${allowPresent ? ' or Present' : ''}`);
}

function updateDate(value, label) {
  if (value === 'auto') return;
  date(value, label);
}

export function validateUrl(value, label, base = root) {
  text(value, label);
  requireValue(!/[\s\\\u0000-\u001f]/.test(value), `${label}: invalid URL`);
  if (/^https?:\/\//i.test(value)) {
    const parsed = new URL(value);
    requireValue(Boolean(parsed.hostname) && !parsed.username && !parsed.password, `${label}: invalid web URL`);
    return;
  }
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(value)) return;
  requireValue(!/^(?:\/|[a-z][a-z\d+.-]*:)/i.test(value), `${label}: unsupported URL protocol or absolute path`);
  const path = decodeURIComponent(value.split(/[?#]/)[0]);
  if (!path) return;
  const target = resolve(base, path);
  requireValue(target.startsWith(`${base}${sep}`), `${label}: path must stay inside the website`);
  requireValue(generatedFiles.has(path) || existsSync(target), `${label}: missing local resource "${path}"`);
}
function links(value, label, base) {
  list(value, label);
  value.forEach((link, index) => {
    object(link, label);
    text(link.label, `${label}[${index}].label`);
    validateUrl(link.url, `${label}[${index}].url`, base);
  });
}

export function readYaml(path) {
  const document = parseDocument(readFileSync(path, 'utf8'), { uniqueKeys: true });
  if (document.errors.length) throw new Error(`${path}: ${document.errors.map(error => error.message).join('\n')}`);
  return document.toJS({ maxAliasCount: 50 });
}

export function validateContent(data, base = root) {
  const { site, publications, projects, education, experience, awards, about } = data;
  object(site, 'site.yml');
  for (const key of ['name', 'name_cn', 'role', 'description', 'email']) text(site[key], `site.${key}`);
  validateUrl(`mailto:${site.email}`, 'site.email', base);
  validateUrl(site.url, 'site.url', base);
  requireValue(/^https:\/\//.test(site.url) && new URL(site.url).pathname === '/', 'site.url: use the HTTPS website origin without a path');
  requireValue(!site.url.endsWith('/'), 'site.url: omit the trailing slash');
  for (const key of ['portrait', 'favicon']) {
    requireValue(typeof site[key] === 'string' && site[key].startsWith('assets/'), `site.${key}: use a local assets/ path`);
    validateUrl(site[key], `site.${key}`, base);
  }
  object(site.affiliation, 'site.affiliation');
  text(site.affiliation.name, 'site.affiliation.name');
  validateUrl(site.affiliation.url, 'site.affiliation.url', base);
  updateDate(site.updated, 'site.updated');
  updateDate(site.publications_updated, 'site.publications_updated');
  requireValue(Number.isInteger(site.copyright_year), 'site.copyright_year: expected a year');
  list(site.interests, 'site.interests');
  site.interests.forEach(interest => text(interest, 'site.interests'));
  links(site.links, 'site.links', base);
  requireValue(site.links.some(link => link.label === 'Google Scholar'), 'site.links: add a Google Scholar link');
  object(site.badges, 'site.badges');
  for (const [key, label] of Object.entries(site.badges)) {
    requireValue(slugPattern.test(key), `site.badges: invalid key "${key}"`);
    text(label, `site.badges.${key}`);
  }
  text(about, 'about.md');
  for (const [name, entries] of Object.entries({ publications, projects, education, experience, awards })) list(entries, `${name}.yml`);
  uniqueIds(publications, 'publications');
  for (const paper of publications) {
    for (const key of ['title', 'venue', 'venue_short']) text(paper[key], `${paper.id}.${key}`);
    requireValue(Number.isInteger(paper.year) && paper.year >= 1900 && paper.year <= 2200, `${paper.id}.year: expected a year`);
    requireValue(['conference', 'journal'].includes(paper.type), `${paper.id}.type: use conference or journal`);
    list(paper.authors, `${paper.id}.authors`);
    requireValue(paper.authors.length > 0, `${paper.id}: authors cannot be empty`);
    paper.authors.forEach(author => {
      object(author, `${paper.id}.authors`);
      text(author.name, `${paper.id}.authors.name`);
      requireValue(author.equal === undefined || typeof author.equal === 'boolean', `${paper.id}.authors.equal: use true or false`);
    });
    list(paper.badges, `${paper.id}.badges`);
    paper.badges.forEach(badge => requireValue(Object.hasOwn(site.badges, badge), `${paper.id}: unknown badge "${badge}"`));
    links(paper.links, `${paper.id}.links`, base);
    if (paper.url !== undefined) validateUrl(paper.url, `${paper.id}.url`, base);
    if (paper.bibtex !== undefined) text(paper.bibtex, `${paper.id}.bibtex`);
  }
  const paperIds = new Set(publications.map(paper => paper.id));
  const featured = site.featured_publications ?? [];
  list(featured, 'site.featured_publications');
  requireValue(new Set(featured).size === featured.length, 'site.featured_publications: duplicate publication reference');
  featured.forEach(id => requireValue(paperIds.has(id), `site.featured_publications: unknown publication "${id}"`));
  uniqueIds(projects, 'projects');
  for (const project of projects) {
    for (const key of ['name', 'description', 'topic']) text(project[key], `${project.id}.${key}`);
    if (project.publication !== undefined) requireValue(paperIds.has(project.publication), `${project.id}: unknown publication "${project.publication}"`);
    if (project.links !== undefined) links(project.links, `${project.id}.links`, base);
  }
  for (const [name, entries, fields] of [
    ['education', education, ['degree', 'institution']],
    ['experience', experience, ['role', 'organization', 'description']],
  ]) {
    entries.forEach((entry, index) => {
      object(entry, name);
      fields.forEach(field => text(entry[field], `${name}[${index}].${field}`));
      date(entry.start, `${name}[${index}].start`);
      date(entry.end, `${name}[${index}].end`, true);
      requireValue(entry.end === 'Present' || entry.end >= entry.start, `${name}[${index}]: end must not precede start`);
      for (const field of ['note', 'advisor']) if (entry[field] !== undefined) text(entry[field], `${name}[${index}].${field}`);
    });
  }
  awards.forEach((award, index) => {
    object(award, 'awards');
    text(award.title, `awards[${index}].title`);
    if (award.organization !== undefined) text(award.organization, `awards[${index}].organization`);
    requireValue(Number.isInteger(award.year), `awards[${index}].year: expected a year`);
    if (award.title_cn !== undefined) text(award.title_cn, `awards[${index}].title_cn`);
  });
  return data;
}

export function loadContent(base = root) {
  const data = Object.fromEntries(['site', 'publications', 'projects', 'education', 'experience', 'awards'].map(name => [name, readYaml(resolve(base, 'content', `${name}.yml`))]));
  data.about = readFileSync(resolve(base, 'content/about.md'), 'utf8');
  return validateContent(data, base);
}
