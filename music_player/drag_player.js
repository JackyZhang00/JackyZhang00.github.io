(function() {
    // 1. 获取所有元素 (修复：补上了 loopBtn)
    const player = document.getElementById('draggable-player');
    const handle = document.getElementById('drag-handle');
    const audio = document.getElementById('bgm-audio');
    const playBtn = document.getElementById('play-btn');
    const seekBar = document.getElementById('seek-bar');
    const timeDisplay = document.getElementById('time-display');
    const loopBtn = document.getElementById('loop-btn'); // 之前漏了这个

    // 状态标记：是否正在拖拽进度条
    let isSeeking = false; 

    // --- 1. 播放器窗口拖动功能 ---
    let isDraggingWindow = false;
    let startX, startY, initialLeft, initialTop;

    const startDragWindow = (e) => {
        // 防止点击内部控件时触发窗口拖动
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
        
        isDraggingWindow = true;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        startX = clientX;
        startY = clientY;
        
        const rect = player.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        
        player.style.bottom = 'auto';
        player.style.right = 'auto';
        player.style.left = `${initialLeft}px`;
        player.style.top = `${initialTop}px`;
    };

    const onDragWindow = (e) => {
        if (!isDraggingWindow) return;
        e.preventDefault(); 
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        
        player.style.left = `${initialLeft + (clientX - startX)}px`;
        player.style.top = `${initialTop + (clientY - startY)}px`;
    };

    const stopDragWindow = () => {
        isDraggingWindow = false;
    };

    handle.addEventListener('mousedown', startDragWindow);
    document.addEventListener('mousemove', onDragWindow);
    document.addEventListener('mouseup', stopDragWindow);
    
    handle.addEventListener('touchstart', startDragWindow);
    document.addEventListener('touchmove', onDragWindow, { passive: false });
    document.addEventListener('touchend', stopDragWindow);


    // --- 2. 播放控制 ---
    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playBtn.textContent = '⏸';
        } else {
            audio.pause();
            playBtn.textContent = '▶';
        }
    });

    // --- 3. 循环控制 ---
    if (loopBtn) { // 加个判断防止报错
        // 初始化颜色状态
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

    // --- 4. 进度条与时间 (核心修复部分) ---
    const formatTime = (seconds) => {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // 加载总时长
    audio.addEventListener('loadedmetadata', () => {
        seekBar.max = Math.floor(audio.duration);
        timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    });

    // 监听：开始拖拽进度条 (按下鼠标)
    const startSeeking = () => { isSeeking = true; };
    // 监听：结束拖拽进度条 (松开鼠标)
    const endSeeking = () => { isSeeking = false; };

    seekBar.addEventListener('mousedown', startSeeking);
    seekBar.addEventListener('touchstart', startSeeking);
    seekBar.addEventListener('mouseup', endSeeking);
    seekBar.addEventListener('touchend', endSeeking);

    // 实时更新 (播放时自动走)
    audio.addEventListener('timeupdate', () => {
        // 【关键修复】只有当用户没有在拖拽进度条时，才自动更新进度条位置
        if (!isSeeking) {
            seekBar.value = Math.floor(audio.currentTime);
        }
        // 时间文字总是要更新的
        timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration || 0)}`;
    });

    // 用户拖动进度条 (手动改变进度)
    seekBar.addEventListener('input', () => {
        // 这里可以决定是拖动时实时改变声音，还是拖完再改变
        // 实时改变声音：
        audio.currentTime = seekBar.value;
        // 实时更新文字
        timeDisplay.textContent = `${formatTime(seekBar.value)} / ${formatTime(audio.duration || 0)}`;
    });
    
    // 播放结束处理
    audio.addEventListener('ended', () => {
        if (!audio.loop) {
            playBtn.textContent = '▶';
            seekBar.value = 0;
            // audio.currentTime = 0; // 可选：是否自动回到开头
        }
    });
})();