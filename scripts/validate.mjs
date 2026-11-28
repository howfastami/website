import { stat, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pages = (await readdir(root)).filter((name) => extname(name) === '.html');
const locales = (await readdir(join(root, 'locales'))).filter((name) => name.endsWith('.json'))
  .map((name) => name.slice(0, -5));
const files = [...pages, ...locales.flatMap((locale) => pages
  .filter((page) => page !== '404.html').map((page) => join(locale, page)))];
const failures = [];
const site = 'https://howfastami.app/';
const sitemap = await readFile(join(root, 'sitemap.xml'), 'utf8');

for (const file of files) {
  const path = join(root, file);
  const html = await readFile(path, 'utf8');
  if (!/<title>[^<]+<\/title>/.test(html)) failures.push(`${file}: missing title`);
  const language = html.match(/<html\s+[^>]*\blang="([^"]+)"/)?.[1];
  const folder = dirname(file);
  const expected = folder === '.' ? 'en' : folder;
  if (language?.toLowerCase() !== expected) failures.push(`${file}: incorrect language`);
  if (file !== '404.html') {
    if (!/<meta\b[^>]*\bname="description"/.test(html)) failures.push(`${file}: missing description`);
    const url = site + file.replace(/(^|\/)index\.html$/, '$1');
    const canonical = html.match(/<link\b[^>]*\brel="canonical"[^>]*>/)?.[0];
    if (!canonical?.includes(`href="${url}"`)) failures.push(`${file}: incorrect canonical URL`);
    if (!sitemap.includes(`<loc>${url}</loc>`)) failures.push(`${file}: missing sitemap entry`);
    for (const alternate of ['en', ...locales, 'x-default']) {
      const alternateUrl = site + (alternate === 'x-default' || alternate === 'en' ? '' : alternate + '/') +
        (file.endsWith('index.html') ? '' : file.split('/').at(-1));
      if (!html.toLowerCase().includes(`hreflang="${alternate}" href="${alternateUrl.toLowerCase()}"`)) {
        failures.push(`${file}: missing alternate for ${alternate}`);
      }
    }
    if ((html.match(/<details class="language-picker\b/g) ?? []).length !== 2) {
      failures.push(`${file}: expected a header and footer language picker`);
    }
  }

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) failures.push(`${file}: duplicate IDs ${[...new Set(duplicates)].join(', ')}`);

  const localReferences = [...html.matchAll(/(?:href|src)="([^"#][^"]*)"/g)]
    .map((match) => match[1].split('#')[0].split('?')[0])
    .filter((value) => value && !/^(?:https?:|mailto:|tel:|data:)/.test(value));
  for (const reference of localReferences) {
    const target = resolve(dirname(path), reference);
    try {
      if ((await stat(target)).isDirectory()) await stat(join(target, 'index.html'));
    } catch {
      failures.push(`${file}: missing local target ${reference}`);
    }
  }
}

const cname = (await readFile(join(root, 'CNAME'), 'utf8')).trim();
if (cname !== 'howfastami.app') failures.push('CNAME must contain only howfastami.app');

const config = await readFile(join(root, 'config.js'), 'utf8');
if (!config.includes('com.benpotter.howfastami')) failures.push('Android package store URL is missing');
if (/APP_STORE_ID|REPLACE_ME|example\.com/i.test(config)) failures.push('config.js contains a deployment placeholder');

if (failures.length) {
  console.error(`Website validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`Validated ${files.length} HTML pages and their local assets.`);
