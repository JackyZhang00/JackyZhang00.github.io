'use strict';

/**
 * 极简 front matter（--- 包裹的 key: value），供草稿与 CLI 共用。
 * 只处理单行键值，不依赖 YAML 库。
 */

function unquote(value) {
    const text = String(value).trim();
    if (text.length >= 2 && text.charAt(0) === '"' && text.charAt(text.length - 1) === '"') {
        try {
            return JSON.parse(text);
        } catch (err) {
            return text.slice(1, -1);
        }
    }
    if (text.length >= 2 && text.charAt(0) === "'" && text.charAt(text.length - 1) === "'") {
        return text.slice(1, -1);
    }
    if (text === 'true') return true;
    if (text === 'false') return false;
    return text;
}

function parse(text) {
    const normalized = String(text == null ? '' : text)
        .replace(/^\uFEFF/, '')
        .replace(/\r\n?/g, '\n');
    const match = /^---\n([\s\S]*?)\n---[ \t]*\n?/.exec(normalized);
    if (!match) return { data: {}, body: normalized };

    const data = {};
    for (const line of match[1].split('\n')) {
        if (!line.trim() || line.trim().charAt(0) === '#') continue;
        const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
        if (!pair) continue;
        data[pair[1]] = unquote(pair[2]);
    }
    return { data: data, body: normalized.slice(match[0].length) };
}

function stringify(data, body) {
    const lines = ['---'];
    for (const key of Object.keys(data || {})) {
        const value = data[key];
        if (value === undefined || value === null || value === '') continue;
        lines.push(`${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`);
    }
    lines.push('---', '');
    return lines.join('\n') + String(body == null ? '' : body).replace(/\r\n?/g, '\n');
}

module.exports = { parse, stringify };
