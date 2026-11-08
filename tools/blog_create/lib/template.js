'use strict';

/**
 * 文章模板：把一篇文章的数据渲染成完整 HTML；以及把已有 HTML 反解析回数据。
 */

const { escapeHtml, escapeAttr, htmlToText, excerpt, dedent, splitCategories } = require('./util');
const markdown = require('./markdown');
const { categoryPage } = require('./config');

const NAV_START = '<!-- prev-next:start -->';
const NAV_END = '<!-- prev-next:end -->';

/** 正文渲染：Markdown 或原始 HTML。 */
function renderBody(content, options) {
    const opts = options || {};
    const text = String(content == null ? '' : content);
    if (opts.format === 'html') return text.trim();
    return markdown.render(text, {
        paragraphMode: opts.paragraphMode || 'auto',
        mergeImages: opts.mergeImages !== false,
        autoLink: opts.autoLink !== false,
        headingShift: typeof opts.headingShift === 'number' ? opts.headingShift : 0
    });
}

/**
 * 给 HTML 加缩进，但跳过 <pre>/<script>/<style>/<textarea> 内部，
 * 避免破坏代码块的空白。
 */
function indentHtml(html, spaces) {
    const pad = ' '.repeat(spaces);
    let insideRaw = null;

    return String(html).split('\n').map(function (line) {
        if (insideRaw) {
            if (line.toLowerCase().indexOf(insideRaw) !== -1) insideRaw = null;
            return line;
        }
        const lower = line.toLowerCase();
        const match = /<(pre|script|style|textarea)\b/.exec(lower);
        if (match) {
            const tag = match[1];
            if (lower.indexOf('</' + tag + '>', match.index) === -1) insideRaw = '</' + tag + '>';
            return pad + line;
        }
        return line ? pad + line : line;
    }).join('\n');
}

function navLink(post) {
    if (!post || !post.filename) return '没有了';
    const title = post.navTitle || post.title || post.filename;
    return `<a href="${escapeAttr(post.filename)}">${title}</a>`;
}

/** 上下篇导航块（带标记，方便以后精准替换）。 */
function buildNavBlock(nav) {
    nav = nav || {};
    return [
        `        ${NAV_START}`,
        `        <p>上一篇：${navLink(nav.prev)}<br>`,
        `            下一篇：${navLink(nav.next)}</p>`,
        `        <p>同分类上一篇：${navLink(nav.catPrev)}<br>`,
        `            同分类下一篇：${navLink(nav.catNext)}</p>`,
        `        ${NAV_END}`
    ].join('\n');
}

function buildGiscus(giscus) {
    if (!giscus || !giscus.enabled) return '';
    const attrs = [
        ['data-repo', giscus.repo],
        ['data-repo-id', giscus.repoId],
        ['data-category-id', giscus.categoryId],
        ['data-mapping', giscus.mapping],
        ['data-strict', giscus.strict],
        ['data-reactions-enabled', giscus.reactionsEnabled],
        ['data-emit-metadata', giscus.emitMetadata],
        ['data-input-position', giscus.inputPosition],
        ['data-theme', giscus.theme],
        ['data-lang', giscus.lang]
    ].filter(function (pair) {
        return pair[1] !== undefined && pair[1] !== null && pair[1] !== '';
    });

    return [
        '        <div class="giscus"></div>',
        '        <script src="https://giscus.app/client.js"'
    ].concat(attrs.map(function (pair) {
        return `            ${pair[0]}="${escapeAttr(pair[1])}"`;
    })).concat([
        '            crossorigin="anonymous"',
        '            async>',
        '        </script>'
    ]).join('\n');
}

/**
 * 渲染完整文章页。
 * @param {object} post  { title, date, author, category, keywords, filename, content, format, paragraphMode }
 * @param {object} ctx   { config, nav, forPreview }
 */
function buildArticle(post, ctx) {
    const context = ctx || {};
    const config = context.config;
    const nav = context.nav || {};
    const forPreview = !!context.forPreview;

    const bodyHtml = renderBody(post.content, {
        format: post.format,
        paragraphMode: post.paragraphMode,
        mergeImages: config.markdown.mergeImages,
        autoLink: config.markdown.autoLink,
        headingShift: config.markdown.headingShift
    });
    const body = indentHtml(bodyHtml, 12);

    const plainTitle = htmlToText(post.title).replace(/\s+/g, ' ').trim();
    const pageTitle = `${config.site.titlePrefix || ''}${plainTitle}`;
    const summary = post.description || excerpt(bodyHtml, 120);
    const categories = splitCategories(post.category);
    const categoryLinks = (categories.length ? categories : [post.category])
        .map((name) => `<a href="../${escapeAttr(post.categoryPage || categoryPage(config, name))}">${escapeHtml(name)}</a>`)
        .join('/');
    const authorHtml = post.author && String(post.author).trim()
        ? `  作者：${post.author}`
        : '';
    const updatedHtml = post.updated
        ? `            <p>最后一次更新：${escapeHtml(post.updated)}</p>\n`
        : '';
    const slug = String(post.filename || post.date || 'article').replace(/\.html?$/i, '');

    const homeLink = forPreview ? '#' : (config.site.homeLink || '../index.html');
    const indexLink = forPreview ? '#' : (config.site.indexLink || '../blog.html');
    const headBase = forPreview ? '    <base href="/site/blog/">\n' : '';
    const keywordsMeta = post.keywords
        ? `    <meta name="keywords" content="${escapeAttr(post.keywords)}">\n`
        : '';
    const giscus = forPreview ? '' : buildGiscus(config.giscus);

    return `<!DOCTYPE html>
<html lang="${escapeAttr(config.site.lang || 'zh-CN')}">
<head>
${headBase}    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pageTitle)}</title>
    <meta name="author" content="${escapeAttr(htmlToText(post.author))}">
    <meta name="description" content="${escapeAttr(summary)}">
${keywordsMeta}    <meta property="og:type" content="article">
    <meta property="og:site_name" content="${escapeAttr(config.site.name || '')}">
    <meta property="og:title" content="${escapeAttr(plainTitle)}">
    <meta property="og:description" content="${escapeAttr(summary)}">
    <link rel="stylesheet" href="../blog_article.css">
    <script src="../mobile_script.js" defer></script>
</head>
<body>
    <nav>
        <a href="${escapeAttr(homeLink)}">返回主页</a>
        <a href="${escapeAttr(indexLink)}">查看其他杂谈</a>
    </nav>
    <div class="content">
        <div id="${escapeAttr(slug)}" class="chapter-content" style="display: block;">
            <h2>${post.title}</h2>
            <p>时间：${escapeHtml(post.date)}${authorHtml}</p>
            <p>分类：${categoryLinks}</p>
${updatedHtml}            <p class="share-area">
                <a href="#" class="share-link">分享文章</a>
                <span class="share-message" aria-live="polite"></span>
            </p>
            <hr>
${body}
        </div>
        <hr>
${buildNavBlock(nav)}
${giscus ? giscus + '\n' : ''}    </div>
</body>
</html>
`;
}

/** 找到与 from 处 <div> 配对的 </div>，返回其起始下标；失败返回 -1。 */
function findMatchingDivEnd(html, from) {
    let depth = 1;
    const re = /<div\b[^>]*>|<\/div\s*>/gi;
    re.lastIndex = from;
    let match;
    while ((match = re.exec(html))) {
        if (match[0].charAt(1) === '/') {
            depth--;
            if (depth === 0) return match.index;
        } else {
            depth++;
        }
    }
    return -1;
}

/** 取出 chapter-content 内部的 HTML（不含外层 div）。 */
function extractChapterInner(html) {
    const open = /<div\b[^>]*class="[^"]*\bchapter-content\b[^"]*"[^>]*>/i.exec(html);
    if (!open) return '';
    const start = open.index + open[0].length;

    // 优先用“导航区块前最后一个 </div>”定位结尾：
    // 个别老文章里有多余的 </div>，按标签配对会提前截断正文。
    let navStart = html.search(/<!--\s*prev-next:start\s*-->/);
    if (navStart === -1) navStart = html.search(/<p[^>]*>\s*上一篇：/);
    if (navStart > start) {
        const closeIndex = html.lastIndexOf('</div>', navStart);
        if (closeIndex > start) return html.slice(start, closeIndex);
    }

    const end = findMatchingDivEnd(html, start);
    if (end === -1) return '';
    return html.slice(start, end);
}

/** 从已有文章 HTML 中还原出字段（用于“打开已有文章”）。 */
function parseArticle(html) {
    const result = {
        title: '',
        date: '',
        updated: '',
        author: '',
        category: '',
        keywords: '',
        content: ''
    };

    const titleMatch = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
    if (titleMatch) result.title = titleMatch[1].trim();

    // 兼容 “时间：2025-01-31” 与 “时间：2025-01-31  作者：…” 两种写法
    const metaMatch = /<p[^>]*>\s*时间：([^\s<]{1,20})([\s\S]*?)<\/p>/i.exec(html);
    if (metaMatch) {
        result.date = metaMatch[1].trim();
        // 作者里可能包含链接或删除线，原样保留
        const authorMatch = /作者：([\s\S]*)$/.exec(metaMatch[2]);
        if (authorMatch) result.author = authorMatch[1].trim();
    }

    // 分类可能写成 “音乐/BanG Dream!”，逐个别名都要保留
    const categoryMatch = /<p[^>]*>\s*分类：([\s\S]*?)<\/p>/i.exec(html);
    if (categoryMatch) {
        const names = Array.from(categoryMatch[1].matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi))
            .map((match) => htmlToText(match[1]).trim())
            .filter(Boolean);
        result.category = names.length
            ? names.join(' / ')
            : htmlToText(categoryMatch[1]).trim();
    }

    const keywordsMatch = /<meta\s+name="keywords"\s+content="([^"]*)"/i.exec(html);
    if (keywordsMatch) result.keywords = keywordsMatch[1];

    let content = extractChapterInner(html);
    if (content) {
        // 头部（标题 / 时间 / 分类 / 分享）之后紧跟一个 <hr>，它后面的才是正文。
        // 不能直接找第一个 <hr>：正文里的分割线可能更靠前。
        const share = /<p[^>]*class="[^"]*share-area[^"]*"[\s\S]*?<\/p>/i.exec(content);
        const category = /<p[^>]*>\s*分类：[\s\S]*?<\/p>/i.exec(content);
        let searchFrom = 0;
        if (share) searchFrom = share.index + share[0].length;
        else if (category) searchFrom = category.index + category[0].length;
        const hrIndex = content.indexOf('<hr', searchFrom);

        if (hrIndex !== -1) {
            const hrEnd = content.indexOf('>', hrIndex) + 1;
            let header = content.slice(0, hrIndex);
            const updatedMatch = /<p[^>]*>\s*最后一次更新：([^<]*)<\/p>/i.exec(header);
            if (updatedMatch) {
                result.updated = updatedMatch[1].trim();
                header = header.replace(updatedMatch[0], '');
            }
            header = header
                .replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '')
                .replace(/<p[^>]*>\s*时间：[\s\S]*?<\/p>/, '')
                .replace(/<p[^>]*>\s*分类：[\s\S]*?<\/p>/, '')
                .replace(/<p[^>]*class="[^"]*share-area[^"]*"[\s\S]*?<\/p>/, '')
                .trim();
            content = (header ? header + '\n' : '') + content.slice(hrEnd);
        } else {
            const updatedMatch = /<p[^>]*>\s*最后一次更新：([^<]*)<\/p>/i.exec(content);
            if (updatedMatch) {
                result.updated = updatedMatch[1].trim();
                content = content.replace(updatedMatch[0], '');
            }
            content = content
                .replace(/^\s*<h2[^>]*>[\s\S]*?<\/h2>/, '')
                .replace(/^\s*<p[^>]*>\s*时间：[\s\S]*?<\/p>/, '')
                .replace(/^\s*<p[^>]*>\s*分类：[\s\S]*?<\/p>/, '')
                .replace(/^\s*<p[^>]*class="[^"]*share-area[^"]*"[\s\S]*?<\/p>/, '');
        }
        result.content = dedent(content).replace(/^\s*\n/, '').replace(/\s+$/, '');
    }

    return result;
}

module.exports = {
    NAV_START,
    NAV_END,
    renderBody,
    indentHtml,
    buildNavBlock,
    buildArticle,
    parseArticle,
    extractChapterInner,
    findMatchingDivEnd
};
