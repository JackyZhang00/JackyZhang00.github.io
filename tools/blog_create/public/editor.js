'use strict';

/* ================================================================== *
 * 博客生成器 · 前端
 * ================================================================== */

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const byId = (id) => document.getElementById(id);

const LOCAL_DRAFT_KEY = 'blog_create_draft_v2';

const state = {
    config: null,
    mode: 'create',
    originalFilename: '',
    filenameTouched: false,
    device: 'desktop',
    dirty: false,
    previewSeq: 0,
    previewTimer: null,
    autosaveTimer: null,
    lastHtml: '',
    busy: false,
    pendingDraft: null,
    openPosts: [],
    categories: [],
    categoryCatalog: [],
    textStyle: { size: '', font: '', color: '', background: '' }
};

/* ------------------------------------------------------------------ *
 * 基础工具
 * ------------------------------------------------------------------ */

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

function truncate(text, length) {
    const value = String(text || '');
    return value.length > length ? value.slice(0, length) + '…' : value;
}

function plainText(value) {
    return String(value == null ? '' : value)
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
}

function pad2(number) {
    return String(number).padStart(2, '0');
}

function todayLocal() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

async function api(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    if (opts.body !== undefined) {
        opts.method = opts.method || 'POST';
        opts.headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(opts.body);
    }
    const response = await fetch(path, opts);
    let data = null;
    try {
        data = await response.json();
    } catch (err) {
        data = null;
    }
    if (!response.ok) {
        throw new Error((data && data.error) || `请求失败（${response.status}）`);
    }
    return data;
}

function log(message) {
    const area = byId('log');
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    area.textContent += `[${time}] ${message}\n`;
    area.scrollTop = area.scrollHeight;
}

let toastTimer = null;
function toast(message) {
    const node = byId('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

function setStatus(status) {
    const dot = byId('serverStatus');
    dot.className = 'status-dot ' + status;
    dot.title = status === 'online' ? '已连接服务器' : '未连接服务器';
}

function setBusy(busy) {
    const button = byId('btnPublish');
    button.disabled = busy;
    if (busy) {
        button.innerHTML = '发布中…';
        document.body.style.cursor = 'progress';
        return;
    }
    document.body.style.cursor = '';
    updateModeHint();
}

function updateModeHint() {
    const button = byId('btnPublish');
    if (state.mode === 'update') {
        button.innerHTML = '更新文章 <kbd>Ctrl+↵</kbd>';
        button.title = `覆盖 ${state.originalFilename || '当前文章'}（Ctrl+Enter）`;
    } else {
        button.innerHTML = '发布到站点 <kbd>Ctrl+↵</kbd>';
        button.title = '写入 blog/ 并更新列表与上下篇（Ctrl+Enter）';
    }
}

/* ------------------------------------------------------------------ *
 * 初始化
 * ------------------------------------------------------------------ */

document.addEventListener('DOMContentLoaded', init);

async function init() {
    buildToolbar();
    buildFormatGroups();
    buildStyleControls();
    bindStaticEvents();
    bindTextareaEvents();
    bindKeyboard();

    byId('fDate').value = todayLocal();
    byId('fFilename').value = todayLocal() + '.html';

    try {
        state.config = await api('/api/config');
    } catch (err) {
        setStatus('offline');
        log('✗ 无法连接服务器：' + err.message);
        toast('无法连接服务器，请确认在 blog_create 目录运行了 node server.js');
        return;
    }

    setStatus('online');
    applyConfig(state.config, true);
    log(`已连接服务器 · ${state.config.site.name}`);
    log(`已登记 ${state.config.posts.length} 篇文章 · ${state.config.drafts.length} 份草稿 · 文章目录 ${state.config.postsDir}/`);

    checkLocalDraft();
    updateStats();
    schedulePreview(0);
}

function applyConfig(config, isInitial) {
    byId('siteName').textContent = config.site.name;

    state.categoryCatalog = config.categories || [];
    if (!state.categories.length) {
        const fallback = config.defaultCategory
            || (state.categoryCatalog[0] && state.categoryCatalog[0].name)
            || '杂谈';
        state.categories = [fallback];
    }
    renderCategoryChips();

    if (!byId('fAuthor').value) byId('fAuthor').value = config.author || '';

    // 只在首次加载时套用默认值，避免每次发布后覆盖用户当前选择
    if (isInitial) {
        byId('fFormat').value = (config.markdown && config.markdown.format) === 'html' ? 'html' : 'markdown';
        byId('fParagraph').value = (config.markdown && config.markdown.paragraphMode) || 'auto';
        byId('fUpdateIndex').checked = !!(config.indexUpdate && config.indexUpdate.enabled);
    }
}

/* ------------------------------------------------------------------ *
 * 分类多选
 * ------------------------------------------------------------------ */

function splitCategoryText(text) {
    return String(text || '')
        .split(/[\/、,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
        .filter((item, index, list) => list.indexOf(item) === index);
}

function renderCategoryChips() {
    const box = byId('categoryChips');
    if (!box) return;

    const catalog = state.categoryCatalog || [];
    const known = new Set(catalog.map((item) => item.name));
    const selected = new Set(state.categories);
    const items = catalog.slice();

    // 已选但不认识的分类（例如手写的新分类）也要显示成芯片
    state.categories.forEach(function (name) {
        if (!known.has(name)) items.push({ name: name, count: 0, mapped: false });
    });

    if (!items.length) {
        box.innerHTML = '<span class="hint">正在读取分类…</span>';
        return;
    }

    box.innerHTML = items.map(function (item) {
        const classes = ['chip'];
        if (selected.has(item.name)) classes.push('on');
        if (item.mapped === false) classes.push('unmapped');
        const title = item.mapped === false
            ? `${item.name}：没有配置分类页，只会写入 blog.html 总列表`
            : `${item.name} → ${item.page}（${item.count} 篇）`;
        const count = item.count ? `<span class="count">${item.count}</span>` : '';
        return `<button type="button" class="${classes.join(' ')}" data-cat="${escapeAttr(item.name)}" title="${escapeAttr(title)}">${escapeHtml(item.name)}${count}</button>`;
    }).join('');
}

function toggleCategory(name) {
    const index = state.categories.indexOf(name);
    if (index === -1) {
        state.categories.push(name);
    } else {
        if (state.categories.length <= 1) {
            toast('至少要保留一个分类');
            return;
        }
        state.categories.splice(index, 1);
    }
    renderCategoryChips();
    onMetadataEdit();
}

function addCustomCategory() {
    const input = byId('fCategoryCustom');
    const names = splitCategoryText(input.value);
    if (!names.length) return;
    names.forEach(function (name) {
        if (state.categories.indexOf(name) === -1) state.categories.push(name);
    });
    input.value = '';
    renderCategoryChips();
    onMetadataEdit();
}

function selectedCategoryText() {
    const extra = splitCategoryText(byId('fCategoryCustom').value);
    const all = state.categories.slice();
    extra.forEach(function (name) {
        if (all.indexOf(name) === -1) all.push(name);
    });
    return all.join(' / ');
}

function setCategories(text) {
    state.categories = splitCategoryText(text);
    if (!state.categories.length && state.config) {
        state.categories = [state.config.defaultCategory || '杂谈'];
    }
    const input = byId('fCategoryCustom');
    if (input) input.value = '';
    renderCategoryChips();
}

/* ------------------------------------------------------------------ *
 * 字段
 * ------------------------------------------------------------------ */

function currentPost() {
    return {
        title: byId('fTitle').value.trim(),
        date: byId('fDate').value || todayLocal(),
        updated: byId('fUpdated').value || '',
        author: byId('fAuthor').value.trim(),
        category: selectedCategoryText(),
        keywords: byId('fKeywords').value.trim(),
        filename: byId('fFilename').value.trim(),
        content: byId('fContent').value,
        format: byId('fFormat').value,
        paragraphMode: byId('fParagraph').value
    };
}

function applyPost(post, options) {
    const opts = options || {};
    byId('fTitle').value = post.title || '';
    byId('fDate').value = post.date || todayLocal();
    byId('fUpdated').value = post.updated || '';
    byId('fAuthor').value = post.author || '';
    setCategories(post.category || '');
    byId('fKeywords').value = post.keywords || '';
    byId('fFilename').value = post.filename || `${post.date || todayLocal()}.html`;
    byId('fContent').value = post.content || '';
    byId('fFormat').value = post.format === 'html' ? 'html' : 'markdown';
    byId('fParagraph').value = post.paragraphMode || (state.config && state.config.markdown.paragraphMode) || 'auto';

    state.filenameTouched = true;
    state.mode = opts.mode || 'create';
    state.originalFilename = opts.originalFilename || '';
    state.lastHtml = '';
    state.dirty = false;

    updateModeHint();
    updateStats();
    schedulePreview(0);
}

function bindFieldEvents() {
    byId('fTitle').addEventListener('input', onMetadataEdit);
    byId('fDate').addEventListener('input', function () {
        if (!state.filenameTouched) {
            byId('fFilename').value = (byId('fDate').value || todayLocal()) + '.html';
        }
        onMetadataEdit();
    });
    byId('fFilename').addEventListener('input', function () {
        state.filenameTouched = true;
        onMetadataEdit();
    });
    byId('fCategoryCustom').addEventListener('keydown', function (event) {
        if (['Enter', ',', '，', '、', '/'].indexOf(event.key) !== -1) {
            event.preventDefault();
            addCustomCategory();
        }
    });
    byId('fCategoryCustom').addEventListener('blur', addCustomCategory);
    byId('fUpdated').addEventListener('input', onMetadataEdit);
    byId('fAuthor').addEventListener('input', onMetadataEdit);
    byId('fKeywords').addEventListener('input', onMetadataEdit);
    byId('fFormat').addEventListener('change', function () {
        log('正文格式切换为 ' + (formatIsHtml() ? '原始 HTML' : 'Markdown'));
        onContentEdit();
    });
    byId('fParagraph').addEventListener('change', onContentEdit);
    byId('fContent').addEventListener('input', onContentEdit);
    byId('fUpdateIndex').addEventListener('change', markDirty);
}

function onMetadataEdit() {
    markDirty();
    schedulePreview(450);
}

function onContentEdit() {
    markDirty();
    updateStats();
    schedulePreview(450);
}

function updateStats() {
    const text = byId('fContent').value || '';
    const plain = text.replace(/<[^>]*>/g, ' ');
    const words = (plain.match(/[\u4e00-\u9fa5]|[A-Za-z0-9_'-]+/g) || []).length;
    const images = (text.match(/!\[[^\]]*\]\(|<img\b/gi) || []).length;
    const minutes = Math.max(1, Math.round(words / 400));
    byId('statChars').textContent = `${words} 字`;
    byId('statImages').textContent = `${images} 图`;
    byId('statTime').textContent = `约 ${minutes} 分钟`;
}

/* ------------------------------------------------------------------ *
 * 工具栏
 * ------------------------------------------------------------------ */

const TOOL_GROUPS = [
    {
        label: '标题',
        items: [
            { label: 'H2', tip: '小节标题（Markdown：##）', run: () => heading(2) },
            { label: 'H3', tip: '子标题（Markdown：###）', run: () => heading(3) }
        ]
    },
    {
        label: '文字',
        items: [
            { label: 'B', cls: 'bold', tip: '加粗（Ctrl+B）', run: () => inlineStyle('bold') },
            { label: 'I', cls: 'italic', tip: '斜体（Ctrl+I）', run: () => inlineStyle('italic') },
            { label: 'S', cls: 'strike', tip: '删除线', run: () => inlineStyle('strike') },
            { label: '</>', cls: 'mono', tip: '行内代码', run: () => inlineStyle('code') },
            { label: '链接', tip: '插入链接（Ctrl+K）', run: insertLink }
        ]
    },
    {
        label: '块',
        items: [
            { label: '引用', tip: '引用块', run: insertQuote },
            { label: '• 列表', tip: '无序列表', run: () => insertList(false) },
            { label: '1. 列表', tip: '有序列表', run: () => insertList(true) },
            { label: '代码块', tip: '围栏代码块', run: insertCodeBlock },
            { label: '表格', tip: '插入表格', run: insertTable },
            { label: '分割线', tip: '插入分割线', run: insertHr }
        ]
    },
    {
        label: '样式',
        items: [
            { label: '字号', tip: '设置字号（含自定义 px）', run: () => openStyleDialog('size') },
            { label: '字体', tip: '设置字体', run: () => openStyleDialog('font') },
            { label: '颜色', tip: '文字颜色 / 背景色 / 对齐', run: () => openStyleDialog('color') }
        ]
    },
    {
        label: '插入',
        items: [
            { label: '图片', tip: '插入图片（地址、宽度、图注）', run: () => openImageDialog(false) },
            { label: '上传', tip: '上传本地图片，或直接把图片粘贴 / 拖进正文', run: () => byId('imageFile').click() },
            { label: '更多格式 ▾', tip: '下划线、高亮、提示框、折叠、两栏、视频…', run: openFormatDialog }
        ]
    }
];

function buildToolbar() {
    const bar = byId('toolbar');
    TOOL_GROUPS.forEach(function (group) {
        const wrap = document.createElement('div');
        wrap.className = 'tool-group';

        const label = document.createElement('span');
        label.className = 'tool-label';
        label.textContent = group.label;
        wrap.appendChild(label);

        group.items.forEach(function (item) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'tool-btn' + (item.cls ? ' ' + item.cls : '');
            button.textContent = item.label;
            button.title = item.tip || item.label;
            button.addEventListener('click', item.run);
            wrap.appendChild(button);
        });

        bar.appendChild(wrap);
    });
}

/* ------------------------------------------------------------------ *
 * 编辑操作
 * ------------------------------------------------------------------ */

function textarea() {
    return byId('fContent');
}

function formatIsHtml() {
    return byId('fFormat').value === 'html';
}

function getSelection() {
    const ta = textarea();
    return {
        start: ta.selectionStart,
        end: ta.selectionEnd,
        text: ta.value.slice(ta.selectionStart, ta.selectionEnd)
    };
}

function replaceRange(start, end, text) {
    const ta = textarea();
    ta.focus();
    ta.setRangeText(text, start, end, 'end');
    onContentEdit();
}

function wrap(before, after, placeholder) {
    const selection = getSelection();
    const inner = selection.text || placeholder || '';
    replaceRange(selection.start, selection.end, before + inner + after);
    if (!selection.text) {
        textarea().setSelectionRange(
            selection.start + before.length,
            selection.start + before.length + inner.length
        );
    }
}

function inlineStyle(kind) {
    const map = {
        bold: ['**', '**', '<strong>', '</strong>', '加粗文字'],
        italic: ['*', '*', '<em>', '</em>', '斜体文字'],
        strike: ['~~', '~~', '<del>', '</del>', '删除线'],
        code: ['`', '`', '<code>', '</code>', '代码']
    };
    const config = map[kind];
    if (!config) return;
    if (formatIsHtml()) wrap(config[2], config[3], config[4]);
    else wrap(config[0], config[1], config[4]);
}

function prefixLines(prefix) {
    const ta = textarea();
    const selection = getSelection();
    const value = ta.value;
    const lineStart = value.lastIndexOf('\n', selection.start - 1) + 1;
    let lineEnd = value.indexOf('\n', selection.end);
    if (lineEnd === -1) lineEnd = value.length;

    const lines = value.slice(lineStart, lineEnd).split('\n').map(function (line) {
        return line.indexOf(prefix) === 0 ? line : prefix + line;
    });
    const text = lines.join('\n');
    replaceRange(lineStart, lineEnd, text);
    ta.setSelectionRange(lineStart, lineStart + text.length);
}

function heading(level) {
    if (formatIsHtml()) {
        wrapHtmlTag('h' + Math.min(6, level + 1), '', level === 2 ? '小节标题' : '子标题');
    } else {
        prefixLines('#'.repeat(level) + ' ');
    }
}

function insertBlock(text, cursorOffset) {
    const ta = textarea();
    const selection = getSelection();
    const value = ta.value;
    const prefix = value.slice(0, selection.start);
    const suffix = value.slice(selection.end);
    const before = prefix && !prefix.endsWith('\n') ? '\n' : '';
    const after = suffix && !suffix.startsWith('\n') ? '\n' : '';
    const full = before + text + after;
    replaceRange(selection.start, selection.end, full);

    const base = selection.start + before.length;
    if (typeof cursorOffset === 'number') {
        const position = base + cursorOffset;
        ta.setSelectionRange(position, position);
    } else {
        ta.setSelectionRange(base, base + text.length);
    }
    return base;
}

function wrapHtmlTag(tag, attrs, placeholder) {
    const selection = getSelection();
    const inner = selection.text || placeholder || '';
    const open = `<${tag}${attrs || ''}>`;
    const close = `</${tag}>`;
    replaceRange(selection.start, selection.end, open + inner + close);
    if (!selection.text) {
        textarea().setSelectionRange(
            selection.start + open.length,
            selection.start + open.length + inner.length
        );
    }
}

function insertLink() {
    const selection = getSelection();
    const url = window.prompt('链接地址', 'https://');
    if (!url) return;
    const label = selection.text || url;
    if (formatIsHtml()) {
        replaceRange(selection.start, selection.end, `<a href="${escapeAttr(url)}">${label}</a>`);
    } else {
        replaceRange(selection.start, selection.end, `[${label}](${url})`);
    }
}

function insertQuote() {
    if (formatIsHtml()) wrapHtmlTag('blockquote', '', '引用内容');
    else prefixLines('> ');
}

function insertList(ordered) {
    if (!formatIsHtml()) {
        prefixLines(ordered ? '1. ' : '- ');
        return;
    }
    const selection = getSelection();
    const lines = (selection.text || '项目一\n项目二').split('\n');
    const tag = ordered ? 'ol' : 'ul';
    const items = lines.map((line) => `  <li>${line}</li>`).join('\n');
    replaceRange(selection.start, selection.end, `<${tag}>\n${items}\n</${tag}>`);
}

function insertCodeBlock() {
    const selection = getSelection();
    if (formatIsHtml()) {
        insertBlock(`<pre><code>${escapeHtml(selection.text || '在这里写代码')}</code></pre>`);
        return;
    }
    if (selection.text) {
        replaceRange(selection.start, selection.end, '```\n' + selection.text + '\n```');
    } else {
        const base = insertBlock('```\n\n```');
        textarea().setSelectionRange(base + 4, base + 4);
    }
}

function insertTable() {
    if (formatIsHtml()) {
        insertBlock([
            '<table>',
            '  <thead>',
            '    <tr><th>列 1</th><th>列 2</th></tr>',
            '  </thead>',
            '  <tbody>',
            '    <tr><td>内容</td><td>内容</td></tr>',
            '  </tbody>',
            '</table>'
        ].join('\n'));
    } else {
        insertBlock([
            '| 列 1 | 列 2 |',
            '| --- | --- |',
            '| 内容 | 内容 |'
        ].join('\n'));
    }
}

function insertHr() {
    insertBlock(formatIsHtml() ? '<hr>' : '---');
}

function openImageDialog(withCaption) {
    byId('imgAlt').value = getSelection().text || '';
    byId('imgCaption').value = '';
    openDialog(byId('dlgImage'));
    setTimeout(() => (withCaption ? byId('imgCaption') : byId('imgUrl')).focus(), 30);
}

function insertImageFromDialog() {
    const url = byId('imgUrl').value.trim();
    if (!url) {
        toast('请填写图片地址');
        return;
    }
    const alt = byId('imgAlt').value.trim() || '图片';
    const width = byId('imgWidth').value;
    const caption = byId('imgCaption').value.trim();
    const selection = getSelection();

    const imgAttrs = `src="${escapeAttr(url)}" alt="${escapeAttr(alt)}"${width ? ` width="${escapeAttr(width)}"` : ''}`;
    let markup;
    if (caption) {
        // 图注必须用 HTML：Markdown 图片语法放进 <figure> 不会被解析
        markup = `<figure>\n<img ${imgAttrs}/>\n<figcaption>${escapeHtml(caption)}</figcaption>\n</figure>`;
    } else if (formatIsHtml()) {
        markup = `<img ${imgAttrs}/>`;
    } else {
        markup = `![${alt}](${url})${width ? `{${width}}` : ''}`;
    }

    replaceRange(selection.start, selection.end, markup);
    closeDialog(byId('dlgImage'));
    byId('imgUrl').value = '';
    byId('imgAlt').value = '';
    byId('imgCaption').value = '';
}

/* ------------------------------------------------------------------ *
 * 更多格式
 * ------------------------------------------------------------------ */

const FORMAT_GROUPS = [
    {
        title: '行内样式',
        items: [
            { label: '下划线', run: () => wrapHtmlTag('u', '', '下划线文字') },
            { label: '高亮', run: () => wrapHtmlTag('mark', '', '高亮文字') },
            { label: '上标', run: () => wrapHtmlTag('sup', '', '上标') },
            { label: '下标', run: () => wrapHtmlTag('sub', '', '下标') },
            { label: '键盘键', run: () => wrapHtmlTag('kbd', '', 'Ctrl') },
            { label: '大字', run: () => wrapHtmlTag('span', ' style="font-size:1.25em"', '大字') },
            { label: '小字', run: () => wrapHtmlTag('span', ' style="font-size:.85em"', '小字') },
            { label: '红色强调', run: () => wrapHtmlTag('font', ' color="#CC0000"', '强调文字') }
        ]
    },
    {
        title: '段落块',
        items: [
            { label: '提示框', run: () => insertCallout('note') },
            { label: '警告框', run: () => insertCallout('warn') },
            { label: '折叠块', run: insertFolded },
            { label: '两栏布局', run: insertColumns },
            { label: '任务清单', run: insertTaskList }
        ]
    },
    {
        title: '图片',
        items: [
            { label: '图片 + 图注', run: () => openImageDialog(true) },
            { label: '双图并排', run: () => insertGallery(2) },
            { label: '三图并排', run: () => insertGallery(3) }
        ]
    },
    {
        title: '媒体',
        items: [
            { label: 'B 站视频', run: insertBilibiliVideo },
            { label: '音频', run: insertAudio }
        ]
    }
];

function buildFormatGroups() {
    const box = byId('formatGroups');
    box.innerHTML = FORMAT_GROUPS.map(function (group, groupIndex) {
        const items = group.items.map(function (item, itemIndex) {
            return `<button type="button" class="format-item" data-g="${groupIndex}" data-i="${itemIndex}">${escapeHtml(item.label)}</button>`;
        }).join('');
        return `<div class="format-group"><h4>${escapeHtml(group.title)}</h4><div class="format-grid">${items}</div></div>`;
    }).join('');

    box.onclick = function (event) {
        const button = event.target.closest('.format-item');
        if (!button) return;
        const group = FORMAT_GROUPS[Number(button.dataset.g)];
        const item = group && group.items[Number(button.dataset.i)];
        if (!item) return;
        closeDialog(byId('dlgFormats'));
        setTimeout(item.run, 0);
    };
}

function openFormatDialog() {
    openDialog(byId('dlgFormats'));
}

function insertCallout(kind) {
    const warn = kind === 'warn';
    const label = warn ? '注意：' : '提示：';
    const text = warn ? '这里写需要提醒的内容' : '这里写提示内容';
    insertBlock(`<div class="callout ${warn ? 'warn' : 'note'}">\n<p><strong>${label}</strong>${text}</p>\n</div>`);
}

function insertFolded() {
    insertBlock('<details>\n<summary>点开看更多</summary>\n<p>折叠起来的内容</p>\n</details>');
}

function insertColumns() {
    insertBlock([
        '<div class="columns">',
        '<div class="left">',
        '<p>左栏内容</p>',
        '</div>',
        '<div class="right">',
        '<p>右栏内容</p>',
        '</div>',
        '</div>'
    ].join('\n'));
}

function insertTaskList() {
    if (formatIsHtml()) {
        insertBlock([
            '<ul class="task-list">',
            '  <li><input type="checkbox" disabled> 待办事项</li>',
            '  <li><input type="checkbox" checked disabled> 已完成</li>',
            '</ul>'
        ].join('\n'));
    } else {
        insertBlock('- [ ] 待办事项\n- [x] 已完成');
    }
}

function insertGallery(count) {
    const width = count === 2 ? '45%' : '30%';
    if (formatIsHtml()) {
        const images = [];
        for (let i = 1; i <= count; i++) {
            images.push(`<img src="" alt="图 ${i}" width="${width}"/>`);
        }
        insertBlock(`<p>${images.join(' ')}</p>`);
    } else {
        const images = [];
        for (let i = 1; i <= count; i++) {
            images.push(`![图 ${i}](图片地址${i}){${width}}`);
        }
        insertBlock(images.join(' '));
    }
    toast('把“图片地址N”替换成真实链接即可');
}

function insertBilibiliVideo() {
    const raw = window.prompt('B 站视频 BV 号或完整链接（例如 BV1xx411c7mD）', '');
    if (!raw) return;
    const match = /(BV[0-9A-Za-z]+)/.exec(raw);
    const bvid = match ? match[1] : raw.trim();
    if (!/^BV[0-9A-Za-z]+$/.test(bvid)) {
        toast('没认出 BV 号');
        return;
    }
    insertBlock(`<div class="video-embed">\n<iframe src="https://player.bilibili.com/player.html?bvid=${bvid}&autoplay=0" scrolling="no" frameborder="no" allowfullscreen="true"></iframe>\n</div>`);
}

function insertAudio() {
    const url = window.prompt('音频地址（mp3 / ogg 等）', '');
    if (!url) return;
    insertBlock(`<audio controls src="${escapeAttr(url)}"></audio>`);
}

/* ------------------------------------------------------------------ *
 * 字号 / 字体 / 颜色
 * ------------------------------------------------------------------ */

const TEXT_COLORS = ['#cc0000', '#d9822b', '#eab308', '#1a8f52', '#0ea5e9', '#3344aa', '#8f5bd7', '#666666'];
const BG_COLORS = ['#fff3b0', '#ffe0e0', '#e3f2fd', '#e8f5e9', '#f3e8ff', '#fff0e0', '#eeeeee'];
const SIZE_PRESETS = ['', '0.85em', '1.15em', '1.35em', '1.6em'];

function buildSwatches(containerId, colors, onPick) {
    const box = byId(containerId);
    box.innerHTML = colors.map(function (color) {
        return `<button type="button" class="swatch" data-color="${color}" title="${color}" style="background:${color}"></button>`;
    }).join('');
    box.onclick = function (event) {
        const swatch = event.target.closest('.swatch');
        if (!swatch) return;
        onPick(swatch.dataset.color);
    };
}

function buildStyleControls() {
    buildSwatches('textColorSwatches', TEXT_COLORS, function (color) {
        state.textStyle.color = color;
        byId('styleColor').value = color;
        syncStyleControls();
    });
    buildSwatches('bgColorSwatches', BG_COLORS, function (color) {
        state.textStyle.background = color;
        byId('styleBg').value = color;
        syncStyleControls();
    });

    byId('styleSize').addEventListener('change', function () {
        if (this.value === 'custom') {
            byId('styleSizeCustomWrap').hidden = false;
            const value = Number(byId('styleSizeCustom').value);
            state.textStyle.size = value > 0 ? value + 'px' : '';
            byId('styleSizeCustom').focus();
        } else {
            byId('styleSizeCustomWrap').hidden = true;
            state.textStyle.size = this.value;
        }
        updateStyleSample();
    });

    byId('styleSizeCustom').addEventListener('input', function () {
        const value = Number(this.value);
        state.textStyle.size = value > 0 ? Math.min(96, Math.max(8, Math.round(value))) + 'px' : '';
        updateStyleSample();
    });

    byId('styleFont').addEventListener('change', function () {
        state.textStyle.font = this.value;
        updateStyleSample();
    });

    byId('styleColor').addEventListener('input', function () {
        state.textStyle.color = this.value;
        syncStyleControls();
    });
    byId('styleColorClear').addEventListener('click', function () {
        state.textStyle.color = '';
        syncStyleControls();
    });

    byId('styleBg').addEventListener('input', function () {
        state.textStyle.background = this.value;
        syncStyleControls();
    });
    byId('styleBgClear').addEventListener('click', function () {
        state.textStyle.background = '';
        syncStyleControls();
    });

    byId('btnApplyStyle').addEventListener('click', applyTextStyle);
    byId('btnClearFormat').addEventListener('click', clearFormatting);

    $$('[data-align]').forEach(function (button) {
        button.addEventListener('click', function () {
            applyAlignment(button.dataset.align);
        });
    });

    syncStyleControls();
}

function syncStyleControls() {
    const style = state.textStyle;

    if (style.size && SIZE_PRESETS.indexOf(style.size) !== -1) {
        byId('styleSize').value = style.size;
        byId('styleSizeCustomWrap').hidden = true;
    } else if (style.size && /^\d+px$/.test(style.size)) {
        byId('styleSize').value = 'custom';
        byId('styleSizeCustomWrap').hidden = false;
        byId('styleSizeCustom').value = String(parseInt(style.size, 10));
    } else {
        byId('styleSize').value = '';
        byId('styleSizeCustomWrap').hidden = true;
    }

    byId('styleFont').value = style.font || '';
    if (style.color) byId('styleColor').value = style.color;
    if (style.background) byId('styleBg').value = style.background;

    Array.from(document.querySelectorAll('#textColorSwatches .swatch')).forEach(function (node) {
        node.classList.toggle('on', node.dataset.color === style.color);
    });
    Array.from(document.querySelectorAll('#bgColorSwatches .swatch')).forEach(function (node) {
        node.classList.toggle('on', node.dataset.color === style.background);
    });

    updateStyleSample();
}

function styleCss() {
    const style = state.textStyle;
    const css = [];
    if (style.size) css.push('font-size:' + style.size);
    if (style.font) css.push('font-family:' + style.font);
    if (style.color) css.push('color:' + style.color);
    if (style.background) {
        css.push('background-color:' + style.background);
        css.push('padding:0 .18em');
        css.push('border-radius:3px');
    }
    return css.join(';');
}

function updateStyleSample() {
    byId('styleSample').setAttribute('style', styleCss());
}

function openStyleDialog(focus) {
    syncStyleControls();
    openDialog(byId('dlgStyle'));
    setTimeout(function () {
        const target = focus === 'font' ? byId('styleFont')
            : focus === 'color' ? byId('styleColor')
                : byId('styleSize');
        target.focus();
    }, 30);
}

function applyTextStyle() {
    const css = styleCss();
    if (!css) {
        toast('先选字号、字体或颜色');
        return;
    }
    const selection = getSelection();
    const inner = selection.text || '示例文字';
    replaceRange(selection.start, selection.end, `<span style="${css}">${inner}</span>`);
    closeDialog(byId('dlgStyle'));
    log('已应用文字样式：' + css);
}

function applyAlignment(align) {
    const selection = getSelection();
    const inner = selection.text || '这段文字';
    replaceRange(selection.start, selection.end, `<div style="text-align:${align}">\n${inner}\n</div>`);
    closeDialog(byId('dlgStyle'));
    log('已设置段落对齐：' + align);
}

function clearFormatting() {
    const selection = getSelection();
    if (!selection.text) {
        toast('先选中一段文字');
        return;
    }
    replaceRange(selection.start, selection.end, plainText(selection.text));
    log('已清除选区格式');
}

/* ------------------------------------------------------------------ *
 * 图片上传（粘贴 / 拖拽 / 选文件）
 * ------------------------------------------------------------------ */

function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
            resolve(String(reader.result));
        };
        reader.onerror = function () {
            reject(reader.error || new Error('读取图片失败'));
        };
        reader.readAsDataURL(file);
    });
}

async function uploadImages(files) {
    const list = Array.from(files || []).filter(function (file) {
        return /^image\//i.test(file.type);
    });
    if (!list.length) return;

    log(`正在上传 ${list.length} 张图片…`);
    for (const file of list) {
        try {
            const dataUrl = await fileToDataUrl(file);
            const result = await api('/api/upload', { method: 'POST', body: { name: file.name, data: dataUrl } });
            insertUploadedImage(result, file.name);
            log(`已上传图片：${result.path}`);
        } catch (err) {
            log('✗ 图片上传失败：' + err.message);
            toast('图片上传失败：' + err.message);
            return;
        }
    }
    toast(`已插入 ${list.length} 张图片`);
}

function insertUploadedImage(result, name) {
    const alt = plainText(String(name || '').replace(/\.[^.]+$/, '')) || '图片';
    const width = '80%';
    const markup = formatIsHtml()
        ? `<img src="${escapeAttr(result.path)}" alt="${escapeAttr(alt)}" width="${width}"/>`
        : `![${alt}](${result.path}){${width}}`;
    const selection = getSelection();
    replaceRange(selection.start, selection.end, markup);
}

/* ------------------------------------------------------------------ *
 * 预览
 * ------------------------------------------------------------------ */

function schedulePreview(delay) {
    clearTimeout(state.previewTimer);
    const wait = typeof delay === 'number' ? delay : 450;
    state.previewTimer = setTimeout(refreshPreview, wait);
}

async function refreshPreview() {
    const sequence = ++state.previewSeq;
    const post = currentPost();
    const empty = !post.title.trim() && !post.content.trim();

    if (empty) {
        state.lastHtml = '';
        byId('previewFrame').srcdoc = emptyPreview();
        byId('outline').innerHTML = '<div class="list-empty">左侧开始写作后，这里会显示文章结构与发布信息。</div>';
        return;
    }

    try {
        const result = await api('/api/preview', {
            method: 'POST',
            body: Object.assign({ mode: state.mode }, post)
        });
        if (sequence !== state.previewSeq) return;
        if (result.html !== state.lastHtml) {
            state.lastHtml = result.html;
            byId('previewFrame').srcdoc = result.html;
        }
        renderOutline(result);
    } catch (err) {
        if (sequence !== state.previewSeq) return;
        log('✗ 预览失败：' + err.message);
    }
}

function emptyPreview() {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>
        body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
        background:#fbfbfe;color:#9aa0b0;font-family:"Segoe UI","Microsoft YaHei",sans-serif;}
        .box{text-align:center;line-height:1.9;font-size:14px}
        .big{font-size:34px;margin-bottom:10px}
    </style></head><body><div class="box"><div class="big">✍️</div>写下标题和正文，<br>右侧会实时预览发布后的样子。</div></body></html>`;
}

function renderOutline(result) {
    const meta = result.meta;
    const warnings = result.warnings || [];
    const outline = byId('outline');
    if (!meta) {
        outline.innerHTML = '<div class="list-empty">暂无内容</div>';
        return;
    }

    const nav = meta.nav;
    const navText = function (post, emptyText) {
        if (!post) return `<span class="hint">${emptyText}</span>`;
        return `<span title="${escapeAttr(post.title)}">${escapeHtml(truncate(post.title, 26))}</span>`;
    };
    const kv = function (label, value) {
        return `<div class="kv"><dt>${label}</dt><dd>${value}</dd></div>`;
    };

    const parts = [];
    parts.push('<h4>这篇会写到哪里</h4><dl>');
    parts.push(kv('模式', state.mode === 'update'
        ? `更新 <code>${escapeHtml(state.originalFilename || meta.filename)}</code>`
        : '<span class="pill">新建</span>'));
    parts.push(kv('文件名', `<code>blog/${escapeHtml(meta.filename)}</code>`));
    if (result.conflict) parts.push(kv('提醒', '<span class="pill">已存在 · 发布时自动加后缀</span>'));
    parts.push(kv('日期 / 分类', `${escapeHtml(meta.date)}${meta.updated ? `（更新 ${escapeHtml(meta.updated)}）` : ''} · ${escapeHtml(meta.category)}`));
    parts.push(kv('分类页', meta.categoryMapped
        ? `<code>${escapeHtml(meta.categoryPage)}</code>`
        : '<span class="hint">未配置（只进总列表）</span>'));
    parts.push(kv('列表页', byId('fUpdateIndex').checked ? 'blog.html + 分类页' : '<span class="hint">不更新</span>'));
    parts.push('</dl>');

    parts.push('<h4>上下篇</h4><dl>');
    parts.push(kv('上一篇', navText(nav.prev, '没有了')));
    parts.push(kv('下一篇', navText(nav.next, '没有了')));
    parts.push(kv('同分类上一篇', navText(nav.catPrev, '没有了')));
    parts.push(kv('同分类下一篇', navText(nav.catNext, '没有了')));
    parts.push('</dl>');

    parts.push('<h4>统计</h4><dl>');
    const minutes = Math.max(1, Math.round(meta.characters / 400));
    parts.push(kv('字数', `${meta.characters} 字 · ${meta.paragraphs} 段 · 约 ${minutes} 分钟`));
    parts.push(kv('标题 / 图片', `${meta.headings} / ${meta.images}`));
    parts.push(kv('表格 / 代码块', `${meta.tables} / ${meta.codeBlocks}`));
    parts.push(kv('摘要', escapeHtml(meta.excerpt || '（空）')));
    parts.push('</dl>');

    if (warnings.length) {
        parts.push('<h4>提示</h4><ul class="warn-list">');
        warnings.forEach(function (warning) {
            parts.push(`<li class="warn-item">${escapeHtml(warning)}</li>`);
        });
        parts.push('</ul>');
    }

    outline.innerHTML = parts.join('');
}

/* ------------------------------------------------------------------ *
 * 发布 / 导出
 * ------------------------------------------------------------------ */

async function publish() {
    if (state.busy) return;
    const post = currentPost();
    if (!post.title.trim()) {
        toast('请先填写标题');
        byId('fTitle').focus();
        return;
    }
    if (!post.content.trim()) {
        toast('正文还是空的');
        byId('fContent').focus();
        return;
    }

    state.busy = true;
    setBusy(true);
    log(`正在发布 ${post.filename || '(自动文件名)'} …`);

    try {
        const result = await api('/api/save', {
            method: 'POST',
            body: Object.assign({}, post, {
                mode: state.mode,
                originalFilename: state.originalFilename,
                updateIndex: byId('fUpdateIndex').checked
            })
        });

        state.mode = 'update';
        state.originalFilename = result.filename;
        byId('fFilename').value = result.filename;
        state.filenameTouched = true;
        updateModeHint();

        log(`✓ 已写入 ${result.filename}`);
        (result.files || []).forEach((file) => log('  文件：' + file));
        (result.indexPages || []).forEach(function (page) {
            const action = page.action === 'inserted' ? '新增' : page.action === 'updated' ? '更新' : '未变化';
            log(`  列表页：${page.page}（${action}）`);
        });
        if (result.navUpdated && result.navUpdated.length) {
            log('  同步上下篇：' + result.navUpdated.join('、'));
        }
        (result.warnings || []).forEach((warning) => log('  ⚠ ' + warning));

        showResult(result);
        toast(`已发布 ${result.filename}`);
        if (result.warnings && result.warnings.length) {
            log('发布完成，但有 ' + result.warnings.length + ' 条提示');
        }

        state.dirty = false;
        discardLocalDraft();
        await refreshConfigQuiet();
        schedulePreview(0);
    } catch (err) {
        log('✗ 发布失败：' + err.message);
        toast('发布失败：' + err.message);
    } finally {
        state.busy = false;
        setBusy(false);
    }
}

function showResult(result) {
    byId('resultText').textContent = `已发布 blog/${result.filename}` + (result.renamed ? '（文件名已自动调整）' : '');
    const link = byId('resultLink');
    link.href = result.url || ('/site/blog/' + encodeURIComponent(result.filename));
    byId('resultBanner').hidden = false;
}

async function copyBodyHtml() {
    try {
        const result = await api('/api/preview', { method: 'POST', body: currentPost() });
        await copyText(result.bodyHtml || '');
        toast('正文 HTML 已复制');
        log('已复制正文 HTML（' + (result.bodyHtml || '').length + ' 字符）');
    } catch (err) {
        toast('复制失败：' + err.message);
    }
}

async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
}

async function downloadHtml() {
    try {
        const result = await api('/api/render', { method: 'POST', body: currentPost() });
        const blob = new Blob([result.html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = result.filename || 'article.html';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        toast('已导出 ' + anchor.download);
        log('已导出 ' + anchor.download);
    } catch (err) {
        toast('导出失败：' + err.message);
    }
}

async function saveDraft() {
    const post = currentPost();
    if (!post.title.trim() && !post.content.trim()) {
        toast('空白草稿就不保存了');
        return;
    }
    try {
        const result = await api('/api/drafts', { method: 'POST', body: { post: post } });
        log('已保存草稿 blog_draft/' + result.name);
        toast('草稿已保存');
        await refreshConfigQuiet();
    } catch (err) {
        toast('保存草稿失败：' + err.message);
    }
}

/* ------------------------------------------------------------------ *
 * 草稿（本地自动保存）
 * ------------------------------------------------------------------ */

function markDirty() {
    state.dirty = true;
    clearTimeout(state.autosaveTimer);
    state.autosaveTimer = setTimeout(saveLocalDraft, 1200);
}

function saveLocalDraft() {
    try {
        const post = currentPost();
        if (!post.title.trim() && !post.content.trim()) return;
        localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
            post: post,
            mode: state.mode,
            originalFilename: state.originalFilename,
            savedAt: Date.now()
        }));
    } catch (err) {
        /* 忽略本地存储异常 */
    }
}

function checkLocalDraft() {
    let raw = null;
    try {
        raw = localStorage.getItem(LOCAL_DRAFT_KEY);
    } catch (err) {
        return;
    }
    if (!raw) return;
    let data = null;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        return;
    }
    if (!data || !data.post) return;
    if (!String(data.post.title || '').trim() && !String(data.post.content || '').trim()) return;

    state.pendingDraft = data;
    byId('draftTime').textContent = new Date(data.savedAt || Date.now()).toLocaleString('zh-CN', { hour12: false });
    byId('draftBanner').hidden = false;
}

function restoreLocalDraft() {
    const data = state.pendingDraft;
    if (!data) return;
    applyPost(data.post, {
        mode: data.mode === 'update' ? 'update' : 'create',
        originalFilename: data.originalFilename || ''
    });
    byId('draftBanner').hidden = true;
    log('已恢复本地草稿。');
    toast('已恢复上次编辑的内容');
    schedulePreview(0);
}

function discardLocalDraft() {
    state.pendingDraft = null;
    byId('draftBanner').hidden = true;
    try {
        localStorage.removeItem(LOCAL_DRAFT_KEY);
    } catch (err) {
        /* ignore */
    }
}

/* ------------------------------------------------------------------ *
 * 新建 / 打开 / 草稿箱
 * ------------------------------------------------------------------ */

function newPost() {
    if (state.dirty && byId('fContent').value.trim()) {
        if (!window.confirm('当前内容还没有发布，确定新建吗？（本地草稿会保留）')) return;
    }
    applyPost({
        title: '',
        date: todayLocal(),
        author: (state.config && state.config.author) || '',
        category: (state.config && state.config.defaultCategory) || '',
        keywords: '',
        filename: todayLocal() + '.html',
        content: '',
        format: (state.config && state.config.markdown.format) || 'markdown',
        paragraphMode: (state.config && state.config.markdown.paragraphMode) || 'auto'
    }, { mode: 'create' });
    state.filenameTouched = false;
    byId('fTitle').focus();
    log('已新建空白文章');
}

async function refreshConfigQuiet() {
    try {
        state.config = await api('/api/config');
        applyConfig(state.config);
    } catch (err) {
        log('⚠ 刷新配置失败：' + err.message);
    }
}

async function openPostDialog() {
    await refreshConfigQuiet();
    byId('openFilter').value = '';
    renderPostList('');
    openDialog(byId('dlgOpen'));
    setTimeout(() => byId('openFilter').focus(), 30);
}

function renderPostList(filter) {
    const keyword = String(filter || '').trim().toLowerCase();
    const posts = (state.config && state.config.posts) || [];
    const matched = posts.filter(function (post) {
        if (!keyword) return true;
        return `${post.title} ${post.filename} ${post.category}`.toLowerCase().indexOf(keyword) !== -1;
    });

    state.openPosts = matched;
    const list = byId('openList');
    if (!matched.length) {
        list.innerHTML = '<div class="list-empty">没有匹配的文章</div>';
        return;
    }

    list.innerHTML = matched.map(function (post, index) {
        return `<div class="list-item" data-index="${index}">
            <div class="li-main">
                <div class="li-title">${escapeHtml(plainText(post.title))}</div>
                <div class="li-sub">${escapeHtml(post.date || '')} · ${escapeHtml(post.category || '')} · ${escapeHtml(post.filename)}${post.exists ? '' : ' · ⚠ 文件缺失'}</div>
            </div>
            <div class="li-actions"><span class="pill">载入</span></div>
        </div>`;
    }).join('');
}

async function loadPost(filename) {
    try {
        const result = await api('/api/load', { method: 'POST', body: { filename: filename } });
        applyPost(result.post, { mode: 'update', originalFilename: filename });
        log(`已载入 ${filename}` + (result.registered ? '' : '（未登记，发布时会新增记录）'));
        toast('已载入 ' + filename);
    } catch (err) {
        toast('载入失败：' + err.message);
    }
}

async function openDraftsDialog() {
    await refreshConfigQuiet();
    renderDraftList();
    openDialog(byId('dlgDrafts'));
}

function renderDraftList() {
    const drafts = (state.config && state.config.drafts) || [];
    const list = byId('draftList');
    if (!drafts.length) {
        list.innerHTML = '<div class="list-empty">还没有草稿。点“存草稿”会把内容写入 blog_draft/。</div>';
        return;
    }

    list.innerHTML = drafts.map(function (draft, index) {
        return `<div class="list-item" data-index="${index}">
            <div class="li-main">
                <div class="li-title">${escapeHtml(plainText(draft.title))}</div>
                <div class="li-sub">${escapeHtml(draft.date || '')} · ${escapeHtml(draft.name)} · ${new Date(draft.updated).toLocaleString('zh-CN', { hour12: false })}</div>
            </div>
            <div class="li-actions">
                <button class="btn tiny" data-action="load">载入</button>
                <button class="btn tiny ghost" data-action="delete">删除</button>
            </div>
        </div>`;
    }).join('');
}

async function loadDraft(name) {
    try {
        const result = await api('/api/drafts/load', { method: 'POST', body: { name: name } });
        applyPost(result.post, { mode: 'create' });
        log('已载入草稿 ' + name);
        toast('已载入草稿');
    } catch (err) {
        toast('载入草稿失败：' + err.message);
    }
}

async function deleteDraft(name) {
    if (!window.confirm('删除草稿 ' + name + ' ？')) return;
    try {
        await fetch('/api/drafts/' + encodeURIComponent(name), { method: 'DELETE' });
        await refreshConfigQuiet();
        renderDraftList();
        toast('草稿已删除');
    } catch (err) {
        toast('删除失败：' + err.message);
    }
}

async function repairNav() {
    if (!window.confirm('按 blog.html 的文章顺序，重新计算全站文章的“上一篇 / 下一篇”？\n只会改动链接确实不一致的文章。')) return;
    try {
        const result = await api('/api/repair-nav', { method: 'POST', body: {} });
        log(`上下篇修复完成：${result.updated.length} 篇被更新`);
        result.updated.forEach((name) => log('  ✓ ' + name));
        if (result.missing.length) log('  ⚠ 文件不存在：' + result.missing.join('、'));
        if (result.skipped.length) log('  ⚠ 找不到导航区块：' + result.skipped.join('、'));
        toast(result.updated.length ? `已修复 ${result.updated.length} 篇` : '上下篇本来就是一致的');
        await refreshConfigQuiet();
        schedulePreview(0);
    } catch (err) {
        toast('修复失败：' + err.message);
    }
}

/* ------------------------------------------------------------------ *
 * 事件绑定
 * ------------------------------------------------------------------ */

function bindStaticEvents() {
    bindFieldEvents();

    byId('btnNew').addEventListener('click', newPost);
    byId('btnOpen').addEventListener('click', openPostDialog);
    byId('btnDrafts').addEventListener('click', openDraftsDialog);
    byId('btnHelp').addEventListener('click', () => openDialog(byId('dlgHelp')));

    byId('btnPublish').addEventListener('click', publish);
    byId('btnSaveDraft').addEventListener('click', saveDraft);
    byId('btnCopy').addEventListener('click', copyBodyHtml);
    byId('btnDownload').addEventListener('click', downloadHtml);
    byId('btnRefresh').addEventListener('click', () => refreshPreview());

    byId('btnDevice').addEventListener('click', function () {
        state.device = state.device === 'desktop' ? 'mobile' : 'desktop';
        byId('previewWrap').classList.toggle('mobile', state.device === 'mobile');
        this.textContent = state.device === 'mobile' ? '📱' : '🖥';
    });

    byId('btnRestore').addEventListener('click', restoreLocalDraft);
    byId('btnDiscard').addEventListener('click', discardLocalDraft);
    byId('btnDismissResult').addEventListener('click', () => {
        byId('resultBanner').hidden = true;
    });

    $$('.tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
            $$('.tab').forEach((item) => item.classList.remove('active'));
            $$('.tab-panel').forEach((panel) => panel.classList.remove('active'));
            tab.classList.add('active');
            byId('panel-' + tab.dataset.tab).classList.add('active');
        });
    });

    byId('openFilter').addEventListener('input', function () {
        renderPostList(this.value);
    });

    byId('openList').addEventListener('click', function (event) {
        const item = event.target.closest('.list-item');
        if (!item) return;
        const post = state.openPosts[Number(item.dataset.index)];
        if (!post) return;
        closeDialog(byId('dlgOpen'));
        loadPost(post.filename);
    });

    byId('draftList').addEventListener('click', function (event) {
        const item = event.target.closest('.list-item');
        if (!item) return;
        const draft = ((state.config && state.config.drafts) || [])[Number(item.dataset.index)];
        if (!draft) return;
        const action = event.target.closest('[data-action]');
        if (action && action.dataset.action === 'delete') {
            deleteDraft(draft.name);
            return;
        }
        closeDialog(byId('dlgDrafts'));
        loadDraft(draft.name);
    });

    byId('btnInsertImage').addEventListener('click', insertImageFromDialog);

    byId('btnRepairNav').addEventListener('click', repairNav);

    byId('categoryChips').addEventListener('click', function (event) {
        const chip = event.target.closest('.chip');
        if (!chip) return;
        toggleCategory(chip.dataset.cat);
    });

    byId('imageFile').addEventListener('change', function () {
        uploadImages(this.files);
        this.value = '';
    });

    byId('btnCopyLink').addEventListener('click', async function () {
        const href = byId('resultLink').href;
        if (!href) return;
        try {
            await copyText(href);
            toast('文章链接已复制');
        } catch (err) {
            toast('复制失败：' + err.message);
        }
    });

    $$('[data-close]').forEach(function (button) {
        button.addEventListener('click', function () {
            const dialog = button.closest('dialog');
            if (dialog) closeDialog(dialog);
        });
    });

    $$('dialog').forEach(function (dialog) {
        dialog.addEventListener('click', function (event) {
            if (event.target === dialog) closeDialog(dialog);
        });
    });

    window.addEventListener('beforeunload', function (event) {
        saveLocalDraft();
        if (state.dirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    });
}

function bindTextareaEvents() {
    const ta = textarea();

    ta.addEventListener('keydown', function (event) {
        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const selection = getSelection();
            replaceRange(selection.start, selection.end, '  ');
            return;
        }

        if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;

        const value = ta.value;
        const position = ta.selectionStart;
        if (ta.selectionStart !== ta.selectionEnd) return;

        const lineStart = value.lastIndexOf('\n', position - 1) + 1;
        const line = value.slice(lineStart, position);

        const bullet = /^(\s*)([-*+])[ \t]+(.*)$/.exec(line);
        const ordered = /^(\s*)(\d{1,9})([.)])[ \t]+(.*)$/.exec(line);
        const quote = /^(\s*>[ \t]?)(.*)$/.exec(line);

        if (!bullet && !ordered && !quote) return;

        event.preventDefault();

        if (bullet && !bullet[3].trim()) {
            replaceRange(lineStart, position, '');
            return;
        }
        if (ordered && !ordered[4].trim()) {
            replaceRange(lineStart, position, '');
            return;
        }
        if (quote && !quote[2].trim()) {
            replaceRange(lineStart, position, '');
            return;
        }

        let insertion = '';
        if (bullet) insertion = '\n' + bullet[1] + bullet[2] + ' ';
        else if (ordered) insertion = '\n' + ordered[1] + (Number(ordered[2]) + 1) + ordered[3] + ' ';
        else if (quote) insertion = '\n' + quote[1];

        replaceRange(position, position, insertion);
    });

    // 直接粘贴截图 → 上传到 blog_fig/ 并插入
    ta.addEventListener('paste', function (event) {
        const items = Array.from((event.clipboardData && event.clipboardData.items) || []);
        const images = items
            .filter((item) => item.kind === 'file' && /^image\//i.test(item.type))
            .map((item) => item.getAsFile())
            .filter(Boolean);
        if (!images.length) return;
        event.preventDefault();
        uploadImages(images);
    });

    ta.addEventListener('dragover', function (event) {
        const types = Array.from((event.dataTransfer && event.dataTransfer.types) || []);
        if (types.indexOf('Files') === -1) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    });

    ta.addEventListener('drop', function (event) {
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
        if (!files.some((file) => /^image\//i.test(file.type))) return;
        event.preventDefault();
        uploadImages(files);
    });
}

function bindKeyboard() {
    document.addEventListener('keydown', function (event) {
        const mod = event.ctrlKey || event.metaKey;
        if (!mod) return;
        const key = String(event.key).toLowerCase();

        // Ctrl+S / Ctrl+Enter 在任何输入框里都有效
        if (key === 'enter') {
            event.preventDefault();
            publish();
            return;
        }
        if (key === 's') {
            event.preventDefault();
            saveDraft();
            return;
        }

        // 排版快捷键只在正文里生效，避免在标题里按 Ctrl+B 却改了正文
        const active = document.activeElement;
        const isTextField = active && /^(?:INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
        if (isTextField && active.id !== 'fContent') return;

        if (key === 'b') {
            event.preventDefault();
            inlineStyle('bold');
        } else if (key === 'i') {
            event.preventDefault();
            inlineStyle('italic');
        } else if (key === 'k') {
            event.preventDefault();
            insertLink();
        }
    });
}

/* ------------------------------------------------------------------ *
 * 对话框
 * ------------------------------------------------------------------ */

function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
        if (!dialog.open) dialog.showModal();
    } else {
        dialog.setAttribute('open', '');
    }
}

function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
}
