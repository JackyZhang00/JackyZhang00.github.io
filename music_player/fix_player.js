(function() {
    const audio = document.getElementById('bgm-audio');
    const playBtn = document.getElementById('play-btn');
    const seekBar = document.getElementById('seek-bar');
    const timeDisplay = document.getElementById('time-display');
    
    // 新增：获取循环按钮
    const loopBtn = document.getElementById('loop-btn');


    // 1. 播放/暂停控制
    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
            playBtn.textContent = '⏸';
        } else {
            audio.pause();
            playBtn.textContent = '▶';
        }
    });

    // --- 新增：循环播放逻辑 ---
    loopBtn.addEventListener('click', () => {
        // 切换 audio 原生的 loop 属性
        audio.loop = !audio.loop;
        
        // 切换按钮的样式（视觉反馈）
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

    // 2. 格式化时间
    const formatTime = (seconds) => {
        if (isNaN(seconds)) return "0:00";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // 3. 加载元数据
    audio.addEventListener('loadedmetadata', () => {
        seekBar.max = Math.floor(audio.duration);
        timeDisplay.textContent = `0:00 / ${formatTime(audio.duration)}`;
    });

    // 4. 进度更新
    audio.addEventListener('timeupdate', () => {
        seekBar.value = Math.floor(audio.currentTime);
        timeDisplay.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
    });

    // 5. 拖动进度条
    seekBar.addEventListener('input', () => {
        audio.currentTime = seekBar.value;
    });
    
    // 6. 播放结束处理
    audio.addEventListener('ended', () => {
        // 注意：当 audio.loop 为 true 时，ended 事件通常不会触发（浏览器会自动重播）
        // 所以这里只需要处理非循环状态下的逻辑
        if (!audio.loop) {
            playBtn.textContent = '▶';
            seekBar.value = 0;
            audio.currentTime = 0;
        }
    });
})();