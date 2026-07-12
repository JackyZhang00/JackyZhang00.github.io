function showSection(section) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    document.getElementById(section).style.display = 'block';
    document.querySelectorAll('.chapters').forEach(c => c.style.display = 'none');
}

function toggleChapters(section) {
    const chapters = document.getElementById(section + 'Chapters');
    if (chapters.style.display === 'none') {
        chapters.style.display = 'block';
    } else {
        chapters.style.display = 'none';
    }
}

function toggleSubChapters(chapter) {
    const subChapters = document.getElementById(chapter + 'SubChapters');
    if (subChapters.style.display === 'none') {
        subChapters.style.display = 'block';
    } else {
        subChapters.style.display = 'none';
    }
}

function showContent(chapter) {
    const contents = document.querySelectorAll('.chapter-content');
    contents.forEach(c => c.style.display = 'none');
    document.getElementById(chapter).style.display = 'block';
    }

// 新增移动端功能
function showContentMobile(contentId) {
    showContent(contentId);
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').style.display = 'none';
        window.scrollTo(0, document.getElementById(contentId).offsetTop - 60);
    }
}

// 初始化（适配双平台）
window.onload = function() {
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').style.display = 'none';
        document.querySelector('.mobile-nav').selectedIndex = 0;
    } else {
        const visibleSection = document.querySelector('.section[style*="display: block"]');
        const visibleChapter = document.querySelector('.chapter-content[style*="display: block"]');

        // 如果都没有可见的，就加载默认页面
        if (!visibleSection && !visibleChapter) {
            // showSection('home'); // 或 showContent('chapter1')
        }
    }
};

// 窗口尺寸变化监听
window.onresize = () => {
    if (window.innerWidth > 768) {
        document.querySelector('.sidebar').style.display = 'block';
    } else {
        document.querySelector('.sidebar').style.display = 'none';
    }
};

// 复制博客分享内容
function initializeBlogShare() {
    const shareLinks = document.querySelectorAll('.share-link');

    shareLinks.forEach(shareLink => {
        shareLink.addEventListener('click', async function(event) {
            event.preventDefault();

            const articleContent =
                shareLink.closest('.chapter-content') ||
                document.querySelector('.chapter-content');

            const titleElement = articleContent
                ? articleContent.querySelector('h2')
                : document.querySelector('h2');

            const articleTitle = titleElement
                ? titleElement.textContent.trim()
                : document.title.replace(/^小七の杂谈[：:]\s*/, '').trim();

            // 去掉网址末尾可能存在的 #，避免复制无用锚点
            const articleUrl =
                window.location.origin +
                window.location.pathname +
                window.location.search;

            const shareText =
                `我分享了小七の杂谈：《${articleTitle}》，链接：${articleUrl}`;

            const messageElement =
                shareLink.parentElement.querySelector('.share-message');

            try {
                await copyTextToClipboard(shareText);

                shareLink.textContent = '已复制';
                if (messageElement) {
                    messageElement.textContent = '分享内容已复制到剪切板';
                }

                window.setTimeout(() => {
                    shareLink.textContent = '分享文章';
                    if (messageElement) {
                        messageElement.textContent = '';
                    }
                }, 2000);
            } catch (error) {
                console.error('复制分享内容失败：', error);

                if (messageElement) {
                    messageElement.textContent = '复制失败，请手动复制文章链接';
                }
            }
        });
    });
}

// 兼容 HTTPS、localhost 以及部分旧浏览器
async function copyTextToClipboard(text) {
    if (
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        window.isSecureContext
    ) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.setAttribute('readonly', '');
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';

    document.body.appendChild(textArea);
    textArea.select();
    textArea.setSelectionRange(0, textArea.value.length);

    const copied = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (!copied) {
        throw new Error('浏览器不支持复制操作');
    }
}

document.addEventListener('DOMContentLoaded', initializeBlogShare);