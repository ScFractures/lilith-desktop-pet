'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MAX_EXTRACT_BYTES = 64 * 1024 * 1024;
const MAX_XML_BYTES = 32 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  '.txt', '.text', '.md', '.markdown', '.mdx', '.rst', '.log', '.csv', '.tsv',
  '.json', '.jsonl', '.ndjson', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.xml', '.html', '.htm', '.xhtml', '.css', '.scss', '.sass', '.less', '.svg',
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro',
  '.py', '.rb', '.php', '.java', '.kt', '.kts', '.scala', '.groovy', '.go', '.rs', '.swift',
  '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.cs', '.m', '.mm', '.lua', '.pl', '.r',
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1', '.sql', '.graphql', '.gql',
  '.dockerfile', '.gitignore', '.gitattributes', '.editorconfig', '.npmrc', '.properties',
]);

const ZIP_KINDS = new Set(['docx', 'pptx', 'xlsx']);

function extensionOf(name) {
  const lower = String(name || '').toLowerCase();
  const ext = path.extname(lower);
  if (ext) return ext;
  if (lower === 'dockerfile' || lower === 'makefile' || lower === 'readme') return `.${lower}`;
  return '';
}

function kindByExtension(name) {
  const ext = extensionOf(name);
  if (ext === '.pdf') return 'pdf';
  if (ext === '.docx') return 'docx';
  if (ext === '.pptx') return 'pptx';
  if (ext === '.xlsx') return 'xlsx';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.avif'].includes(ext)) return 'image';
  return 'binary';
}

function decodeXml(value) {
  return String(value)
    .replace(/&#x([0-9a-f]+);/gi, (_m, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_m, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function detectKind(filePath, head) {
  const ext = extensionOf(filePath);
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) {
    const byExt = kindByExtension(filePath);
    return ZIP_KINDS.has(byExt) ? byExt : (ext === '.zip' ? 'zip' : 'binary');
  }
  if (head.length >= 8 && head[0] === 0x89 && head.subarray(1, 4).toString('latin1') === 'PNG') return 'image';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image';
  if (head.length >= 6 && head.subarray(0, 3).toString('latin1') === 'GIF') return 'image';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF'
    && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'image';
  const byExt = kindByExtension(filePath);
  if (byExt === 'text') return 'text';
  if (!head.includes(0)) {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(head);
      return 'text';
    } catch {}
  }
  return byExt === 'binary' ? 'binary' : byExt;
}

function readPrefix(filePath, bytes) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function decodeText(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(buffer.subarray(3));
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }
  return new TextDecoder('utf-8').decode(buffer);
}

// Minimal ZIP reader (stored + deflated entries), enough for OOXML documents.
function zipEntries(buffer) {
  if (buffer.length < 22) return null;
  let eocd = -1;
  const floor = Math.max(0, buffer.length - 0xffff - 22);
  for (let i = buffer.length - 22; i >= floor; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  if (!entry) return null;
  const offset = entry.localOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) return null;
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const start = offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  try {
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES });
  } catch {
    return null;
  }
  return null;
}

function zipText(buffer, entries, name) {
  const data = readZipEntry(buffer, entries.get(name));
  return data ? data.toString('utf8') : '';
}

function sortedEntries(entries, pattern) {
  return [...entries.keys()]
    .map((name) => {
      const match = pattern.exec(name);
      return match ? { name, index: Number(match[1]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.name);
}

function docxToText(xml) {
  const blocks = [];
  for (const paragraph of xml.split(/<\/w:p>/)) {
    let line = '';
    const tokens = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\s*\/?>/g;
    let match;
    while ((match = tokens.exec(paragraph))) {
      if (match[1] !== undefined) line += decodeXml(match[1]);
      else if (match[0] === '<w:tab/>') line += '\t';
      else line += '\n';
    }
    if (line.trim()) blocks.push(line);
  }
  return blocks.join('\n');
}

function pptxToText(xml) {
  const blocks = [];
  for (const paragraph of xml.split(/<\/a:p>/)) {
    let line = '';
    const tokens = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
    let match;
    while ((match = tokens.exec(paragraph))) line += decodeXml(match[1]);
    if (line.trim()) blocks.push(line);
  }
  return blocks.join('\n');
}

function columnIndex(letters) {
  let value = 0;
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, value - 1);
}

function xlsxToText(buffer, entries) {
  const shared = [];
  const sharedXml = zipText(buffer, entries, 'xl/sharedStrings.xml');
  const sharedRe = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g;
  let sharedMatch;
  while ((sharedMatch = sharedRe.exec(sharedXml))) {
    let text = '';
    const textRe = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let textMatch;
    while ((textMatch = textRe.exec(sharedMatch[1]))) text += decodeXml(textMatch[1]);
    shared.push(text);
  }

  const blocks = [];
  for (const sheetName of sortedEntries(entries, /^xl\/worksheets\/sheet(\d+)\.xml$/)) {
    const xml = zipText(buffer, entries, sheetName);
    const rows = [];
    const rowRe = /<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g;
    let rowMatch;
    while ((rowMatch = rowRe.exec(xml))) {
      const cells = [];
      const cellRe = /<c(?:\s[^>]*)?>([\s\S]*?)<\/c>/g;
      let cellMatch;
      while ((cellMatch = cellRe.exec(rowMatch[1]))) {
        const attrs = cellMatch[0].slice(0, cellMatch[0].indexOf('>'));
        const ref = /r="([A-Z]+)\d+"/.exec(attrs);
        const type = /t="([^"]+)"/.exec(attrs);
        const value = /<v>([\s\S]*?)<\/v>/.exec(cellMatch[1]);
        const inline = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cellMatch[1]);
        let text = value ? decodeXml(value[1]) : (inline ? decodeXml(inline[1]) : '');
        if (type && type[1] === 's' && value) text = shared[Number(text)] || '';
        if (ref) cells[columnIndex(ref[1])] = text;
      }
      if (cells.some((cell) => cell)) rows.push(cells.join('\t'));
    }
    if (rows.length) blocks.push(rows.join('\n'));
  }
  return blocks.join('\n\n');
}

async function pdfToText(buffer, maxChars) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.js');
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  const pages = [];
  let chars = 0;
  try {
    for (let index = 1; index <= document.numPages && chars < maxChars; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      let line = '';
      let previous = null;
      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        if (previous && !/\s$/.test(previous.text) && item.str && !/^\s/.test(item.str)) {
          const x = Array.isArray(item.transform) ? item.transform[4] : null;
          const gap = x !== null && Number.isFinite(item.width) ? x - (previous.x + previous.width) : 0;
          if (gap > 1) line += ' ';
        }
        line += item.str;
        if (item.hasEOL) line += '\n';
        previous = {
          text: item.str,
          x: Array.isArray(item.transform) ? item.transform[4] : 0,
          width: Number.isFinite(item.width) ? item.width : 0,
        };
      }
      pages.push(line.trim());
      chars += line.length;
      page.cleanup();
    }
    return { text: pages.filter(Boolean).join('\n\n'), pages: document.numPages };
  } finally {
    await document.destroy();
  }
}

function tooLargeNote(bytes) {
  return `The file is ${(bytes / (1024 * 1024)).toFixed(1)} MB and was not read locally; open it from the path above.`;
}

function truncatedNote(chars) {
  return `Text preview truncated to ${chars.toLocaleString('en-US')} characters; open the file from the path above for the rest.`;
}

async function extractAttachment(filePath, { maxChars = 300000 } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
    throw new Error('unreadable-file');
  }
  if (!stat.isFile()) throw new Error('not-a-file');
  const name = path.basename(filePath);
  const result = {
    name,
    path: filePath,
    size: stat.size,
    kind: kindByExtension(name),
    content: '',
    chars: 0,
    truncated: false,
    note: '',
  };
  if (stat.size === 0) {
    result.note = 'The file is empty.';
    return result;
  }
  const head = readPrefix(filePath, 8192);
  result.kind = detectKind(filePath, head);
  if (stat.size > MAX_EXTRACT_BYTES && result.kind !== 'text') {
    result.note = tooLargeNote(stat.size);
    return result;
  }

  let text = '';
  let textLimited = false;
  try {
    if (result.kind === 'text') {
      const readBytes = Math.min(stat.size, Math.max(8192, maxChars * 4 + 8));
      textLimited = stat.size > readBytes;
      text = decodeText(readPrefix(filePath, readBytes));
    } else if (result.kind === 'pdf') {
      const buffer = fs.readFileSync(filePath);
      const extracted = await pdfToText(buffer, maxChars);
      text = extracted.text;
      result.pages = extracted.pages;
    } else if (ZIP_KINDS.has(result.kind)) {
      const buffer = fs.readFileSync(filePath);
      const entries = zipEntries(buffer);
      if (!entries) throw new Error('invalid-archive');
      if (result.kind === 'docx') text = docxToText(zipText(buffer, entries, 'word/document.xml'));
      else if (result.kind === 'pptx') {
        const slides = sortedEntries(entries, /^ppt\/slides\/slide(\d+)\.xml$/);
        text = slides.map((name) => pptxToText(zipText(buffer, entries, name))).filter(Boolean).join('\n\n');
      } else if (result.kind === 'xlsx') text = xlsxToText(buffer, entries);
    } else if (result.kind === 'image') {
      result.note = 'Image attachment; no text preview is available.';
    } else {
      result.note = 'Binary attachment; no text preview is available.';
    }
  } catch (error) {
    result.note = `Could not extract text (${error.message || error}).`;
    text = '';
  }

  if (text) {
    if (text.length > maxChars) {
      text = text.slice(0, maxChars);
      textLimited = true;
    }
    if (textLimited) {
      result.truncated = true;
      result.note = truncatedNote(maxChars);
    }
    result.content = text;
    result.chars = text.length;
  } else if (!result.note) {
    if (result.kind === 'pdf') {
      result.note = 'No selectable text was found; the PDF may be scanned or image-only.';
    } else if (ZIP_KINDS.has(result.kind)) {
      result.note = 'No text was found in this document.';
    }
  }
  return result;
}

module.exports = {
  extractAttachment,
  detectKind,
  kindByExtension,
  docxToText,
  pptxToText,
  xlsxToText,
  zipEntries,
  MAX_EXTRACT_BYTES,
};
