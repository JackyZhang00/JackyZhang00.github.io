/*!
 * BlogMarkdown —— 为小七の杂谈博客工具写的零依赖 Markdown 渲染器。
 *
 * 特点：
 *  - 同时支持 Markdown 与原始 HTML（HTML 块原样保留，便于继续维护旧文章）
 *  - 支持标题、围栏代码块、引用、嵌套列表、GFM 表格、分割线
 *  - 支持行内代码、加粗、斜体、删除线、链接、图片、自动链接
 *  - 图片支持宽度后缀：![alt](url){50%}  →  <img ... width="50%">
 *  - 同一行内 / 连续行的纯图片会自动合并为一个段落（并排显示）
 *  - UMD：Node.js 中 require，浏览器中 window.BlogMarkdown
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.BlogMarkdown = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var PH_OPEN = '\u0001';
    var PH_CLOSE = '\u0002';

    var HTML_BLOCK_TAGS = 'address|article|aside|blockquote|canvas|center|details|dialog|div|dl|fieldset|figcaption|figure|font|footer|form|h[1-6]|header|hr|iframe|img|main|marquee|nav|noscript|ol|p|pre|script|section|style|svg|table|ul|video|audio';
    var HTML_BLOCK_RE = new RegExp('^<(?:' + HTML_BLOCK_TAGS + ')(?:[\\s/>]|$)', 'i');
    var VOID_TAGS = /^(?:hr|img|br|input|meta|link|source|track|wbr|area|base|col|embed|param)$/i;

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function attr(value) {
        return esc(value).replace(/`/g, '&#96;');
    }

    function createStore() {
        var items = [];
        return {
            put: function (html) {
                items.push(html);
                return PH_OPEN + (items.length - 1) + PH_CLOSE;
            },
            restore: function (text) {
                return text.replace(new RegExp(PH_OPEN + '(\\d+)' + PH_CLOSE, 'g'), function (_, index) {
                    return items[Number(index)];
                });
            }
        };
    }

    /** 解析图片的宽度后缀：{50%} / {width=50%} / {300} */
    function parseWidth(size) {
        if (!size) return '';
        var value = String(size).trim().replace(/^width\s*=\s*/i, '').replace(/^["']|["']$/g, '');
        if (!/^\d{1,4}(%|px)?$/.test(value)) return '';
        return value;
    }

    function trimUrl(url) {
        return String(url).replace(/[.,;:!?)\]}>'"。，；：！？）】」』、]+$/, '');
    }

    /** 行内渲染：强调、代码、链接、图片…… */
    function renderInline(text, options) {
        options = options || {};
        var store = createStore();
        var s = String(text == null ? '' : text);

        // 1. 反斜杠转义
        s = s.replace(/\\([\\`*_{}\[\]()#+\-.!~|>])/g, function (_, ch) {
            return store.put(esc(ch));
        });

        // 2. 行内代码
        s = s.replace(/(`+)([\s\S]*?)\1/g, function (_, ticks, code) {
            var clean = String(code).replace(/\n/g, ' ');
            if (clean.length > 2 && clean.charAt(0) === ' ' && clean.charAt(clean.length - 1) === ' ') {
                clean = clean.slice(1, -1);
            }
            return store.put('<code>' + esc(clean) + '</code>');
        });

        // 3. 原始行内 HTML 标签原样保留
        s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9:-]*(?:\s[^<>]*?)?\/?>/g, function (tag) {
            return store.put(tag);
        });

        // 4. 图片（先于链接处理）
        s = s.replace(/!\[([^\]]*)\]\(\s*<?([^)\s>]+)>?(?:\s+["']([^"']*)["'])?\s*\)(?:\s*\{([^}]*)\})?/g,
            function (_, alt, src, title, size) {
                var attrs = ' src="' + attr(src) + '" alt="' + attr(alt) + '"';
                if (title) attrs += ' title="' + attr(title) + '"';
                var width = parseWidth(size);
                if (width) attrs += ' width="' + attr(width) + '"';
                return store.put('<img' + attrs + '/>');
            });

        // 5. 链接
        s = s.replace(/\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+["']([^"']*)["'])?\s*\)/g,
            function (_, label, href, title) {
                var open = '<a href="' + attr(href) + '"';
                if (title) open += ' title="' + attr(title) + '"';
                return store.put(open + '>') + label + store.put('</a>');
            });

        // 6. <https://...>
        s = s.replace(/<((?:https?|mailto):[^>\s]+)>/g, function (_, url) {
            return store.put('<a href="' + attr(url) + '">') + esc(url) + store.put('</a>');
        });

        // 7. 裸链接自动识别
        if (options.autoLink !== false) {
            s = s.replace(/(^|[\s(（「])(https?:\/\/[^\s<>"'，。；：！？）】」』、]+)/g,
                function (whole, prefix, url) {
                    var clean = trimUrl(url);
                    if (!clean) return whole;
                    var tail = url.slice(clean.length);
                    return prefix + store.put('<a href="' + attr(clean) + '">') + esc(clean) + store.put('</a>') + tail;
                });
        }

        // 8. 高亮（==文字==）
        s = s.replace(/==([^\s=](?:[\s\S]*?[^\s=])?)==/g, '<mark>$1</mark>');

        // 9. 强调
        s = s.replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        s = s.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^\w])__([\s\S]+?)__(?!\w)/g, '$1<strong>$2</strong>');
        s = s.replace(/~~([\s\S]+?)~~/g, '<del>$1</del>');
        s = s.replace(/(^|[^*\w])\*([^\s*](?:[\s\S]*?[^\s*])?)\*(?!\*)/g, '$1<em>$2</em>');
        s = s.replace(/(^|[^\w])_([^\s_](?:[\s\S]*?[^\s_])?)_(?!\w)/g, '$1<em>$2</em>');

        // 10. 换行
        s = options.softBreak === 'br' ? s.replace(/\n/g, '<br>\n') : s.replace(/\n/g, ' ');

        return store.restore(s);
    }

    function splitRow(line) {
        var s = String(line).trim();
        if (s.charAt(0) === '|') s = s.slice(1);
        if (s.charAt(s.length - 1) === '|') s = s.slice(0, -1);
        return s.split('|').map(function (cell) {
            return cell.trim();
        });
    }

    function countTag(text, re) {
        re.lastIndex = 0;
        var count = 0;
        while (re.exec(text)) count++;
        return count;
    }

    function readHtmlBlock(lines, start) {
        var first = lines[start].replace(/^\s+/, '');
        var buffer = [];
        var cursor = start;

        if (first.indexOf('<!--') === 0) {
            while (cursor < lines.length) {
                buffer.push(lines[cursor]);
                var closed = lines[cursor].indexOf('-->') !== -1;
                cursor++;
                if (closed) break;
            }
            return { text: buffer.join('\n'), next: cursor };
        }

        var match = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(first);
        var tag = match ? match[1].toLowerCase() : '';

        // 空元素只占一行
        if (!tag || VOID_TAGS.test(tag)) {
            return { text: lines[start], next: start + 1 };
        }

        // 容器元素：按同名标签的深度配对，直到重新归零
        var openRe = new RegExp('<' + tag + '\\b[^>]*>', 'gi');
        var closeRe = new RegExp('</' + tag + '\\s*>', 'gi');
        var depth = 0;
        while (cursor < lines.length) {
            buffer.push(lines[cursor]);
            depth += countTag(lines[cursor], openRe) - countTag(lines[cursor], closeRe);
            cursor++;
            if (depth <= 0) break;
        }
        return { text: buffer.join('\n'), next: cursor };
    }

    function isBlockStart(line) {
        var trimmed = line.replace(/^\s+/, '');
        if (!trimmed) return false;
        if (HTML_BLOCK_RE.test(trimmed) || trimmed.indexOf('<!--') === 0) return true;
        if (/^(`{3,}|~{3,})/.test(trimmed)) return true;
        if (/^#{1,6}[ \t]+/.test(trimmed)) return true;
        if (/^(-\s*){3,}$|^(\*\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) return true;
        if (/^>/.test(trimmed)) return true;
        if (/^([-*+]|\d{1,9}[.)])[ \t]+/.test(trimmed)) return true;
        return false;
    }

    function readList(lines, start) {
        var items = [];
        var cursor = start;
        var baseIndent = -1;
        var baseOrdered = null;

        while (cursor < lines.length) {
            var line = lines[cursor];
            if (/^\s*$/.test(line)) {
                // 列表项之间允许有空行，但空行后必须仍是列表或缩进内容
                var lookahead = cursor + 1;
                while (lookahead < lines.length && /^\s*$/.test(lines[lookahead])) lookahead++;
                if (lookahead < lines.length &&
                    (/^\s*([-*+]|\d{1,9}[.)])[ \t]+/.test(lines[lookahead]) || /^\s{2,}\S/.test(lines[lookahead]))) {
                    cursor = lookahead;
                    continue;
                }
                break;
            }

            var match = /^(\s*)([-*+]|\d{1,9}[.)])[ \t]+(.*)$/.exec(line);
            if (match) {
                var indent = match[1].length;
                if (baseIndent < 0) {
                    baseIndent = indent;
                    baseOrdered = /\d/.test(match[2]);
                }
                if (indent < baseIndent) break;
                // 同一层级换了列表类型 → 结束当前列表
                if (indent === baseIndent && /\d/.test(match[2]) !== baseOrdered) break;
                items.push({
                    indent: indent,
                    ordered: /\d/.test(match[2]),
                    number: /\d/.test(match[2]) ? parseInt(match[2], 10) : null,
                    text: match[3],
                    extra: []
                });
                cursor++;
                continue;
            }

            var indentMatch = /^(\s*)/.exec(line);
            var lineIndent = indentMatch[1].length;
            if (items.length && lineIndent > items[items.length - 1].indent) {
                items[items.length - 1].extra.push(line.trim());
                cursor++;
                continue;
            }
            break;
        }

        return { items: items, next: cursor };
    }

    function renderListItems(items, options) {
        if (!items.length) return '';
        var ordered = items[0].ordered;
        var startNumber = items[0].number;
        var attrs = ordered && startNumber && startNumber !== 1 ? ' start="' + startNumber + '"' : '';
        var html = ordered ? '<ol' + attrs + '>\n' : '<ul>\n';
        var index = 0;

        while (index < items.length) {
            var item = items[index];
            var childStart = index + 1;
            var childEnd = childStart;
            while (childEnd < items.length && items[childEnd].indent > item.indent) childEnd++;

            var text = item.text + (item.extra.length ? ' ' + item.extra.join(' ') : '');
            var task = /^\[([ xX])\][ \t]+([\s\S]*)$/.exec(text);
            if (task) {
                html += '<li class="task"><input type="checkbox" disabled' +
                    (task[1].toLowerCase() === 'x' ? ' checked' : '') + '> ' +
                    renderInline(task[2], options);
            } else {
                html += '<li>' + renderInline(text, options);
            }
            if (childEnd > childStart) {
                html += '\n' + renderListItems(items.slice(childStart, childEnd), options) + '\n';
            }
            html += '</li>\n';
            index = childEnd;
        }

        html += ordered ? '</ol>' : '</ul>';
        return html;
    }

    function isImageOnly(text) {
        return /^(?:\s*!\[[^\]]*\]\([^)]*\)(?:\s*\{[^}]*\})?\s*)+$/.test(text);
    }

    function resolveParagraphMode(source, requested) {
        if (requested === 'blank' || requested === 'line') return requested;
        // auto：有“空行分段”就按标准 Markdown 处理，否则视作“一行即一段”
        return /[^\n]\n[ \t]*\n/.test(String(source)) ? 'blank' : 'line';
    }

    function renderBlocks(source, options) {
        var lines = String(source == null ? '' : source).replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
        var out = [];
        var index = 0;
        var paragraphMode = options.paragraphMode;

        while (index < lines.length) {
            var line = lines[index];
            if (/^\s*$/.test(line)) {
                index++;
                continue;
            }

            var trimmed = line.replace(/^\s+/, '');

            // HTML 块 / 注释
            if (HTML_BLOCK_RE.test(trimmed) || trimmed.indexOf('<!--') === 0) {
                var block = readHtmlBlock(lines, index);
                out.push(block.text);
                index = block.next;
                continue;
            }

            // 围栏代码块
            var fence = /^(`{3,}|~{3,})[ \t]*([^\s`~]*)[ \t]*$/.exec(trimmed);
            if (fence) {
                var marker = fence[1].charAt(0);
                var fenceLength = fence[1].length;
                var language = fence[2] || '';
                var closer = new RegExp('^\\s*' + (marker === '`' ? '`' : '~') + '{' + fenceLength + ',}\\s*$');
                var codeLines = [];
                index++;
                while (index < lines.length && !closer.test(lines[index])) {
                    codeLines.push(lines[index]);
                    index++;
                }
                if (index < lines.length) index++;
                var languageClass = language
                    ? ' class="language-' + attr(language.replace(/[^\w+#.-]/g, '')) + '"'
                    : '';
                out.push('<pre><code' + languageClass + '>' + esc(codeLines.join('\n')) + '</code></pre>');
                continue;
            }

            // ATX 标题
            var heading = /^(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/.exec(trimmed);
            if (heading) {
                var level = heading[1].length;
                var shift = typeof options.headingShift === 'number' ? options.headingShift : 0;
                var outLevel = Math.min(6, Math.max(1, level + shift));
                out.push('<h' + outLevel + '>' + renderInline(heading[2], options) + '</h' + outLevel + '>');
                index++;
                continue;
            }

            // 分割线
            if (/^(-\s*){3,}$|^(\*\s*){3,}$|^(_\s*){3,}$/.test(trimmed)) {
                out.push('<hr>');
                index++;
                continue;
            }

            // 引用
            if (/^>/.test(trimmed)) {
                var quoteLines = [];
                while (index < lines.length && /^\s*>/.test(lines[index])) {
                    quoteLines.push(lines[index].replace(/^\s*>[ \t]?/, ''));
                    index++;
                }
                out.push('<blockquote>\n' + renderBlocks(quoteLines.join('\n'), options) + '\n</blockquote>');
                continue;
            }

            // 表格
            if (trimmed.indexOf('|') !== -1 && index + 1 < lines.length) {
                var separators = splitRow(lines[index + 1]);
                var isTable = separators.length > 0 && separators.every(function (cell) {
                    return /^:?-{2,}:?$/.test(cell);
                });
                if (isTable) {
                    var headers = splitRow(line);
                    var aligns = separators.map(function (cell) {
                        var left = cell.charAt(0) === ':';
                        var right = cell.charAt(cell.length - 1) === ':';
                        if (left && right) return 'center';
                        if (right) return 'right';
                        if (left) return 'left';
                        return '';
                    });
                    var alignAttr = function (i) {
                        return aligns[i] ? ' style="text-align:' + aligns[i] + '"' : '';
                    };
                    var tableHtml = ['<table>', '<thead>', '<tr>'];
                    headers.forEach(function (cell, i) {
                        tableHtml.push('<th' + alignAttr(i) + '>' + renderInline(cell, options) + '</th>');
                    });
                    tableHtml.push('</tr>', '</thead>', '<tbody>');
                    index += 2;
                    while (index < lines.length && !/^\s*$/.test(lines[index]) && lines[index].indexOf('|') !== -1) {
                        var cells = splitRow(lines[index]);
                        tableHtml.push('<tr>');
                        for (var c = 0; c < headers.length; c++) {
                            tableHtml.push('<td' + alignAttr(c) + '>' + renderInline(cells[c] || '', options) + '</td>');
                        }
                        tableHtml.push('</tr>');
                        index++;
                    }
                    tableHtml.push('</tbody>', '</table>');
                    out.push(tableHtml.join('\n'));
                    continue;
                }
            }

            // 列表
            if (/^\s*([-*+]|\d{1,9}[.)])[ \t]+/.test(line)) {
                var list = readList(lines, index);
                if (list.items.length) {
                    out.push(renderListItems(list.items, options));
                    index = list.next;
                    continue;
                }
            }

            // 段落
            var paragraphLines = [];
            if (paragraphMode === 'line') {
                paragraphLines.push(trimmed.replace(/[ \t]+$/, ''));
                index++;
            } else {
                while (index < lines.length && !/^\s*$/.test(lines[index]) && !isBlockStart(lines[index])) {
                    paragraphLines.push(lines[index].replace(/^\s+/, '').replace(/[ \t]+$/, ''));
                    index++;
                }
            }

            if (!paragraphLines.length) {
                // 兜底，避免死循环
                paragraphLines.push(trimmed);
                index++;
            }

            // 连续的纯图片行合并成一段，方便并排显示
            if (options.mergeImages !== false && isImageOnly(paragraphLines.join(' '))) {
                var imageLines = paragraphLines.slice();
                while (index < lines.length && !/^\s*$/.test(lines[index]) &&
                    isImageOnly(lines[index].trim())) {
                    imageLines.push(lines[index].trim());
                    index++;
                }
                out.push('<p>' + renderInline(imageLines.join(' '), options) + '</p>');
                continue;
            }

            out.push('<p>' + renderInline(paragraphLines.join('\n'), options) + '</p>');
        }

        return out.join('\n');
    }

    function render(source, options) {
        var opts = Object.assign({}, options);
        var text = String(source == null ? '' : source).replace(/\r\n?/g, '\n');
        opts.paragraphMode = resolveParagraphMode(text, opts.paragraphMode || 'auto');
        opts.softBreak = opts.softBreak || 'space';
        return renderBlocks(text, opts);
    }

    return {
        version: '1.0.0',
        render: render,
        renderInline: renderInline
    };
});
