"""Render static translations from English pages and versioned dictionaries."""

import argparse
import json
import re
from copy import copy
from html import escape
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

ROOT = Path(__file__).resolve().parents[1]
SITE = 'https://howfastami.app'
PAGES = ('index.html', 'support.html', 'privacy.html', 'terms.html', 'account-deletion.html')
LOCALES = {
    'en': ('English', 'English', 'en'),
    'es': ('Español', 'Spanish', 'es'),
    'fr': ('Français', 'French', 'fr'),
    'de': ('Deutsch', 'German', 'de'),
    'pt-br': ('Português (Brasil)', 'Brazilian Portuguese', 'pt-BR'),
    'zh-hans': ('简体中文', 'Simplified Mandarin Chinese', 'zh-Hans'),
    'zh-hant': ('繁體中文', 'Traditional Chinese, Hong Kong usage', 'zh-Hant'),
    'ja': ('日本語', 'Japanese', 'ja'),
    'ko': ('한국어', 'Korean', 'ko'),
    'it': ('Italiano', 'Italian', 'it'),
    'ar': ('العربية', 'Modern Standard Arabic', 'ar'),
    'hi': ('हिन्दी', 'Hindi', 'hi'),
    'ru': ('Русский', 'Russian', 'ru'),
    'id': ('Bahasa Indonesia', 'Indonesian', 'id'),
    'bn': ('বাংলা', 'Bengali', 'bn'),
    'tr': ('Türkçe', 'Turkish', 'tr'),
}
UI = (
    'Choose language',
    'Read this page in:',
    'This is a machine translation.',
    'Read the English original',
    'Dismiss language suggestion',
)
INLINE = {'a', 'b', 'br', 'em', 'small', 'span', 'strong'}
BLOCK = {'a', 'button', 'figcaption', 'h1', 'h2', 'h3', 'li', 'p', 'small',
         'span', 'strong', 'summary', 'title'}
TOKEN = re.compile(r'\{/?[0-9]+\}')
CACHE_VERSION = 'locale-2'
GENERATED = re.compile(r'<!-- i18n:([\w-]+) -->.*?<!-- /i18n:\1 -->', re.S)


def read_page(page):
    source = (ROOT / page).read_text()
    return GENERATED.sub(lambda m: f'<!-- i18n:{m[1]} -->', source)


def public_path(page, locale):
    prefix = '/' if locale == 'en' else f'/{locale}/'
    return prefix if page == 'index.html' else prefix + page


def relative_path(page, current, target):
    file = './' if page == 'index.html' else './' + page
    if current == target:
        return file
    prefix = './' if current == 'en' else '../'
    return prefix + ('' if target == 'en' else target + '/') + ('' if page == 'index.html' else page)


def nodes(soup):
    for el in soup.find_all(True):
        if el.name == 'meta' and (el.get('name') == 'description' or
                                   el.get('property') in ('og:title', 'og:description')):
            yield el, 'content'
        for attr in ('alt', 'aria-label', 'data-store-unavailable'):
            if el.get(attr):
                yield el, attr
        if el.name not in BLOCK or el.find_parent(class_='brand') or 'brand' in el.get('class', []):
            continue
        if any(child.name not in INLINE or child.has_attr('data-store-label') or child.name == 'svg'
               for child in el.find_all(True)):
            continue
        if any(parent.name in BLOCK and not parent.find(
                lambda tag: tag.name not in INLINE or tag.has_attr('data-store-label'))
               for parent in el.parents if isinstance(parent, Tag)):
            continue
        if re.search(r'[^\W\d_]', el.get_text()) and not el.get_text(strip=True).startswith('support@'):
            yield el, None


def message(el, attr):
    if attr:
        return el[attr], {}
    markup = {}

    def transform(node):
        if not isinstance(node, Tag):
            return str(node) if isinstance(node, NavigableString) else ''
        index = len(markup) + 1
        empty = node.name == 'br'
        markup[f'{{{index}}}'] = (node, empty)
        body = ''.join(transform(child) for child in node.children)
        return f'{{{index}}}' if empty else f'{{{index}}}{body}{{/{index}}}'

    return re.sub(r'\s+', ' ', ''.join(transform(child) for child in el.children)).strip(), markup


def valid(source, target):
    if not target.strip() or sorted(TOKEN.findall(source)) != sorted(TOKEN.findall(target)):
        return False
    active = []
    empty = {match[0] for match in re.findall(r'(\{(\d+)\})', source)
             if '{/' + match[1] + '}' not in source}
    for token in TOKEN.findall(target):
        if token in empty:
            continue
        if token.startswith('{/'):
            if not active or token[2:] != active.pop():
                return False
        else:
            active.append(token[1:])
    return not active


def replace(el, attr, target, markup):
    if attr:
        el[attr] = target
        return
    el.clear()
    parents = [el]
    for part in re.split(r'(\{/?[0-9]+\})', target):
        if part.startswith('{/') and TOKEN.fullmatch(part):
            if len(parents) == 1:
                raise ValueError(f'Misnested markup: {target}')
            parents.pop()
        elif part in markup:
            template, empty = markup[part]
            child = copy(template)
            child.clear()
            parents[-1].append(child)
            if not empty:
                parents.append(child)
        elif part:
            parents[-1].append(NavigableString(part))
    if len(parents) != 1:
        raise ValueError(f'Unclosed markup: {target}')


def collect():
    keys = dict.fromkeys(UI)
    for page in PAGES:
        soup = BeautifulSoup(read_page(page), 'html.parser')
        for el, attr in nodes(soup):
            if attr is None and el.get('data-store-label') is not None:
                continue
            key, _ = message(el, attr)
            if key.strip() and key not in ('How Fast Am I.', 'How Fast Am I?', 'App Store', 'Google Play'):
                keys[key] = None
    return list(keys)


def menu(page, current, strings, footer=False):
    name, _, lang = LOCALES[current]
    label = escape(strings.get(UI[0], UI[0]), quote=True)
    selected = escape(name)
    options = []
    for slug, (native, _, code) in LOCALES.items():
        active = ' aria-current="page"' if slug == current else ''
        direction = 'rtl' if slug == 'ar' else 'auto'
        options.append(f'<li><a href="{relative_path(page, current, slug)}" hreflang="{code}" '
                       f'lang="{code}" dir="{direction}" data-locale="{slug}"{active}>{escape(native)}</a></li>')
    modifier = ' language-picker-footer' if footer else ''
    value = selected if footer else ('中文' if current.startswith('zh-') else lang.upper())
    return (
        f'<details class="language-picker{modifier}"><summary aria-label="{label}: {selected}">'
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
        '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/>'
        '<path d="M3 12h18"/></svg>'
        f'<span aria-hidden="true">{value}</span></summary>'
        f'<ul aria-label="{label}">{"".join(options)}</ul></details>'
    )


def generated(source, name, value):
    mark = f'<!-- i18n:{name} -->'
    if mark not in source:
        raise ValueError(f'Missing {name} marker')
    return source.replace(mark, f'{mark}{value}<!-- /i18n:{name} -->')


def render(page, current, dictionary):
    source = read_page(page)
    canonical = SITE + public_path(page, current)
    source = re.sub(r'\./(styles\.css|app\.js|language\.js)(?:\?v=[^"]+)?',
                    lambda m: './' + m[1] + '?v=' + CACHE_VERSION, source)
    soup = BeautifulSoup(source, 'html.parser')
    if current != 'en':
        soup.html['lang'] = LOCALES[current][2]
        if current == 'ar':
            soup.html['dir'] = 'rtl'
        for el, attr in sorted(nodes(soup), key=lambda pair: pair[1] is None):
            if not el.parent or (attr is None and el.has_attr('data-store-label')):
                continue
            key, markup = message(el, attr)
            if key in dictionary:
                replace(el, attr, dictionary[key], markup)
        for el in soup.find_all(True):
            for attr in ('href', 'src'):
                value = el.get(attr, '')
                if value.startswith(('./assets/', './styles.css', './config.js', './app.js', './language.js')):
                    el[attr] = '../' + value[2:]
    soup.find('link', rel='canonical')['href'] = canonical
    social_url = soup.find('meta', property='og:url')
    if social_url:
        social_url['content'] = canonical
    # Keep the hand-edited English layout and indentation in its source files.
    source = str(soup) if current != 'en' else source
    alternatives = [(code, SITE + public_path(page, slug)) for slug, (_, _, code) in LOCALES.items()]
    alternatives.append(('x-default', SITE + public_path(page, 'en')))
    source = generated(source, 'alternates', '\n'.join(
        f'<link rel="alternate" hreflang="{code}" href="{url}">' for code, url in alternatives))
    header = menu(page, current, dictionary)
    if current == 'en':
        header += (f'<div class="language-suggestion" data-language-suggestion hidden>'
                   f'<span>{UI[1]}</span> <span data-suggestion-link></span>'
                   f'<button type="button" aria-label="{UI[4]}">×</button></div>')
    source = generated(source, 'header', header)
    source = generated(source, 'footer', menu(page, current, dictionary, footer=True))
    if page in ('privacy.html', 'terms.html', 'account-deletion.html') and current != 'en':
        note = f'<p class="translation-notice">{escape(dictionary[UI[2]])} '
        note += f'<a href="{relative_path(page, current, "en")}">{escape(dictionary[UI[3]])}</a></p>'
        source = generated(source, 'notice', note)
    return source


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', action='store_true', help='print English messages as JSON')
    parser.add_argument('--check', action='store_true', help='check generated files without writing')
    args = parser.parse_args()
    keys = collect()
    if args.extract:
        print(json.dumps(keys, ensure_ascii=False, indent=2))
        return
    for current in LOCALES:
        dictionary = {} if current == 'en' else json.loads((ROOT / 'locales' / f'{current}.json').read_text())
        if current != 'en':
            missing = [key for key in keys if key not in dictionary or not valid(key, dictionary[key])]
            if missing:
                raise ValueError(f'{current}: {len(missing)} missing or invalid messages: {missing[:3]}')
        for page in PAGES:
            path = ROOT / ('' if current == 'en' else current) / page
            update(path, render(page, current, dictionary), args.check)
    entries = [SITE + public_path(page, slug) for slug in LOCALES for page in PAGES]
    sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    sitemap += ''.join(f'  <url><loc>{url}</loc></url>\n' for url in entries) + '</urlset>\n'
    update(ROOT / 'sitemap.xml', sitemap, args.check)


def update(path, content, check):
    content = content.rstrip() + '\n'
    if path.exists() and path.read_text() == content:
        return
    if check:
        raise ValueError(f'Generated file is out of date: {path.relative_to(ROOT)}')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


if __name__ == '__main__':
    main()
