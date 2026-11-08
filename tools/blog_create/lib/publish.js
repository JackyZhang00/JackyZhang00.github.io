'use strict';

/**
 * 发布流程：校验输入 → 渲染文章 → 写文件 → 修复上下篇 → 更新列表页 → 写入 data.json。
 * 服务器（server.js）与命令行（cli.js）共用这一套逻辑。
 */

const fs = require('fs');
const path = require('path');
const util = require('./util');
const template = require('./template');
const registry = require('./registry');
const { categoryPage } = require('./config');

class UserError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'UserError';
        this.status = status || 400;
    }
}

function normalizePost(input, config) {
    const warnings = [];
    const source = input || {};

    const title = String(source.title == null ? '' : source.title).trim();
    let date = util.normalizeDate(source.date);
    if (!date) {
        date = util.todayISO();
        if (source.date) warnings.push(`日期“${source.date}”无法识别，已改用今天（${date}）`);
    }

    const author = String(
        source.author === undefined || source.author === null ? (config.author || '') : source.author
    ).trim();
    const categories = util.splitCategories(source.category || config.defaultCategory || '');
    if (!categories.length) categories.push(config.defaultCategory || '杂谈');
    const category = categories.join(' / ');
    const keywords = String(source.keywords || '').trim();
    const updated = util.normalizeDate(source.updated) || '';
    const content = String(source.content == null ? '' : source.content);
    const format = source.format === 'html' ? 'html' : 'markdown';
    const paragraphMode = ['auto', 'blank', 'line'].indexOf(source.paragraphMode) !== -1
        ? source.paragraphMode
        : (config.markdown.paragraphMode || 'auto');

    let filename;
    if (source.filename && String(source.filename).trim()) {
        filename = util.safeHtmlFilename(source.filename);
        if (!filename) {
            warnings.push(`文件名“${source.filename}”不合法，已改用 ${date}.html`);
            filename = `${date}.html`;
        }
    } else {
        filename = `${date}.html`;
    }

    for (const name of categories) {
        if (!config.categories[name]) {
            warnings.push(`分类“${name}”还没有配置分类页面，只会写入总列表（可在 config.json 中补充）`);
        }
    }

    return {
        post: { title, date, updated, author, category, categories, keywords, content, format, paragraphMode, filename },
        warnings: warnings
    };
}

function resolveTarget(config, filename) {
    const file = path.join(config._postsDir, filename);
    if (!util.ensureInside(config._postsDir, file)) {
        throw new UserError(`文件名不合法：${filename}`);
    }
    return { filename: filename, file: file };
}

function uniqueFilename(config, posts, filename) {
    const base = filename.replace(/\.html?$/i, '');
    for (let i = 1; i <= 99; i++) {
        const candidate = `${base}-${i}.html`;
        const taken = posts.some((post) => post.filename === candidate) ||
            fs.existsSync(path.join(config._postsDir, candidate));
        if (!taken) return candidate;
    }
    throw new UserError(`无法为 ${filename} 找到可用的文件名（已尝试 -1 到 -99）`);
}

function serializeNav(nav) {
    const pick = function (post) {
        if (!post) return null;
        return {
            title: util.htmlToText(post.title),
            filename: post.filename,
            date: post.date,
            category: post.category
        };
    };
    return {
        prev: pick(nav.prev),
        next: pick(nav.next),
        catPrev: pick(nav.catPrev),
        catNext: pick(nav.catNext),
        position: nav.position,
        total: nav.total,
        sameCategoryCount: nav.sameCategoryCount
    };
}

/**
 * 发布前的内容体检：图片缺 alt / 地址为空 / 本地图片不存在 / 占位链接。
 * @returns {string[]} 提示文案
 */
function lintHtml(html, config) {
    const warnings = [];
    const images = html.match(/<img\b[^>]*>/gi) || [];
    if (!images.length && !String(html).trim()) {
        warnings.push('正文是空的');
        return warnings;
    }

    const withoutAlt = images.filter(function (tag) {
        return !/\balt\s*=\s*["'][^"']+["']/i.test(tag);
    });
    if (withoutAlt.length) {
        warnings.push(`有 ${withoutAlt.length} 张图片缺少 alt 说明（影响无障碍与搜索）`);
    }

    const emptySrc = images.filter(function (tag) {
        const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag);
        return src && !src[1].trim();
    });
    if (emptySrc.length) {
        warnings.push(`有 ${emptySrc.length} 张图片还没有填地址`);
    }

    const missingFiles = [];
    for (const tag of images) {
        const match = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
        if (!match) continue;
        const src = match[1].trim();
        if (!src) continue;
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue; // http(s):、data: 等
        const clean = src.split(/[?#]/)[0];
        if (!clean) continue;
        const file = path.resolve(config._postsDir, clean);
        if (!fs.existsSync(file)) missingFiles.push(src);
    }
    if (missingFiles.length) {
        const list = missingFiles.slice(0, 3).join('、');
        warnings.push(`本地图片不存在：${list}${missingFiles.length > 3 ? ' 等' : ''}`);
    }

    const placeholderLinks = (html.match(/<a\b[^>]*href\s*=\s*["']#["']/gi) || []).length;
    if (placeholderLinks) {
        warnings.push(`有 ${placeholderLinks} 个链接还是占位符 #`);
    }

    return warnings;
}

function describe(post, nav, bodyHtml, config) {
    return {
        title: util.htmlToText(post.title),
        filename: post.filename,
        date: post.date,
        updated: post.updated || '',
        author: post.author,
        category: post.category,
        keywords: post.keywords,
        categoryPage: categoryPage(config, post.category),
        categoryMapped: util.splitCategories(post.category).every((name) => !!config.categories[name]),
        excerpt: util.excerpt(bodyHtml, 120),
        characters: util.countWords(bodyHtml),
        paragraphs: (bodyHtml.match(/<p\b/gi) || []).length,
        headings: (bodyHtml.match(/<h[1-6]\b/gi) || []).length,
        images: (bodyHtml.match(/<img\b/gi) || []).length,
        tables: (bodyHtml.match(/<table\b/gi) || []).length,
        codeBlocks: (bodyHtml.match(/<pre\b/gi) || []).length,
        nav: serializeNav(nav)
    };
}

/**
 * 渲染并（可选）写入一篇博客。
 * @param {object} input   文章字段
 * @param {object} config  loadConfig() 的结果
 * @param {object} options { mode:'create'|'update', originalFilename, overwrite, updateIndex, dryRun, syncNav }
 */
function publish(input, config, options) {
    const opts = options || {};
    const normalized = normalizePost(input, config);
    const post = normalized.post;
    const warnings = normalized.warnings;

    if (!post.title) throw new UserError('标题不能为空');
    if (!post.content.trim()) throw new UserError('正文不能为空');

    let mode = opts.mode === 'update' ? 'update' : 'create';
    const originalFilename = util.safeHtmlFilename(opts.originalFilename) || post.filename;
    if (mode === 'update' && originalFilename !== post.filename) {
        mode = 'create';
        warnings.push('文件名已更改，将另存为一篇新文章（原文件保持不变）');
    }

    const loaded = registry.loadArticles(config);
    const articles = loaded.articles;
    if (!loaded.indexed.length) {
        warnings.push(`${config.indexPage} 中没有找到文章列表，上下篇可能不准确`);
    }

    const db = registry.readDb(config);
    const registered = db.some((item) => item.filename === post.filename);
    const exists = fs.existsSync(path.join(config._postsDir, post.filename));

    if (mode === 'update' && !registered) {
        warnings.push('data.json 中没有这篇记录，已按“新增”处理');
        mode = 'create';
    }

    let renamed = false;
    let target = resolveTarget(config, post.filename);
    if (mode === 'create' && !opts.overwrite && (registered || exists)) {
        post.filename = uniqueFilename(config, db, post.filename);
        target = resolveTarget(config, post.filename);
        renamed = true;
        warnings.push(`同名文件已存在，已自动改用 ${post.filename}`);
    }

    registry.upsertPost(db, post);
    registry.upsertArticle(articles, post, config);
    const nav = registry.computeNav(articles, post.filename);
    const articleHtml = template.buildArticle(post, { config: config, nav: nav, forPreview: false });
    const bodyHtml = template.renderBody(post.content, {
        format: post.format,
        paragraphMode: post.paragraphMode,
        mergeImages: config.markdown.mergeImages,
        autoLink: config.markdown.autoLink,
        headingShift: config.markdown.headingShift
    });
    if (warnings.length < 30) {
        warnings.push.apply(warnings, lintHtml(bodyHtml, config));
    }

    const result = {
        success: true,
        dryRun: !!opts.dryRun,
        mode: mode,
        renamed: renamed,
        filename: post.filename,
        url: `/site/blog/${encodeURIComponent(post.filename)}`,
        warnings: warnings,
        meta: describe(post, nav, bodyHtml, config),
        computed: {
            indexEntry: registry.renderIndexEntry(post, config, '      '),
            navBlock: template.buildNavBlock(nav)
        },
        files: [],
        indexPages: [],
        navUpdated: []
    };

    if (opts.dryRun) {
        result.articleHtml = articleHtml;
        return result;
    }

    util.writeFileAtomic(target.file, articleHtml);
    result.files.push(path.relative(config._repoRoot, target.file).replace(/\\/g, '/'));

    if (opts.syncNav !== false) {
        // 语义比较：只有链接真的不一致时才重写文件（老文章不会被无谓改动）
        const navResults = registry.syncAllNav(articles, config, { semantic: true });
        result.navUpdated = navResults
            .filter((item) => item.status === 'updated')
            .map((item) => item.filename);
        for (const item of navResults) {
            if (item.status === 'missing') {
                warnings.push(`上下篇未更新：${item.filename} 不存在`);
            } else if (item.status === 'no-nav-block') {
                warnings.push(`上下篇未更新：${item.filename} 中找不到导航区块`);
            }
        }
    }

    if (opts.updateIndex !== false && config.indexUpdate.enabled) {
        // 总列表 + 每一个分类对应的分类页（多分类文章会同时出现在多个分类页）
        const pages = [config._indexPage];
        for (const name of util.splitCategories(post.category)) {
            const entry = config.categories[name];
            if (!entry || !entry.page) continue;
            const pageFile = path.resolve(config._repoRoot, entry.page);
            if (pageFile !== config._indexPage && pages.indexOf(pageFile) === -1) {
                pages.push(pageFile);
            }
        }
        for (const page of pages) {
            const inserted = registry.insertIndexEntry(page, post, config);
            if (!inserted.ok) {
                warnings.push(`更新列表页失败：${path.basename(page)}（${inserted.reason}）`);
            } else {
                result.indexPages.push({ page: path.basename(page), action: inserted.action });
                if (inserted.action !== 'unchanged') {
                    result.files.push(path.relative(config._repoRoot, page).replace(/\\/g, '/'));
                }
            }
        }
    }

    registry.writeDb(config, db);
    return result;
}

/** 体检：data.json / 文章文件 / 上下篇 / 列表页 是否一致。 */
function audit(config) {
    const loaded = registry.loadArticles(config);
    const db = registry.readDb(config);
    const dbNames = new Set(db.map((post) => post.filename));
    const issues = [];

    for (const filename of loaded.missingFiles) {
        issues.push({
            level: 'error',
            code: 'missing-file',
            message: `data.json / 文章列表引用了 ${filename}，但文件不存在`,
            filename: filename
        });
    }

    for (const filename of loaded.unlisted) {
        issues.push({
            level: 'warn',
            code: 'unlisted',
            message: `blog/${filename} 既不在 ${config.indexPage} 也不在 data.json 中（不会出现在站点列表里）`,
            filename: filename
        });
    }

    for (const article of loaded.articles) {
        if (!dbNames.has(article.filename)) {
            issues.push({
                level: 'warn',
                code: 'unregistered',
                message: `${article.filename} 还没有登记到 data.json（上下篇仍会随发布更新）`,
                filename: article.filename
            });
        }
        const status = registry.navStatusInFile(
            path.join(config._postsDir, article.filename),
            registry.computeNav(loaded.articles, article.filename),
            true
        );
        if (status === 'no-nav-block') {
            issues.push({
                level: 'error',
                code: 'no-nav-block',
                message: `${article.filename} 中找不到“上一篇 / 同分类上一篇”区块`,
                filename: article.filename
            });
        } else if (status === 'updated') {
            issues.push({
                level: 'warn',
                code: 'nav-outdated',
                message: `${article.filename} 的上下篇链接与文章列表不一致（可运行 npm run fix）`,
                filename: article.filename
            });
        }
    }

    const indexed = new Set(loaded.indexed);
    for (const post of db) {
        if (fs.existsSync(path.join(config._postsDir, post.filename)) && !indexed.has(post.filename)) {
            issues.push({
                level: 'warn',
                code: 'not-in-index',
                message: `${post.filename} 不在 ${config.indexPage} 的文章列表里`,
                filename: post.filename
            });
        }
    }

    return {
        dbCount: db.length,
        fileCount: util.listFiles(config._postsDir, (name) => /\.html?$/i.test(name)).length,
        articleCount: loaded.articles.length,
        issues: issues
    };
}

module.exports = { publish, audit, normalizePost, describe, serializeNav, lintHtml, UserError };
