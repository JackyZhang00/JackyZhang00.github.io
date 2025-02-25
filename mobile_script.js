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
        showContent('');
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