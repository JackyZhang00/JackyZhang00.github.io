'use strict';

/**
 * 通用工具函数（无第三方依赖）
 */

const fs = require('fs');
const path = require('path');

function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 深合并：以 base 为默认值，用 extra 覆盖；数组直接替换。 */
function deepMerge(base, extra) {
    if (!isPlainObject(extra)) return base;
    const out = isPlainObject(base) ? Object.assign({}, base) : {};
    for (const key of Object.keys(extra)) {
        const value = extra[key];
        if (isPlainObject(value) && isPlainObject(out[key])) {
            out[key] = deepMerge(out[key], value);
        } else if (value !== undefined) {
            out[key] = value;
        }
    }
    return out;
}

function readJson(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    } catch (err) {
        return fallback;
    }
}

function writeJson(file, data) {
    writeFileAtomic(file, JSON.stringify(data, null, 2) + '\n');
}

/** 原子写入：先写临时文件再重命名，避免半截文件。 */
function writeFileAtomic(file, content) {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
    fs.writeFileSync(tmp, content, 'utf8');
    try {
        fs.renameSync(tmp, file);
    } catch (err) {
        try { fs.unlinkSync(tmp); } catch (_) { /* ignore */ }
        throw err;
    }
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
}

function stripTags(html) {
    return String(html == null ? '' : html).replace(/<[^>]*>/g, '');
}

/** 粗略地把 HTML 片段转成纯文本（用于摘要、字数统计）。 */
function htmlToText(html) {
    return stripTags(
        String(html == null ? '' : html)
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/(p|div|li|h[1-6]|tr|blockquote|pre)>/gi, '\n')
    )
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

/** 去掉所有非空行共同的前导缩进（不影响相对缩进）。 */
function dedent(text) {
    const lines = String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n');
    let minIndent = Infinity;
    for (const line of lines) {
        if (!line.trim()) continue;
        const indent = /^[ \t]*/.exec(line)[0].length;
        if (indent < minIndent) minIndent = indent;
    }
    if (!isFinite(minIndent) || minIndent === 0) return lines.join('\n');
    return lines.map(function (line) {
        const indent = /^[ \t]*/.exec(line)[0].length;
        return line.slice(Math.min(minIndent, indent));
    }).join('\n');
}

/** 判断文本使用的主换行符。 */
function eolOf(text) {
    return /\r\n/.test(String(text)) ? '\r\n' : '\n';
}

/** 分类字段支持多分类：音乐 / BanG Dream!、桌游、科普 */
function splitCategories(value) {
    return String(value == null ? '' : value)
        .split(/[\/、,，]/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean)
        .filter(function (item, index, list) { return list.indexOf(item) === index; });
}

function toYmd(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function todayISO() {
    return toYmd(new Date());
}

/**
 * 把各种写法的日期规范成 YYYY-MM-DD。
 * 支持 2025-1-8 / 2025/01/08 / 20250108 / Date 对象；无法识别返回 null。
 */
function normalizeDate(input) {
    if (input instanceof Date) return isNaN(input.getTime()) ? null : toYmd(input);
    if (input == null) return null;
    const raw = String(input).trim();
    if (!raw) return null;

    let match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(raw);
    if (!match) match = /^(\d{4})(\d{2})(\d{2})$/.exec(raw);
    if (!match) {
        const parsed = new Date(raw);
        return isNaN(parsed.getTime()) ? null : toYmd(parsed);
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** 生成摘要：去掉标签后截断，尽量在标点处收尾。 */
function excerpt(value, maxLength = 120) {
    const text = htmlToText(value).replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    const slice = text.slice(0, maxLength);
    const cut = Math.max(
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
        slice.lastIndexOf('，'),
        slice.lastIndexOf('. ')
    );
    return (cut > maxLength * 0.6 ? slice.slice(0, cut + 1) : slice) + '…';
}

/** 统计中文字符 + 英文单词数量。 */
function countWords(text) {
    const plain = htmlToText(text);
    const cjk = (plain.match(/[\u4e00-\u9fa5]/g) || []).length;
    const words = (plain.replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9_'-]+/g) || []).length;
    return cjk + words;
}

/** 文件名安全化：只保留一层文件名，且必须以 .html 结尾。 */
function safeHtmlFilename(input) {
    if (!input) return null;
    let name = String(input).trim().replace(/\\/g, '/');
    name = name.split('/').pop() || '';
    name = name.replace(/[\u0000-\u001f<>:"|?*]/g, '-').trim();
    if (!name) return null;
    if (!/\.html?$/i.test(name)) name += '.html';
    name = name.replace(/\.htm$/i, '.html');
    if (!/^[^\\/:*?"<>|]+\.html$/i.test(name)) return null;
    if (name === '.html') return null;
    return name;
}

function ensureInside(parentDir, targetPath) {
    const parent = path.resolve(parentDir) + path.sep;
    const target = path.resolve(targetPath);
    return target.startsWith(parent);
}

function listFiles(dir, filter) {
    try {
        return fs.readdirSync(dir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && (!filter || filter(entry.name)))
            .map((entry) => entry.name);
    } catch (err) {
        return [];
    }
}

module.exports = {
    isPlainObject,
    deepMerge,
    readJson,
    writeJson,
    writeFileAtomic,
    escapeHtml,
    escapeAttr,
    stripTags,
    htmlToText,
    pad2,
    dedent,
    eolOf,
    splitCategories,
    toYmd,
    todayISO,
    normalizeDate,
    excerpt,
    countWords,
    safeHtmlFilename,
    ensureInside,
    listFiles
};
