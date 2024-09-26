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