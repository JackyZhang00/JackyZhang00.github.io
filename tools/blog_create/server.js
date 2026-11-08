'use strict';

/**
 * 小七の杂谈 · 博客生成器
 *
 * 启动：npm start （或 node server.js --port=3000）
 * 打开：http://127.0.0.1:3000
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const { loadConfig, categoryPage } = require('./lib/config');
const util = require('./lib/util');
const template = require('./lib/template');
const registry = require('./lib/registry');
const frontmatter = require('./lib/frontmatter');
const publishLib = require('./lib/publish');

const TOOL_DIR = __dirname;
const config = loadConfig(TOOL_DIR);
const REPO_ROOT = config._repoRoot;

const argvPort = (process.argv.find((arg) => arg.indexOf('--port=') === 0) || '').split('=')[1];
const argvHost = (process.argv.find((arg) => arg.indexOf('--host=') === 0) || '').split('=')[1];
const PORT = Number(argvPort || process.env.PORT || (config.server && config.server.port) || 3000);
const HOST = argvHost || (config.server && config.server.host) || '127.0.0.1';

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));

/* ------------------------------------------------------------------ *
 * 静态资源
 * ------------------------------------------------------------------ */

app.use(express.static(path.join(TOOL_DIR, 'public'), { index: 'index.html' }));

// 预览需要用到站点自己的样式与脚本
const ASSETS = new Set([
    'blog_article.css',
    'blog_index_style.css',
    'background.png',
    'background_mobile.png',
    'mobile_script.js',
    'styles.css'
]);

app.get('/site/:asset', function (req, res) {
    if (!ASSETS.has(req.params.asset)) return res.status(404).end();
    res.sendFile(path.join(REPO_ROOT, req.params.asset));
});

// 预览 / 查看生成的文章（只读，且限制在 blog 目录内）
app.get('/site/blog/:name', function (req, res) {
    const name = util.safeHtmlFilename(req.params.name);
    if (!name) return res.status(404).end();
    const file = path.join(config._postsDir, name);
    if (!fs.existsSync(file)) return res.status(404).send('文章不存在');
    res.sendFile(file);
});

// 上传目录（图片）在预览里同样要能显示：/site/blog_fig/2026-11-08/xxx.png
const UPLOAD_DIR = path.resolve(REPO_ROOT, config.uploadsDir || 'blog_fig');
const UPLOAD_ROUTE = '/site/' + String(config.uploadsDir || 'blog_fig').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

app.use(UPLOAD_ROUTE, express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny' }));

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

function slugify(text) {
    return String(text || '')
        .replace(/<[^>]*>/g, '')
        .replace(/[\\/:*?"<>|\s]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'draft';
}

function draftNameFor(post) {
    return `${post.date}-${slugify(post.title)}.md`;
}

function safeDraftName(name) {
    const base = path.basename(String(name || '').trim())
        .replace(/[\\/:*?"<>|]/g, '-')
        .replace(/^\.+/, '');
    if (!base || base === '.md') return '';
    return /\.md$/i.test(base) ? base : base + '.md';
}

function listDrafts() {
    const dir = config._draftDir;
    if (!fs.existsSync(dir)) return [];
    return util.listFiles(dir, (name) => /\.md$/i.test(name))
        .map(function (name) {
            const file = path.join(dir, name);
            const stat = fs.statSync(file);
            const parsed = frontmatter.parse(fs.readFileSync(file, 'utf8'));
            return {
                name: name,
                title: parsed.data.title || name.replace(/\.md$/i, ''),
                date: parsed.data.date || '',
                category: parsed.data.category || '',
                size: stat.size,
                updated: stat.mtime.toISOString()
            };
        })
        .sort(function (a, b) { return b.updated.localeCompare(a.updated); });
}

function loadDraft(name) {
    const safe = path.basename(String(name || ''));
    const file = path.join(config._draftDir, safe);
    if (!safe || !util.ensureInside(config._draftDir, file) || !fs.existsSync(file)) {
        throw new publishLib.UserError('草稿不存在', 404);
    }
    const parsed = frontmatter.parse(fs.readFileSync(file, 'utf8'));
    return {
        name: safe,
        post: {
            title: parsed.data.title || '',
            date: parsed.data.date || '',
            updated: parsed.data.updated || '',
            category: parsed.data.category || config.defaultCategory,
            author: parsed.data.author || config.author,
            keywords: parsed.data.keywords || '',
            filename: parsed.data.filename || '',
            format: parsed.data.format === 'html' ? 'html' : 'markdown',
            paragraphMode: parsed.data.paragraphMode || config.markdown.paragraphMode,
            content: parsed.body.replace(/^\n+/, '').replace(/\s+$/, '')
        }
    };
}

function publicConfig() {
    const loaded = registry.loadArticles(config);
    const dbNames = new Set(registry.readDb(config).map((post) => post.filename));

    // 分类目录 = config.json 里配置过的 + blog.html 里实际出现过的（避免漏掉新分类）
    const counts = new Map();
    for (const article of loaded.articles) {
        const names = article.categories && article.categories.length
            ? article.categories
            : util.splitCategories(article.category);
        for (const name of names) {
            counts.set(name, (counts.get(name) || 0) + 1);
        }
    }
    const categoryNames = Object.keys(config.categories);
    for (const name of counts.keys()) {
        if (categoryNames.indexOf(name) === -1) categoryNames.push(name);
    }

    return {
        site: config.site,
        author: config.author,
        defaultCategory: config.defaultCategory,
        categories: categoryNames.map(function (name) {
            const entry = config.categories[name];
            return {
                name: name,
                page: entry ? entry.page : null,
                mapped: !!entry,
                count: counts.get(name) || 0
            };
        }),
        indexPage: config.indexPage,
        markdown: config.markdown,
        indexUpdate: config.indexUpdate,
        giscusEnabled: !!(config.giscus && config.giscus.enabled),
        postsDir: path.relative(REPO_ROOT, config._postsDir).replace(/\\/g, '/'),
        posts: registry.sortDesc(loaded.articles).map(function (post) {
            return {
                filename: post.filename,
                title: post.title,
                date: util.normalizeDate(post.date) || post.date,
                category: post.category,
                exists: true,
                registered: dbNames.has(post.filename)
            };
        }),
        drafts: listDrafts()
    };
}

/* ------------------------------------------------------------------ *
 * API
 * ------------------------------------------------------------------ */

app.get('/api/config', function (req, res) {
    res.json(publicConfig());
});

app.get('/api/health', function (req, res) {
    const audit = publishLib.audit(config);
    res.json({ ok: true, dbCount: audit.dbCount, fileCount: audit.fileCount, issues: audit.issues.length });
});

// 预览（不写文件）
app.post('/api/preview', function (req, res) {
    const body = req.body || {};
    const normalized = publishLib.normalizePost(body, config);
    const post = normalized.post;
    const articles = registry.loadArticles(config).articles;
    registry.upsertArticle(articles, post, config);
    const nav = registry.computeNav(articles, post.filename);
    const html = template.buildArticle(post, { config: config, nav: nav, forPreview: true });
    const bodyHtml = template.renderBody(post.content, {
        format: post.format,
        paragraphMode: post.paragraphMode,
        mergeImages: config.markdown.mergeImages,
        autoLink: config.markdown.autoLink,
        headingShift: config.markdown.headingShift
    });

    res.json({
        html: html,
        bodyHtml: bodyHtml,
        warnings: normalized.warnings.concat(publishLib.lintHtml(bodyHtml, config)),
        // 只有“新建”时同名文件才会自动改名；更新模式覆盖原文件是正常的
        conflict: body.mode !== 'update' && fs.existsSync(path.join(config._postsDir, post.filename)),
        meta: publishLib.describe(post, nav, bodyHtml, config)
    });
});

// 完整文章 HTML（用于下载 / 复制）
app.post('/api/render', function (req, res) {
    const result = publishLib.publish(req.body, config, {
        mode: req.body && req.body.mode,
        originalFilename: req.body && req.body.originalFilename,
        overwrite: true,
        updateIndex: false,
        syncNav: false,
        dryRun: true
    });
    res.json({
        html: result.articleHtml,
        filename: result.filename,
        warnings: result.warnings,
        meta: result.meta
    });
});

// 发布
app.post('/api/save', function (req, res) {
    const body = req.body || {};
    const result = publishLib.publish(body, config, {
        mode: body.mode,
        originalFilename: body.originalFilename,
        overwrite: !!body.overwrite,
        updateIndex: body.updateIndex !== false,
        syncNav: body.syncNav !== false,
        dryRun: !!body.dryRun
    });
    if (result.articleHtml) delete result.articleHtml;
    res.json(result);
});

// 读取已有文章
app.post('/api/load', function (req, res) {
    const name = util.safeHtmlFilename((req.body || {}).filename);
    if (!name) throw new publishLib.UserError('文件名不合法');
    const file = path.join(config._postsDir, name);
    if (!fs.existsSync(file)) throw new publishLib.UserError('文章不存在', 404);

    const html = fs.readFileSync(file, 'utf8');
    const parsed = template.parseArticle(html);
    const entry = registry.loadArticles(config).articles.find((item) => item.filename === name) || null;
    const registered = registry.readDb(config).some((item) => item.filename === name);
    const looksLikeHtml = /<\/?(?:p|div|ul|ol|h[1-6]|pre|table|img|figure|blockquote|span|strong|em|br|a)\b/i.test(parsed.content);

    res.json({
        filename: name,
        post: {
            title: parsed.title || (entry && entry.title) || '',
            date: parsed.date || (entry && entry.date) || '',
            updated: parsed.updated || '',
            author: parsed.author || '',
            category: parsed.category || (entry && entry.category) || config.defaultCategory,
            keywords: parsed.keywords || (entry && entry.keywords) || '',
            filename: name,
            format: looksLikeHtml ? 'html' : 'markdown',
            paragraphMode: config.markdown.paragraphMode,
            content: parsed.content
        },
        registered: registered
    });
});

// 图片上传（粘贴 / 拖拽 / 选文件）
const IMAGE_TYPES = [
    { ext: 'png', test: (buffer) => buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 },
    { ext: 'jpg', test: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
    { ext: 'gif', test: (buffer) => buffer.length > 4 && buffer.slice(0, 4).toString('ascii') === 'GIF8' },
    { ext: 'webp', test: (buffer) => buffer.length > 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP' }
];

app.post('/api/upload', function (req, res) {
    const body = req.body || {};
    const data = String(body.data || '');
    const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(data);
    if (!match) throw new publishLib.UserError('图片数据格式不对（需要 base64 data URL）');

    const buffer = Buffer.from(match[1], 'base64');
    if (!buffer.length) throw new publishLib.UserError('图片是空的');

    const limitMB = config.maxUploadMB || 8;
    if (buffer.length > limitMB * 1024 * 1024) {
        throw new publishLib.UserError(`图片太大（上限 ${limitMB} MB）`);
    }

    const type = IMAGE_TYPES.find((item) => item.test(buffer));
    if (!type) throw new publishLib.UserError('只支持 PNG / JPG / GIF / WebP');

    const day = util.todayISO();
    const dir = path.join(UPLOAD_DIR, day);
    const originalName = String(body.name || 'image');
    const base = slugify(path.basename(originalName, path.extname(originalName))) || 'image';

    let filename = `${base}.${type.ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(dir, filename))) {
        filename = `${base}-${counter++}.${type.ext}`;
    }

    util.writeFileAtomic(path.join(dir, filename), buffer);
    const relative = `${config.uploadsDir || 'blog_fig'}/${day}/${filename}`.replace(/\\/g, '/');

    res.json({
        success: true,
        path: `../${relative}`,
        previewUrl: `${UPLOAD_ROUTE}/${day}/${filename}`,
        bytes: buffer.length
    });
});

// 草稿
app.get('/api/drafts', function (req, res) {
    res.json({ drafts: listDrafts() });
});

app.post('/api/drafts', function (req, res) {
    const normalized = publishLib.normalizePost((req.body || {}).post || req.body, config);
    const post = normalized.post;
    if (!post.title && !post.content.trim()) throw new publishLib.UserError('空草稿不保存');
    const name = String((req.body || {}).name || '').trim() || draftNameFor(post);
    const safe = safeDraftName(name) || draftNameFor(post);
    const file = path.join(config._draftDir, safe);
    if (!util.ensureInside(config._draftDir, file)) throw new publishLib.UserError('草稿名不合法');

    const text = frontmatter.stringify({
        title: post.title,
        date: post.date,
        updated: post.updated,
        category: post.category,
        author: post.author,
        keywords: post.keywords,
        filename: post.filename,
        format: post.format,
        paragraphMode: post.paragraphMode
    }, post.content);
    util.writeFileAtomic(file, text);
    res.json({ success: true, name: path.basename(file) });
});

app.post('/api/drafts/load', function (req, res) {
    res.json(loadDraft((req.body || {}).name));
});

app.delete('/api/drafts/:name', function (req, res) {
    const safe = safeDraftName(req.params.name);
    const file = path.join(config._draftDir, safe);
    if (!safe || !util.ensureInside(config._draftDir, file) || !fs.existsSync(file)) {
        throw new publishLib.UserError('草稿不存在', 404);
    }
    fs.unlinkSync(file);
    res.json({ success: true });
});

// 修复：按文章列表重算所有上下篇
app.post('/api/repair-nav', function (req, res) {
    const articles = registry.loadArticles(config).articles;
    const results = registry.syncAllNav(articles, config, {
        dryRun: !!(req.body || {}).dryRun,
        semantic: true
    });
    res.json({
        success: true,
        updated: results.filter((item) => item.status === 'updated').map((item) => item.filename),
        missing: results.filter((item) => item.status === 'missing').map((item) => item.filename),
        skipped: results.filter((item) => item.status === 'no-nav-block').map((item) => item.filename)
    });
});

/* ------------------------------------------------------------------ *
 * 错误处理 & 启动
 * ------------------------------------------------------------------ */

app.use(function (req, res) {
    if (req.path.indexOf('/api/') === 0) return res.status(404).json({ error: '接口不存在' });
    res.status(404).send('Not found');
});

app.use(function (err, req, res, next) { // eslint-disable-line no-unused-vars
    const status = err.status || (err instanceof publishLib.UserError ? 400 : 500);
    if (status >= 500) console.error(err);
    res.status(status).json({ error: err.message || '服务器内部错误' });
});

function printBanner(port) {
    const audit = publishLib.audit(config);
    console.log('');
    console.log('  小七の杂谈 · 博客生成器');
    console.log(`  ${config.site.name} · ${config.postsDir}/ · ${audit.articleCount} 篇文章（data.json 登记 ${audit.dbCount} 条）`);
    if (audit.issues.length) {
        console.log(`  体检发现 ${audit.issues.length} 个问题，可运行 npm run check 查看详情`);
    }
    console.log(`  → http://${HOST}:${port}`);
    console.log('');
}

function start(port, remainingAttempts) {
    const server = app.listen(port, HOST, function () {
        printBanner(port);
    });
    server.on('error', function (err) {
        if (err.code === 'EADDRINUSE' && remainingAttempts > 0) {
            console.log(`  端口 ${port} 已被占用，尝试 ${port + 1} ...`);
            start(port + 1, remainingAttempts - 1);
        } else {
            console.error(err);
            process.exitCode = 1;
        }
    });
}

start(PORT, 10);
