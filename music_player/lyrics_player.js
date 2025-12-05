(function() {
    // 1. 获取元素
    const audio = document.getElementById('bgm-audio');
    const playBtn = document.getElementById('play-btn');
    const seekBar = document.getElementById('seek-bar');
    const timeDisplay = document.getElementById('time-display');
    const loopBtn = document.getElementById('loop-btn');
    const lyricsList = document.getElementById('lyrics-list');

    // 状态变量
    let lyricsData = [];
    let currentLineIndex = -1;
    const lineHeight = 28; // 对应 CSS li高度

    // --- 2. 歌词功能函数 ---

    // 解析 LRC
    const parseLrc = (text) => {
        const lines = text.split('\n');
        const result = [];
        const timeReg = /\[(\d{2}):(\d{2})(\.\d{2,3})?\]/;
        
        for (let line of lines) {
            const match = timeReg.exec(line);
            if (match) {
                const minutes = parseInt(match[1]);
                const seconds = parseInt(match[2]);
                const milliseconds = match[3] ? parseFloat(match[3]) : 0;
                const time = minutes * 60 + seconds + milliseconds;
                const textContent = line.replace(timeReg, '').trim();
                if (textContent) result.push({ time, text: textContent });
            }
        }
        result.sort((a, b) => a.time - b.time);
        return result;
    };

    // 渲染歌词
    const renderLyrics = (data) => {
        lyricsList.innerHTML = '';
        if (data.length === 0) {
            lyricsList.innerHTML = '<li>暂无歌词</li>';
            return;
        }
        const fragment = document.createDocumentFragment();
        data.forEach(line => {
            const li = document.createElement('li');
            li.textContent = line.text;
            fragment.appendChild(li);
        });
        lyricsList.appendChild(fragment);
    };

    // 【核心修改】加载歌词逻辑
    const loadLyrics = () => {
        // 1. 从 HTML 标签获取 lrc 路径
        const lrcUrl = audio.getAttribute('data-lrc');

        // 如果 HTML 里没有写 data-lrc，或者为空
        if (!lrcUrl) {
            lyricsList.innerHTML = '';
            return;
        }

        lyricsList.innerHTML = '<li>歌词加载中...</li>';

        // 2. 发起请求获取文件内容
        fetch(lrcUrl)
            .then(response => {
                if (!response.ok) throw new Error('网络错误');
                return response.text();
            })
            .then(text => {
                lyricsData = parseLrc(text);
                renderLyrics(lyricsData);
            })
            .catch(err => {
                console.error('加载失败:', err);
                // 提示用户可能的原因（跨域或路径错误）
                lyricsList.innerHTML = '<li>歌词加载失败</li>';
            });
    };

    // --- 3. 初始化与事件绑定 ---

    // 启动时加载
    loadLyrics();

    // 播放控制
    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playBtn.textContent = '⏸';
        } else {
            audio.pause();
            playBtn.textContent = '▶';
        }
    });

    // 循环控制
    if (loopBtn) {
        if(audio.loop) loopBtn.classList.add('active-loop');
        loopBtn.addEventListener('click', () => {
            audio.loop = !audio.loop;
            if (audio.loop) {
                loopBtn.classList.add('active-loop');
                loopBtn.textContent = "循环中"
                loopBtn.title = "关闭循环";
            } else {
                loopBtn.classList.remove('active-loop');
                loopBtn.textContent = "不循环"
                loopBtn.title = "开启循环";
            }
        });
    }

    // 时间显示辅助
    const formatTime = (s) => {
        if (isNaN(s)) return "0:00";
        return `${Math.floor(s/60)}:${Math.floor(s%60).toString().padStart(2,'0')}`;
    };

    // 元数据加载
    audio.addEventListener('loadedmetadata', () => {
        seekBar.max = Math.floor(audio.duration);
        timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    });

    // 进度条拖拽优化
    let isSeeking = false;
    seekBar.addEventListener('mousedown', () => isSeeking = true);
    seekBar.addEventListener('touchstart', () => isSeeking = true);
    seekBar.addEventListener('mouseup', () => isSeeking = false);
    seekBar.addEventListener('touchend', () => isSeeking = false);
    
    seekBar.addEventListener('input', () => {
        audio.currentTime = seekBar.value;
        timeDisplay.textContent = `${formatTime(seekBar.value)} / ${formatTime(audio.duration || 0)}`;
    });

    // 实时更新逻辑
    audio.addEventListener('timeupdate', () => {
        const currentTime = audio.currentTime;
        if (!isSeeking) seekBar.value = Math.floor(currentTime);
        timeDisplay.textContent = `${formatTime(currentTime)} / ${formatTime(audio.duration)}`;

        // 歌词滚动
        if (lyricsData.length > 0) {
            let activeIndex = lyricsData.findIndex(line => line.time > currentTime) - 1;
            if (activeIndex < 0) {
                 if (currentTime > lyricsData[lyricsData.length-1].time) {
                     activeIndex = lyricsData.length - 1;
                 } else {
                     activeIndex = 0;
                 }
            }

            if (activeIndex !== currentLineIndex) {
                currentLineIndex = activeIndex;
                const items = lyricsList.querySelectorAll('li');
                items.forEach(li => li.classList.remove('active'));
                if (items[currentLineIndex]) {
                    items[currentLineIndex].classList.add('active');
                }
                // 120是容器高度
                const offset = (currentLineIndex * lineHeight) - (120 / 2) + (lineHeight / 2);
                lyricsList.style.transform = `translateY(-${Math.max(0, offset)}px)`;
            }
        }
    });

    audio.addEventListener('ended', () => {
        if (!audio.loop) {
            playBtn.textContent = '▶';
            seekBar.value = 0;
            lyricsList.style.transform = 'translateY(0)';
            currentLineIndex = -1;
            lyricsList.querySelectorAll('li').forEach(li => li.classList.remove('active'));
        }
    });
})();