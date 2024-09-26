// script.txt
function showSection(section) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(s => s.style.display = 'none');
    document.getElementById(section).style.display = 'block';
    document.querySelectorAll('.chapters').forEach(c => c.style.display = 'none');
}

function toggleChapters(section) {
    const chapters = document.getElementById(section + 'Chapters');
    chapters.style.display = chapters.style.display === 'none' ? 'block' : 'none';
}

function toggleSubChapters(chapter) {
    const subChapters = document.getElementById(chapter + 'SubChapters');
    subChapters.style.display = subChapters.style.display === 'none' ? 'block' : 'none';
}

function showContent(chapter) {
    const contents = document.querySelectorAll('.chapter-content');
    contents.forEach(c => c.style.display = 'none');
    document.getElementById(chapter).style.display = 'block';
}

// 添加鼠标经过和离开事件监听器
document.querySelector('.sidebar').addEventListener('mouseover', function() {
    this.style.width = '200px'; // 展开导航栏
    this.querySelector('.sidebar-content').style.display = 'block';
});

document.querySelector('.sidebar').addEventListener('mouseout', function() {
    this.style.width = '50px'; // 隐藏导航栏
    this.querySelector('.sidebar-content').style.display = 'none';
});