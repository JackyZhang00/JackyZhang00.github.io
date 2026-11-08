'use strict';

/**
 * 配置加载：config.json 覆盖默认值。
 * 所有路径都相对仓库根目录（本工具位于 <repo>/tools/blog_create）。
 */

const path = require('path');
const { deepMerge, readJson } = require('./util');

const DEFAULTS = {
    site: {
        name: '小七の杂谈',
        titlePrefix: '小七の杂谈：',
        lang: 'zh-CN',
        homeLink: '../index.html',
        indexLink: '../blog.html'
    },
    author: 'Jiaqi Z.',
    defaultCategory: '杂谈',
    postsDir: 'blog',
    indexPage: 'blog.html',
    uploadsDir: 'blog_fig',
    maxUploadMB: 8,
    categories: {},
    giscus: {
        enabled: true,
        repo: 'JackyZhang00/JackyZhang00.github.io',
        repoId: 'R_kgDOM3h1Dw',
        categoryId: 'DIC_kwDOM3h1D84C4F8t',
        mapping: 'pathname',
        strict: '0',
        reactionsEnabled: '1',
        emitMetadata: '0',
        inputPosition: 'bottom',
        theme: 'preferred_color_scheme',
        lang: 'zh-CN'
    },
    indexUpdate: {
        enabled: true,
        pinnedKeyword: '置顶'
    },
    markdown: {
        format: 'markdown',
        paragraphMode: 'auto',
        mergeImages: true,
        autoLink: true,
        headingShift: 1
    },
    server: {
        port: 3000,
        host: '127.0.0.1',
        open: false
    }
};

function loadConfig(toolDir) {
    const repoRoot = path.resolve(toolDir, '..', '..');
    const userConfig = readJson(path.join(toolDir, 'config.json'), {});
    const config = deepMerge(DEFAULTS, userConfig);

    config._toolDir = toolDir;
    config._repoRoot = repoRoot;
    config._postsDir = path.resolve(repoRoot, config.postsDir);
    config._indexPage = path.resolve(repoRoot, config.indexPage);
    config._draftDir = path.resolve(repoRoot, 'blog_draft');
    config._dataFile = path.join(toolDir, 'data.json');
    return config;
}

/** 分类 → 分类页文件名；未配置时回退到总索引页。支持 “音乐/BanG Dream!” 这种多分类写法。 */
function categoryPage(config, category) {
    const first = String(category || '').split(/[\/、,，]/)[0].trim();
    const entry = config.categories && config.categories[first];
    if (entry && entry.page) return entry.page;
    return config.indexPage;
}

function categoryNames(config) {
    return Object.keys(config.categories || {});
}

module.exports = { DEFAULTS, loadConfig, categoryPage, categoryNames };
