#!/usr/bin/env node
'use strict';

/**
 * 命令行入口：
 *   node cli.js build <草稿.md|文章.json> [--dry-run] [--no-index] [--overwrite] [--update]
 *   node cli.js check
 *   node cli.js fix [--dry-run]
 *   node cli.js new "标题" [--category=游戏]
 *   node cli.js serve [--port=3000]
 */

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('./lib/config');
const publishLib = require('./lib/publish');
const registry = require('./lib/registry');
const frontmatter = require('./lib/frontmatter');
const util = require('./lib/util');

const config = loadConfig(__dirname);
const argv = process.argv.slice(2);
const command = argv[0] || 'help';
const flags = new Set(argv.filter((arg) => arg.startsWith('--')));
const args = argv.slice(1).filter((arg) => !arg.startsWith('--'));

function flagValue(name) {
    const prefix = `--${name}=`;
    const found = argv.find((arg) => arg.indexOf(prefix) === 0);
    return found ? found.slice(prefix.length) : null;
}

function printResult(result) {
    console.log(`✓ ${result.filename}  （${result.mode === 'update' ? '更新' : '新建'}）`);
    (result.files || []).forEach((file) => console.log(`  文件     ${file}`));
    (result.indexPages || []).forEach(function (page) {
        const action = page.action === 'inserted' ? '新增' : page.action === 'updated' ? '更新' : '未变化';
        console.log(`  列表页   ${page.page}（${action}）`);
    });
    if (result.navUpdated && result.navUpdated.length) {
        console.log(`  上下篇   ${result.navUpdated.join('、')}`);
    }
    (result.warnings || []).forEach((warning) => console.log(`  ⚠ ${warning}`));
}

function readPostFile(file) {
    if (!fs.existsSync(file)) throw new Error(`找不到文件：${file}`);
    const text = fs.readFileSync(file, 'utf8');

    if (/\.json$/i.test(file)) {
        const data = JSON.parse(text);
        return Object.assign({}, data);
    }

    const parsed = frontmatter.parse(text);
    const data = parsed.data || {};
    const post = {
        title: data.title || path.basename(file, path.extname(file)),
        date: data.date,
        updated: data.updated,
        category: data.category,
        author: data.author,
        keywords: data.keywords,
        filename: data.filename,
        format: data.format === 'html' ? 'html' : 'markdown',
        paragraphMode: data.paragraphMode,
        content: parsed.body.replace(/^\n+/, '').replace(/\s+$/, '')
    };
    return post;
}

function commandBuild() {
    const file = args[0];
    if (!file) {
        console.error('用法：node cli.js build <草稿.md|文章.json> [--dry-run] [--no-index] [--overwrite] [--update]');
        process.exitCode = 1;
        return;
    }

    const post = readPostFile(path.resolve(file));
    const result = publishLib.publish(post, config, {
        mode: flags.has('--update') ? 'update' : 'create',
        originalFilename: post.filename,
        overwrite: flags.has('--overwrite'),
        updateIndex: !flags.has('--no-index'),
        dryRun: flags.has('--dry-run')
    });

    if (flags.has('--json')) {
        delete result.articleHtml;
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (result.dryRun) {
        console.log(`（预览，不写文件）将生成 ${result.filename}`);
        console.log(`  上一篇：${result.meta.nav.prev ? result.meta.nav.prev.title : '没有了'}`);
        console.log(`  下一篇：${result.meta.nav.next ? result.meta.nav.next.title : '没有了'}`);
        (result.warnings || []).forEach((warning) => console.log(`  ⚠ ${warning}`));
        console.log('\n--- 生成的 HTML ---\n');
        console.log(result.articleHtml);
        return;
    }

    printResult(result);
}

function commandCheck() {
    const report = publishLib.audit(config);
    console.log(`data.json：${report.dbCount} 篇已登记 · blog/ 中有 ${report.fileCount} 个文件`);

    if (!report.issues.length) {
        console.log('✓ 一切正常');
        return;
    }

    for (const issue of report.issues) {
        const mark = issue.level === 'error' ? '✗' : '⚠';
        console.log(`${mark} [${issue.code}] ${issue.message}`);
    }
    console.log(`\n共 ${report.issues.length} 条。可用 node cli.js fix 修复上下篇链接。`);
    if (report.issues.some((issue) => issue.level === 'error')) process.exitCode = 1;
}

function commandFix() {
    const loaded = registry.loadArticles(config);
    const articles = loaded.articles;
    const dryRun = flags.has('--dry-run');

    // 1) 把 blog.html 里有、data.json 里没有的文章补登记
    const db = registry.readDb(config);
    const registered = new Set(db.map((post) => post.filename));
    const missingFromDb = articles.filter((article) => !registered.has(article.filename));
    if (!dryRun) {
        for (const article of missingFromDb) {
            registry.upsertPost(db, {
                filename: article.filename,
                title: article.title,
                date: article.date,
                category: article.category
            });
        }
        if (missingFromDb.length) registry.writeDb(config, db);
    }

    // 2) 重新计算上下篇（只有链接真的不一致时才改写）
    const results = registry.syncAllNav(articles, config, { dryRun: dryRun, semantic: true });
    const updated = results.filter((item) => item.status === 'updated');
    const missing = results.filter((item) => item.status === 'missing');
    const blocked = results.filter((item) => item.status === 'no-nav-block');

    if (missingFromDb.length) {
        console.log(`${dryRun ? '将补登记' : '已补登记'} ${missingFromDb.length} 篇文章到 data.json：`);
        missingFromDb.forEach((article) => console.log(`  + ${article.filename}`));
    }
    console.log(`${dryRun ? '（预览）' : ''}共检查 ${results.length} 篇，${updated.length} 篇上下篇需要修正`);
    updated.forEach((item) => console.log(`  ${dryRun ? '将修正' : '已修正'} ${item.filename}`));
    missing.forEach((item) => console.log(`  ⚠ 文件不存在：${item.filename}`));
    blocked.forEach((item) => console.log(`  ⚠ 找不到导航区块：${item.filename}`));
}

function commandNew() {
    const title = args[0];
    if (!title) {
        console.error('用法：node cli.js new "标题" [--category=游戏] [--date=2026-11-06]');
        process.exitCode = 1;
        return;
    }
    const date = util.normalizeDate(flagValue('date')) || util.todayISO();
    const category = flagValue('category') || config.defaultCategory;
    const safeTitle = title.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40) || 'draft';
    const name = `${date}-${safeTitle}.md`;
    const file = path.join(config._draftDir, name);
    if (fs.existsSync(file)) {
        console.error(`草稿已存在：${path.relative(config._repoRoot, file)}`);
        process.exitCode = 1;
        return;
    }
    util.writeFileAtomic(file, frontmatter.stringify({
        title: title,
        date: date,
        category: category,
        author: config.author,
        filename: `${date}.html`,
        format: config.markdown.format || 'markdown'
    }, '## 小节标题\n\n在这里写正文。\n'));
    console.log(`✓ 已创建草稿 ${path.relative(config._repoRoot, file)}`);
    console.log(`  编辑后运行：node cli.js build "${path.relative(process.cwd(), file)}" --dry-run`);
}

function commandServe() {
    const port = flagValue('port');
    if (port) process.argv.push(`--port=${port}`);
    require('./server.js');
}

function printHelp() {
    console.log(`
博客生成器 · 命令行

  node cli.js build <草稿.md|文章.json> [选项]
      渲染并发布一篇文章。草稿用 --- front matter --- 写元信息。
      选项：--dry-run（只预览不写文件）
            --no-index（不更新 blog.html 与分类页）
            --overwrite（同名文件直接覆盖）
            --update（覆盖 data.json 中同名记录）
            --json（输出 JSON 结果）

  node cli.js check
      体检：data.json、文章文件、上下篇、列表页是否一致。

  node cli.js fix [--dry-run]
      按 data.json 重新计算所有文章的上一篇 / 下一篇。

  node cli.js new "标题" [--category=游戏] [--date=2026-11-06]
      在 blog_draft/ 里创建一份带 front matter 的草稿。

  node cli.js serve [--port=3000]
      启动网页编辑器（等同 npm start）。
`);
}

switch (command) {
    case 'build':
        commandBuild();
        break;
    case 'check':
        commandCheck();
        break;
    case 'fix':
        commandFix();
        break;
    case 'new':
        commandNew();
        break;
    case 'serve':
        commandServe();
        break;
    case 'help':
    case '--help':
    case '-h':
        printHelp();
        break;
    default:
        console.error(`未知命令：${command}`);
        printHelp();
        process.exitCode = 1;
}
