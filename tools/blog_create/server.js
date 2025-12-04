const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static('public')); // 存放 index.html 的地方

const DB_PATH = './data.json';
const POSTS_DIR = '../../blog'; // 你的文章存放目录

// 辅助：读取数据库
function getDb() {
    if (!fs.existsSync(DB_PATH)) return [];
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

// 辅助：保存数据库
function saveDb(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// 1. 获取基础信息（自动计算上一篇）
app.get('/api/draft', (req, res) => {
    const db = getDb();
    
    // 按日期排序
    db.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 获取全局最后一篇
    const globalPrev = db[db.length - 1] || null;

    res.json({
        globalPrev: globalPrev,
        categories: [...new Set(db.map(i => i.category))] // 返回所有已有的分类
    });
});

// 2. 获取特定分类的上一篇
app.post('/api/cat-prev', (req, res) => {
    const { category } = req.body;
    const db = getDb();
    // 过滤同分类，按日期排序，取最后一个
    const catItems = db.filter(i => i.category === category).sort((a, b) => new Date(a.date) - new Date(b.date));
    const catPrev = catItems[catItems.length - 1] || null;
    res.json(catPrev);
});

// 3. 生成文章并更新旧文章
app.post('/api/create', (req, res) => {
    const newPost = req.body; // { title, date, content, filename, category, author ... }
    const db = getDb();

    // A. 准备新文章的 HTML 内容
    // 自动获取传过来的上一篇信息
    const pInfo = newPost.prevInfo || {}; 
    const cpInfo = newPost.catPrevInfo || {};

    const prevLink = pInfo.filename ? `<a href="${pInfo.filename}">${pInfo.title}</a>` : '没有了';
    const catPrevLink = cpInfo.filename ? `<a href="${cpInfo.filename}">${cpInfo.title}</a>` : '没有了';

    // 模板
    const htmlContent = `<!DOCTYPE html>
<html lang="cn">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>小七の杂谈</title>
    <link rel="stylesheet" href="../blog_article.css">
    <script src="../mobile_script.js" defer></script>
</head>
<body>
    <nav>
        <a href="../index.html">返回主页</a>
        <a href="../blog.html">查看其他杂谈</a>
    </nav>
    <div class="content">
        <div id="${newPost.date}" class="chapter-content" style="display: block;"> 
            <h2>${newPost.title}</h2>
            <p>时间：${newPost.date}  作者：${newPost.author}</p>
            <p>分类：<a href="../other_blogs.html">${newPost.category}</a></p>
            <hr>
${newPost.content.split('\n').map(line => '            ' + line).join('\n')}
        </div>
        <hr>
        <p>上一篇：${prevLink}<br>
            下一篇：没有了</p>
        <p>同分类上一篇：${catPrevLink}<br>
            同分类下一篇：没有了</p>
    </div>
</body>
</html>`;

    // B. 写入新文件
    const newFilePath = path.join(POSTS_DIR, newPost.filename);
    fs.writeFileSync(newFilePath, htmlContent, 'utf8');

    // C. 修改上一篇文章（如果有） - 将 "没有了" 替换为新链接
    if (pInfo.filename) {
        updateOldPost(pInfo.filename, 'global', newPost);
    }
    if (cpInfo.filename && cpInfo.filename !== pInfo.filename) {
        updateOldPost(cpInfo.filename, 'category', newPost);
    }

    // D. 更新数据库
    db.push({
        id: newPost.date,
        title: newPost.title,
        date: newPost.date,
        category: newPost.category,
        filename: newPost.filename
    });
    saveDb(db);

    res.json({ success: true, message: `文章 ${newPost.filename} 已生成，旧文章链接已更新！` });
});

// 辅助：修改旧文件的函数
function updateOldPost(filename, type, newPostObj) {
    const filePath = path.join(POSTS_DIR, filename);
    if (!fs.existsSync(filePath)) return;

    let content = fs.readFileSync(filePath, 'utf8');
    const newLink = `<a href="${newPostObj.filename}">${newPostObj.title}</a>`;

    if (type === 'global') {
        // 替换 "下一篇：没有了" 或 "下一篇：<a...>...</a>" (实际上旧文章肯定是'没有了')
        // 考虑到正则匹配可能受空格影响，这里做松散匹配
        content = content.replace(/(下一篇：)(没有了)/, `$1${newLink}`);
    } else if (type === 'category') {
        content = content.replace(/(同分类下一篇：)(没有了)/, `$1${newLink}`);
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filename} (${type} link).`);
}

app.listen(3000, () => {
    console.log('博客工具已启动：http://localhost:3000');
});