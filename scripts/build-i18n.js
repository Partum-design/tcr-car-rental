const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const ROOT = process.cwd();
const SOURCE_PAGES = [
  'index.html',
  'servicios/index.html',
  'contacto/index.html',
  'reservacion-prueba/index.html',
  'gracias-reservacion/index.html',
];

const CACHE_DIR = path.join(ROOT, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'translate-es-en.json');
let cache = {};
if (fs.existsSync(CACHE_FILE)) {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
}

function saveCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTranslatableText(text) {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;
  if (t.length < 2) return false;
  if (/^[-–—\d\s.,/:+()%$]+$/.test(t)) return false;
  if (/^(https?:|mailto:|tel:|wa\.me)/i.test(t)) return false;
  return /[A-Za-zÁÉÍÓÚáéíóúÑñ¿¡]/.test(t);
}

async function fetchMyMemory(text) {
  const q = encodeURIComponent(text);
  const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=es|en`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'tcr-i18n-builder/1.0'
    }
  });

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  const data = await res.json();
  const translated = data && data.responseData && data.responseData.translatedText;
  if (!translated || typeof translated !== 'string') {
    return text;
  }
  return translated.trim() || text;
}

async function trEsEn(text) {
  if (!isTranslatableText(text)) return text;
  if (cache[text]) return cache[text];

  let lastErr = null;
  const delays = [300, 700, 1500, 2600];
  for (let i = 0; i < delays.length; i += 1) {
    try {
      const translated = await fetchMyMemory(text);
      cache[text] = translated;
      await sleep(180);
      return translated;
    } catch (err) {
      lastErr = err;
      await sleep(delays[i]);
    }
  }

  console.warn('translation fallback for text:', text.slice(0, 90), lastErr ? String(lastErr.message || lastErr) : 'unknown error');
  cache[text] = text;
  return text;
}

function removeLegacyTranslatorBlocks(html) {
  let out = html;

  out = out.replace(/<style[^>]*id=["']tcr-lang-switcher-style["'][^>]*>[\s\S]*?<\/style>\s*/gi, '');
  out = out.replace(/<script[^>]*id=["']tcr-lang-switcher-script["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
  out = out.replace(/<div[^>]*id=["']tcr-lang-switcher["'][^>]*>[\s\S]*?<\/div>\s*/gi, '');

  out = out.replace(/<div[^>]*id=["']google_translate_element["'][^>]*><\/div>\s*/gi, '');
  out = out.replace(/<style>\s*#tcr-lang-switcher[\s\S]*?goog-te-banner-frame\.skiptranslate[\s\S]*?<\/style>\s*/gi, '');
  out = out.replace(/<script>\s*\(function\(\)\{\s*const STORAGE_KEY\s*=\s*['"]tcr_lang['"][\s\S]*?<\/script>\s*/gi, '');

  return out;
}

function injectLangAssets(html) {
  let out = html;

  if (!out.includes('/assets/i18n/lang-switcher.css')) {
    out = out.replace('</head>', '<link rel="stylesheet" href="/assets/i18n/lang-switcher.css">\n</head>');
  }

  const switcherHtml = [
    '<div id="tcr-lang-switcher" aria-label="Language switcher">',
    '  <button class="tcr-lang-btn" data-lang="es" type="button">ES</button>',
    '  <button class="tcr-lang-btn" data-lang="en" type="button">EN</button>',
    '</div>'
  ].join('\n');

  if (!out.includes('id="tcr-lang-switcher"')) {
    out = out.replace('</body>', `${switcherHtml}\n</body>`);
  }

  if (!out.includes('/assets/i18n/lang-switcher.js')) {
    out = out.replace('</body>', '<script src="/assets/i18n/lang-switcher.js" defer></script>\n</body>');
  }

  return out;
}

function remapInternalLinks($) {
  const pages = ['/', '/servicios/', '/contacto/', '/reservacion-prueba/', '/gracias-reservacion/'];

  $('[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || !pages.includes(href)) return;
    $(el).attr('href', href === '/' ? '/en/' : `/en${href}`);
  });

  $('form[action="/submit-reservation.php"]').attr('action', '/submit-reservation.php?lang=en');
}

async function translateDomToEnglish(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('html').attr('lang', 'en');

  const attrNames = ['placeholder', 'title', 'aria-label'];
  const attrNodes = [];
  for (const attr of attrNames) {
    $(`[${attr}]`).each((_, el) => {
      const v = $(el).attr(attr);
      if (isTranslatableText(v)) {
        attrNodes.push({ el, attr, value: v });
      }
    });
  }

  const textNodes = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'tag') {
      const name = (node.name || '').toLowerCase();
      if (['script', 'style', 'noscript', 'code', 'pre', 'svg', 'path'].includes(name)) return;
      if (Array.isArray(node.children)) {
        node.children.forEach(walk);
      }
      return;
    }
    if (node.type === 'text' && isTranslatableText(node.data || '')) {
      textNodes.push(node);
    }
  };

  $.root().contents().each((_, n) => walk(n));

  const uniqueValues = new Set();
  textNodes.forEach((n) => uniqueValues.add(n.data));
  attrNodes.forEach((a) => uniqueValues.add(a.value));

  const dict = new Map();
  let i = 0;
  for (const sourceText of uniqueValues) {
    const translated = await trEsEn(sourceText);
    dict.set(sourceText, translated);
    i += 1;
    if (i % 20 === 0) {
      saveCache();
      console.log(`translated ${i}/${uniqueValues.size} unique strings...`);
    }
  }

  textNodes.forEach((n) => {
    n.data = dict.get(n.data) || n.data;
  });

  attrNodes.forEach((a) => {
    $(a.el).attr(a.attr, dict.get(a.value) || a.value);
  });

  remapInternalLinks($);
  return $.html();
}

async function main() {
  for (const rel of SOURCE_PAGES) {
    const sourcePath = path.join(ROOT, rel);
    const raw = fs.readFileSync(sourcePath, 'utf8');

    const esPrepared = injectLangAssets(removeLegacyTranslatorBlocks(raw));
    fs.writeFileSync(sourcePath, esPrepared, 'utf8');

    const enTranslated = await translateDomToEnglish(esPrepared);
    const enPrepared = injectLangAssets(removeLegacyTranslatorBlocks(enTranslated));

    const enPath = path.join(ROOT, 'en', rel);
    fs.mkdirSync(path.dirname(enPath), { recursive: true });
    fs.writeFileSync(enPath, enPrepared, 'utf8');

    saveCache();
    console.log(`generated ${rel} -> ${path.relative(ROOT, enPath)}`);
  }

  saveCache();
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
