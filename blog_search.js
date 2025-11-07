/******************************************************************
 *  1. 无跳动分页（与原 SmoothPagination 完全一致）
 ******************************************************************/
class SmoothPagination {
    constructor() {
      this.sourceArticles = Array.from(document.querySelectorAll('#articles .article'));
      this.itemsPerPage   = 10;
      this.totalPages     = Math.ceil(this.sourceArticles.length / this.itemsPerPage);
      this.currentPage    = this.getPageFromUrl();
      this.container      = document.getElementById('articleContainer');
      this.maxVisiblePages= 5;
      this.pages          = [];
      this.init();
    }
  
    init() {
      this.createPages();
      this.bindEvents();
      this.showPage(this.currentPage);
      window.addEventListener('popstate', () => this.showPage(this.getPageFromUrl()));
    }
  
    getPageFromUrl() {
      const p = new URLSearchParams(location.search);
      const page = parseInt(p.get('page')) || 1;
      return Math.max(1, Math.min(page, this.totalPages));
    }
  
    setPageToUrl(page) {
      const url = new URL(location.href);
      url.searchParams.set('page', page);
      window.history.pushState({ page }, '', url);
    }
  
    createPages() {
      // 把原始节点移到隐藏容器备用
      const tempDiv = document.createElement('div');
      tempDiv.id = 'articles';
      tempDiv.style.display = 'none';
      document.body.appendChild(tempDiv);
      this.sourceArticles.forEach(a => tempDiv.appendChild(a));
  
      // 生成分页
      for (let i = 0; i < this.totalPages; i++) {
        const pageDiv = document.createElement('div');
        pageDiv.className = 'article-page';
        const start = i * this.itemsPerPage;
        const end   = start + this.itemsPerPage;
        this.sourceArticles.slice(start, end)
                           .forEach(art => pageDiv.appendChild(art.cloneNode(true)));
        this.container.appendChild(pageDiv);
        this.pages.push(pageDiv);
      }
    }
  
    showPage(page) {
      if (page < 1 || page > this.totalPages) return;
      this.pages.forEach(p => p.classList.remove('active'));
      const target = this.pages[page - 1];
      target.classList.add('active');
      this.container.style.height = target.offsetHeight + 'px';
      this.currentPage = page;
      this.setPageToUrl(page);
      this.updateControls();
      this.updateStats();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  
    updateControls() {
      document.getElementById('firstPage').disabled = this.currentPage === 1;
      document.getElementById('prevPage') .disabled = this.currentPage === 1;
      document.getElementById('nextPage') .disabled = this.currentPage === this.totalPages;
      document.getElementById('lastPage') .disabled = this.currentPage === this.totalPages;
      this.renderPageNumbers();
    }
  
    renderPageNumbers() {
      const container = document.getElementById('pageNumbers');
      container.innerHTML = '';
      const pages = this.getPageNumbers();
      pages.forEach(p => {
        if (p === 'ellipsis') {
          const span = document.createElement('span');
          span.className = 'ellipsis';
          span.textContent = '...';
          container.appendChild(span);
        } else {
          const btn = document.createElement('button');
          btn.textContent = p;
          btn.classList.toggle('active', p === this.currentPage);
          btn.addEventListener('click', () => this.showPage(p));
          container.appendChild(btn);
        }
      });
    }
  
    getPageNumbers() {
      const pages = [];
      const half = Math.floor(this.maxVisiblePages / 2);
      let start = Math.max(1, this.currentPage - half);
      let end   = Math.min(this.totalPages, start + this.maxVisiblePages - 1);
      if (end - start + 1 < this.maxVisiblePages) start = Math.max(1, end - this.maxVisiblePages + 1);
      if (start > 1) { pages.push(1); if (start > 2) pages.push('ellipsis'); }
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < this.totalPages) { if (end < this.totalPages - 1) pages.push('ellipsis'); pages.push(this.totalPages); }
      return pages;
    }
  
    updateStats() {
      const start = (this.currentPage - 1) * this.itemsPerPage + 1;
      const end   = Math.min(start + this.itemsPerPage - 1, this.sourceArticles.length);
      document.getElementById('stats').textContent =
        `显示第 ${start} - ${end} 条，共 ${this.sourceArticles.length} 条记录`;
    }
  
    bindEvents() {
      document.getElementById('firstPage').onclick = () => this.showPage(1);
      document.getElementById('prevPage') .onclick = () => this.showPage(this.currentPage - 1);
      document.getElementById('nextPage') .onclick = () => this.showPage(this.currentPage + 1);
      document.getElementById('lastPage') .onclick = () => this.showPage(this.totalPages);
    }
  }
  
  /******************************************************************
   *  2. 关键词搜索（与分页共存）
   ******************************************************************/
  class ArticleSearch {
    constructor(pagination) {
      this.pg                = pagination;
      this.searchInput       = document.getElementById('searchInput');
      this.searchResultsInfo = document.getElementById('searchResults');
      this.noResultsBox      = document.getElementById('noResults');
      this.searchTermSpan    = document.getElementById('searchTerm');
      this.allArticles       = [];   // 原始文章副本
      this.filteredArticles  = [];   // 按标题过滤后的文章
      this.keywordHits       = [];   // 新增：命中的关键词条目
      this.init();
    }
  
    init() {
      this.allArticles = this.pg.sourceArticles.map(a => a.cloneNode(true));
      this.bindEvents();
    }
  
    bindEvents() {
      this.searchInput.addEventListener('input', () => this.performSearch());
    }
  
    /* ---------- 核心搜索 ---------- */
    performSearch() {
      const kw = this.searchInput.value.trim().toLowerCase();
      this.clearHighlight();                 // 清掉旧高亮
  
      if (!kw) {
        // 空关键词 → 全部文章
        this.filteredArticles = this.allArticles;
        this.keywordHits      = [];
      } else {
        // 一次性过滤：标题 或 任意关键词里出现即可
        this.filteredArticles = this.allArticles.filter(art => {
          // 1. 标题匹配
          const titleMatch = art.querySelector('h3')
                                .textContent.toLowerCase()
                                .includes(kw);
          // 2. 关键词匹配
          const kwMatch = [...art.querySelectorAll('span.keywords')]
                            .some(span => span.textContent.toLowerCase().includes(kw));
          return titleMatch || kwMatch;
        });
  
        // 如果还想记录“到底是哪些关键词命中了”，可以顺手再扫一遍
        this.keywordHits = [];
        this.filteredArticles.forEach(art =>
          art.querySelectorAll('span.keywords').forEach(span => {
            if (span.textContent.toLowerCase().includes(kw))
              this.keywordHits.push({ articleNode: art, kwNode: span, kwText: span.textContent });
          })
        );
      }
  
      this.updateUI(kw);
      this.rebuildPagination();
  
      // 高亮并滚动到第一个关键词（如果有）
      if (this.keywordHits.length)
        this.highlightKeyword(this.keywordHits[0].kwNode);
    }
  
    /* ---------- UI 更新（保持原逻辑） ---------- */
    updateUI(kw) {
      this.searchTermSpan.textContent = kw;
      this.noResultsBox.style.display =
        (kw && this.filteredArticles.length === 0) ? 'block' : 'none';
  
      if (!kw) {
        this.searchResultsInfo.textContent = '';
      } else {
        this.searchResultsInfo.textContent =
          `找到 ${this.filteredArticles.length} 篇含“${kw}”的文章，`;
      }
    }
  
    /* ---------- 分页重建（保持原逻辑） ---------- */
    rebuildPagination() {
      this.pg.pages.forEach(p => p.remove());
      this.pg.pages = [];
      this.pg.sourceArticles = this.filteredArticles;
      this.pg.totalPages     = Math.ceil(this.filteredArticles.length / this.pg.itemsPerPage);
      this.pg.currentPage    = 1;
      this.pg.createPages();
      this.pg.showPage(1);
    }
  
    /* ---------- 高亮 & 清理 ---------- */
    highlightKeyword(spanNode) {
      spanNode.classList.add('kw-highlight');
      spanNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    clearHighlight() {
      document.querySelectorAll('span.keywords.kw-highlight')
              .forEach(n => n.classList.remove('kw-highlight'));
    }
  }
  
  /* -------------- 启动 -------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const pagination = new SmoothPagination();
    new ArticleSearch(pagination);
  });