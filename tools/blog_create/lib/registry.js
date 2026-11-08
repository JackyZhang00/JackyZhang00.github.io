'use strict';

/**
 * 文章登记表（data.json）、站点文章列表（blog.html）、上下篇链接的维护。
 *
 * 重要：data.json 里可能只登记了部分文章，而 blog.html 的列表是完整的。
 * 因此“上一/下一篇”以 blog.html 列表 + data.json 一起推导，避免漏掉老文章。
 */

const fs = require('fs');
const path = require('path');
const util = require('./util');
const template = require('./template');
const { categoryPage } = require('./config');

/* ------------------------------------------------------------------ *
 * data.json
 * ------------------------------------------------------------------ */

function readDb(config) {
    const raw = util.readJson(config._dataFile, []);
    if (!Array.isArray(raw)) return [];

    const posts = [];
    const indexByName = new Map();
    for (const item of raw) {
        if (!item || !item.filename) continue;
        const filename = String(item.filename).replace(/^.*[\\/]/, '');
        const normalized = Object.assign({}, item, { filename: filename });
        if (indexByName.has(filename)) {
            posts[indexByName.get(filename)] = Object.assign({}, posts[indexByName.get(filename)], normalized);
        } else {
            indexByName.set(filename, posts.length);
            posts.push(normalized);
        }
    }
    return posts;
}

function writeDb(config, posts) {
    util.writeJson(config._dataFile, posts);
}

function entryOf(post) {
    return {
        id: post.filename.replace(/\.html?$/i, ''),
        title: post.title,
        date: post.date,
        category: post.category,
        filename: post.filename
    };
}

/** 新增或更新一条记录（按 filename 匹配）。 */
function upsertPost(posts, post) {
    const entry = entryOf(post);
    const index = posts.findIndex((item) => item.filename === entry.filename);
    if (index === -1) {
        posts.push(entry);
        return 'created';
    }
    posts[index] = Object.assign({}, posts[index], entry);
    return 'updated';
}

/* ------------------------------------------------------------------ *
 * 排序与上下篇
 * ------------------------------------------------------------------ */

function dateKey(article) {
    return util.normalizeDate(article.date) || '0000-00-00';
}

function sortAsc(articles) {
    return articles.slice().sort(function (a, b) {
        const da = dateKey(a);
        const db = dateKey(b);
        if (da !== db) return da < db ? -1 : 1;
        return String(a.filename).localeCompare(String(b.filename), 'en');
    });
}

function sortDesc(articles) {
    return sortAsc(articles).reverse();
}

/**
 * 计算某篇文章的上一/下一篇（全局 + 同分类）。
 * 约定：上一篇 = 更早的文章，下一篇 = 更晚的文章。
 */
function computeNav(articles, filename) {
    const asc = sortAsc(articles);
    const index = asc.findIndex((article) => article.filename === filename);
    const target = index === -1 ? null : asc[index];
    const categoryOf = (article) => article.primaryCategory || util.splitCategories(article.category)[0] || '';
    const sameCategory = target ? asc.filter((article) => categoryOf(article) === categoryOf(target)) : [];
    const catIndex = target ? sameCategory.findIndex((article) => article.filename === filename) : -1;

    return {
        prev: index > 0 ? asc[index - 1] : null,
        next: index !== -1 && index < asc.length - 1 ? asc[index + 1] : null,
        catPrev: catIndex > 0 ? sameCategory[catIndex - 1] : null,
        catNext: catIndex !== -1 && catIndex < sameCategory.length - 1 ? sameCategory[catIndex + 1] : null,
        sameCategoryCount: sameCategory.length,
        position: index === -1 ? null : index + 1,
        total: asc.length
    };
}

function navKey(nav) {
    const pick = (item) => (item ? [item.filename, item.title, item.date].join('\u0001') : '');
    return [pick(nav.prev), pick(nav.next), pick(nav.catPrev), pick(nav.catNext)].join('\u0002');
}

function navSnapshot(articles) {
    const snapshot = new Map();
    for (const article of articles) {
        snapshot.set(article.filename, navKey(computeNav(articles, article.filename)));
    }
    return snapshot;
}

/* ------------------------------------------------------------------ *
 * 从站点列表（blog.html）读取完整文章清单
 * ------------------------------------------------------------------ */

function extractEntryDate(html) {
    const match = /创建时间：\s*(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(html);
    if (!match) return '';
    return `${match[1]}-${util.pad2(Number(match[2]))}-${util.pad2(Number(match[3]))}`;
}

function entryTitleHtml(html) {
    const match = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(html);
    return match ? match[1].trim() : '';
}

function entryText(html) {
    return util.htmlToText(html).trim();
}

function extractEntryCategory(html) {
    const match = /分类：([\s\S]*?)(?:<br\s*\/?>|<\/p>)/i.exec(html);
    if (!match) return '';
    const names = Array.from(match[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi))
        .map((link) => util.htmlToText(link[1]).trim())
        .filter(Boolean);
    return names.length ? names.join(' / ') : util.htmlToText(match[1]).trim();
}

function extractEntryKeywords(html) {
    const match = /<span class="keywords">([\s\S]*?)<\/span>/i.exec(html);
    return match ? util.htmlToText(match[1]).trim() : '';
}

function commentRanges(html) {
    const ranges = [];
    const re = /<!--[\s\S]*?-->/g;
    let match;
    while ((match = re.exec(html))) {
        ranges.push([match.index, match.index + match[0].length]);
    }
    return ranges;
}

function insideRanges(index, ranges) {
    return ranges.some((range) => index >= range[0] && index < range[1]);
}

/** 在 [from, to) 范围内扫描 class="article" 的条目。 */
function scanArticleEntries(html, from, to, skipComments) {
    const entries = [];
    const tagRe = /<div\b[^>]*>/gi;
    const comments = skipComments === false ? [] : commentRanges(html);
    let cursor = from;

    while (cursor < to) {
        tagRe.lastIndex = cursor;
        const match = tagRe.exec(html);
        if (!match || match.index >= to) break;

        const classMatch = /class=["']([^"']*)["']/i.exec(match[0]);
        const classes = classMatch ? classMatch[1].split(/\s+/) : [];
        if (classes.indexOf('article') === -1) {
            cursor = match.index + match[0].length;
            continue;
        }

        const closeIndex = template.findMatchingDivEnd(html, match.index + match[0].length);
        if (closeIndex === -1 || closeIndex >= to) break;
        const end = closeIndex + '</div>'.length;
        const lineStart = html.lastIndexOf('\n', match.index) + 1;
        const rawIndent = html.slice(lineStart, match.index);

        if (!insideRanges(match.index, comments)) {
            entries.push({
                start: match.index,
                lineStart: lineStart,
                end: end,
                indent: /^[ \t]*$/.test(rawIndent) ? rawIndent : '',
                text: html.slice(match.index, end)
            });
        }
        cursor = end;
    }
    return entries;
}

function findArticlesContainer(html) {
    const container = /<div\b[^>]*\bid=["']articles["'][^>]*>/i.exec(html);
    if (!container) return null;
    const contentStart = container.index + container[0].length;
    const contentEnd = template.findMatchingDivEnd(html, contentStart);
    if (contentEnd === -1) return null;
    return { contentStart: contentStart, contentEnd: contentEnd };
}

function readIndexEntries(config) {
    const entries = [];
    let html = '';
    try {
        html = fs.readFileSync(config._indexPage, 'utf8');
    } catch (err) {
        return entries;
    }

    const container = findArticlesContainer(html);
    if (!container) return entries;

    for (const entry of scanArticleEntries(html, container.contentStart, container.contentEnd)) {
        const href = /href=["']blog\/([^"']+)["']/i.exec(entry.text);
        if (!href) continue;
        const filename = path.basename(href[1]);
        if (!/\.html?$/i.test(filename)) continue;
        entries.push({
            filename: filename,
            title: entryTitleHtml(entry.text),
            date: extractEntryDate(entry.text),
            category: extractEntryCategory(entry.text),
            keywords: extractEntryKeywords(entry.text),
            source: 'index'
        });
    }
    return entries;
}

/** 上下篇链接里不显示“【置顶】”前缀，与站点现有习惯保持一致。 */
function stripPinned(title, config) {
    const keyword = (config && config.indexUpdate && config.indexUpdate.pinnedKeyword) || '';
    if (!keyword) return title;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(title == null ? '' : title).replace(new RegExp(`^\\s*【\\s*${escaped}\\s*】\\s*`), '');
}

function articleRecord(filename, title, date, category, keywords, source, config) {
    const categories = util.splitCategories(category);
    return {
        filename: filename,
        title: title,
        navTitle: stripPinned(title, config),
        date: date,
        category: categories.length ? categories.join(' / ') : String(category || ''),
        categories: categories,
        primaryCategory: categories[0] || '',
        keywords: keywords || '',
        source: source
    };
}

/**
 * 汇总所有文章：blog.html 列表 ∪ data.json（data.json 优先）。
 * @returns {{articles:Array, missingFiles:Array, unregistered:Array, unlisted:Array, indexed:Array}}
 */
function loadArticles(config) {
    const indexEntries = readIndexEntries(config);
    const byName = new Map();
    for (const entry of indexEntries) {
        if (!byName.has(entry.filename)) {
            byName.set(entry.filename, articleRecord(
                entry.filename, entry.title, entry.date, entry.category, entry.keywords, 'index', config
            ));
        }
    }

    const db = readDb(config);
    const dbNames = new Set(db.map((post) => post.filename));
    for (const post of db) {
        const existing = byName.get(post.filename);
        const title = post.title || (existing && existing.title) || post.filename;
        const article = articleRecord(
            post.filename,
            title,
            util.normalizeDate(post.date) || (existing && existing.date) || '',
            post.category || (existing && existing.category) || config.defaultCategory,
            post.keywords || (existing && existing.keywords) || '',
            existing ? 'index+db' : 'db',
            config
        );
        byName.set(post.filename, article);
    }

    const articles = [];
    const missingFiles = [];
    for (const article of byName.values()) {
        if (fs.existsSync(path.join(config._postsDir, article.filename))) articles.push(article);
        else missingFiles.push(article.filename);
    }

    const indexNames = new Set(indexEntries.map((entry) => entry.filename));
    const diskFiles = util.listFiles(config._postsDir, (name) => /\.html?$/i.test(name));
    return {
        articles: articles,
        missingFiles: missingFiles,
        unregistered: articles.filter((article) => !dbNames.has(article.filename)).map((article) => article.filename),
        unlisted: diskFiles.filter((name) => !indexNames.has(name) && !dbNames.has(name)),
        indexed: Array.from(indexNames)
    };
}

function upsertArticle(articles, post, config) {
    const entry = articleRecord(
        post.filename,
        post.title,
        util.normalizeDate(post.date) || '',
        post.category,
        post.keywords || '',
        'current',
        config
    );
    const index = articles.findIndex((article) => article.filename === entry.filename);
    if (index === -1) articles.push(entry);
    else articles[index] = Object.assign({}, articles[index], entry);
    return entry;
}

/* ------------------------------------------------------------------ *
 * 把上下篇写回文章文件
 * ------------------------------------------------------------------ */

const MARKED_NAV_RE = /[ \t]*<!--\s*prev-next:start\s*-->[\s\S]*?<!--\s*prev-next:end\s*-->/g;
// 段落内部不允许跨过 </p>，否则被注释掉的旧导航会把整篇文件吞进匹配里
const LEGACY_NAV_RE = /[ \t]*<p[^>]*>\s*上一篇：(?:(?!<\/p>)[\s\S])*?<\/p>\s*<p[^>]*>\s*同分类上一篇：(?:(?!<\/p>)[\s\S])*?<\/p>/g;

/** 找到真正的上下篇区块（跳过被注释掉的旧区块，取最后一个）。 */
function findNavRange(html) {
    const marked = [];
    let match;
    MARKED_NAV_RE.lastIndex = 0;
    while ((match = MARKED_NAV_RE.exec(html))) {
        marked.push({ start: match.index, end: match.index + match[0].length });
    }
    if (marked.length) return marked[marked.length - 1];

    const comments = commentRanges(html);
    let last = null;
    LEGACY_NAV_RE.lastIndex = 0;
    while ((match = LEGACY_NAV_RE.exec(html))) {
        if (!insideRanges(match.index, comments)) {
            last = { start: match.index, end: match.index + match[0].length };
        }
    }
    return last;
}

function navBlockFor(html, nav) {
    const block = template.buildNavBlock(nav);
    return util.eolOf(html) === '\r\n' ? block.replace(/\n/g, '\r\n') : block;
}

/** 解析现有导航块里的链接（顺序：上一篇、下一篇 / 同分类上一篇、同分类下一篇）。 */
function parseNavLinks(block) {
    const paragraphs = [];
    const paragraphRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
    let match;
    while ((match = paragraphRe.exec(block))) paragraphs.push(match[1]);

    const parse = function (text) {
        const links = [];
        const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        let link;
        while ((link = linkRe.exec(text || ''))) {
            links.push([link[1], util.htmlToText(link[2])]);
        }
        return links;
    };
    return { global: parse(paragraphs[0]), cat: parse(paragraphs[1]) };
}

function navExpectation(nav) {
    const link = (item) => (item ? [item.filename, util.htmlToText(item.navTitle || item.title)] : null);
    return {
        global: [link(nav.prev), link(nav.next)].filter(Boolean),
        cat: [link(nav.catPrev), link(nav.catNext)].filter(Boolean)
    };
}

/**
 * 现有文件的上下篇链接是否真的与期望不一致。
 * 只比较“链接指向 + 链接文字”，不关心缩进 / 是否有标记注释，
 * 这样不会为了统一格式而改动老文章。
 */
function navNeedsUpdate(html, nav) {
    const range = findNavRange(html);
    if (!range) return true;
    const actual = parseNavLinks(html.slice(range.start, range.end));
    return JSON.stringify(actual) !== JSON.stringify(navExpectation(nav));
}

/** 替换文章里的上下篇区块；找不到可替换内容时返回 null。 */
function replaceNavBlock(html, block) {
    const range = findNavRange(html);
    if (!range) return null;
    return html.slice(0, range.start) + block + html.slice(range.end);
}

function navStatusInFile(filePath, nav, semantic) {
    if (!fs.existsSync(filePath)) return 'missing';
    const html = fs.readFileSync(filePath, 'utf8');
    if (semantic !== false && !navNeedsUpdate(html, nav)) return 'unchanged';
    const next = replaceNavBlock(html, navBlockFor(html, nav));
    if (next === null) return 'no-nav-block';
    return next === html ? 'unchanged' : 'updated';
}

function updateNavInFile(filePath, nav, options) {
    const opts = options || {};
    if (!fs.existsSync(filePath)) return 'missing';
    const html = fs.readFileSync(filePath, 'utf8');
    if (opts.semantic !== false && !navNeedsUpdate(html, nav)) return 'unchanged';
    const next = replaceNavBlock(html, navBlockFor(html, nav));
    if (next === null) return 'no-nav-block';
    if (next === html) return 'unchanged';
    util.writeFileAtomic(filePath, next);
    return 'updated';
}

/**
 * 按文章清单重新计算并写入上下篇。
 * @param {Array} articles loadArticles().articles
 * @param {object} config
 * @param {object} options { dryRun, semantic, only:Set<filename> }
 */
function syncAllNav(articles, config, options) {
    const opts = options || {};
    const semantic = opts.semantic !== false;
    const only = opts.only instanceof Set ? opts.only : null;
    const results = [];

    for (const article of sortAsc(articles)) {
        if (only && !only.has(article.filename)) continue;
        const file = path.join(config._postsDir, article.filename);
        const nav = computeNav(articles, article.filename);
        const status = opts.dryRun
            ? navStatusInFile(file, nav, semantic)
            : updateNavInFile(file, nav, { semantic: semantic });
        results.push({ filename: article.filename, status: status });
    }
    return results;
}

/* ------------------------------------------------------------------ *
 * 站点文章列表（blog.html / xxx_blogs.html）
 * ------------------------------------------------------------------ */

function renderIndexEntry(post, config, indent) {
    const pad = indent || '      ';
    const categories = util.splitCategories(post.category);
    const categoryLinks = (categories.length ? categories : [post.category])
        .map((name) => `<a href="${categoryPage(config, name)}">${util.escapeHtml(name)}</a>`)
        .join('/');
    const keywords = post.keywords
        ? `<br>其他关键词：<span class="keywords">${util.escapeHtml(util.htmlToText(post.keywords))}</span>`
        : '';
    const updatedText = post.updated ? ` 最后一次更新：${post.updated}` : '';
    return [
        `${pad}<div class="article">`,
        `${pad}  <a href="blog/${post.filename}"><h3>${post.title}</h3></a>`,
        `${pad}  <p>创建时间：${post.date}${updatedText}<br>分类：${categoryLinks}${keywords}</p>`,
        `${pad}</div>`
    ].join('\n');
}

function isPinned(html, config) {
    const keyword = (config.indexUpdate && config.indexUpdate.pinnedKeyword) || '置顶';
    return entryText(html).indexOf(keyword) !== -1;
}

/**
 * 把文章写入某个列表页的 #articles 容器（按日期倒序，置顶条目保持在最前）。
 * 已存在同一文件名的条目时，会先移除再按日期插入。
 * @returns {{ok:boolean, action?:string, reason?:string, page?:string}}
 */
function insertIndexEntry(pagePath, post, config) {
    if (!pagePath) return { ok: false, reason: '没有对应的列表页面' };
    if (!fs.existsSync(pagePath)) return { ok: false, reason: `列表页面不存在：${path.basename(pagePath)}` };

    const html = fs.readFileSync(pagePath, 'utf8');
    const container = findArticlesContainer(html);
    if (!container) return { ok: false, reason: `找不到 #articles 容器：${path.basename(pagePath)}` };

    const entries = scanArticleEntries(html, container.contentStart, container.contentEnd);
    for (const entry of entries) {
        entry.date = extractEntryDate(entry.text);
        entry.pinned = isPinned(entry.text, config);
    }

    const href = `blog/${post.filename}`;
    const existing = entries.find((entry) => entry.text.indexOf(`href="${href}"`) !== -1);
    const others = entries.filter((entry) => entry !== existing);

    const targetDate = util.normalizeDate(post.date) || '0000-00-00';
    let searchFrom = 0;
    while (searchFrom < others.length && others[searchFrom].pinned) searchFrom++;

    let insertIndex = others.length;
    for (let i = searchFrom; i < others.length; i++) {
        const entryDate = others[i].date || '0000-00-00';
        if (entryDate < targetDate) {
            insertIndex = i;
            break;
        }
    }

    const indent = (insertIndex < others.length ? others[insertIndex].indent : (others[0] && others[0].indent)) || '      ';
    let insertText;
    let insertAt;
    if (insertIndex >= others.length) {
        insertAt = others.length ? others[others.length - 1].end : container.contentStart;
        insertText = '\n' + renderIndexEntry(post, config, indent);
    } else {
        insertAt = others[insertIndex].lineStart;
        insertText = renderIndexEntry(post, config, indent) + '\n';
    }
    if (util.eolOf(html) === '\r\n') insertText = insertText.replace(/\n/g, '\r\n');

    const edits = [];
    if (existing) edits.push({ start: existing.lineStart, end: existing.end, text: '' });
    edits.push({ start: insertAt, end: insertAt, text: insertText });
    edits.sort(function (a, b) { return b.start - a.start; });

    let output = html;
    for (const edit of edits) {
        output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    }

    if (output === html) {
        return { ok: true, action: 'unchanged', page: path.basename(pagePath) };
    }
    util.writeFileAtomic(pagePath, output);
    return {
        ok: true,
        action: existing ? 'updated' : 'inserted',
        page: path.basename(pagePath)
    };
}

module.exports = {
    readDb,
    writeDb,
    entryOf,
    upsertPost,
    sortAsc,
    sortDesc,
    computeNav,
    navKey,
    navSnapshot,
    readIndexEntries,
    loadArticles,
    upsertArticle,
    scanArticleEntries,
    findArticlesContainer,
    extractEntryDate,
    entryTitleHtml,
    entryText,
    findNavRange,
    replaceNavBlock,
    navNeedsUpdate,
    navStatusInFile,
    updateNavInFile,
    syncAllNav,
    renderIndexEntry,
    insertIndexEntry
};
