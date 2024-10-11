let playerLife = 5;
let aiLife = 5;
let playerDices = [];
let aiDices = [];
let beforeCall = {count: 1, value: 1}; // 记录之前的叫点，质疑后会重置为初始值
let currentTurn = 'user'; // 记录当前的回合
let totalDices;

class Player {
    constructor(life) {
        this.life = life;
        this.dices = [];
    }

    roll() {
        this.dices = [];
        for (let i = 0; i < 5; i++) {
            this.dices.push(Math.floor(Math.random() * 6) + 1);
        }
    }

    decreaseLife() {
        this.life--;
    }

    getLife() {
        return this.life;
    }

    getDices() {
        return this.dices;
    }
}

// 初始化游戏数据
let user = new Player(playerLife);
let ai = new Player(aiLife);
let difficult = parseFloat(prompt("请输入AI难度(0-1)，其中0表示最简单，1表示最难:"));
if (difficult < 0 || difficult > 1) {
    while(difficult < 0 || difficult > 1) {
        alert("难度不符合要求，请重新输入");
        difficult = parseFloat(prompt("请输入AI难度(0-1)，其中0表示最简单，1表示最难:"));
    }
}

// 所有玩家掷骰子
function rollDices() {
    user.roll();
    ai.roll();
    document.getElementById("playerDices").textContent = user.getDices().join(', ');
    resetLogAction();
    logAction("你和AI都掷出了骰子。");
}

// 检查叫点是否合规
function check(before, after) {
    if (after.count > before.count || (after.count === before.count && after.value > before.value)) {
        return true;
    }
    return false;
}

// 用户叫点
function userCall() {
    let count = parseInt(prompt("请输入你叫的数量:"));
    let value = parseInt(prompt("请输入你叫的骰子点数 (2-6):"));
    let userCall = {count, value};

    // 检查叫点是否合规
    if (!check(beforeCall, userCall)) {
        logAction("叫点不符合规则，请重新叫点！");
        return;
    }

    beforeCall = userCall;
    logAction(`你叫了 ${count} 个 ${value}`);
    currentTurn = 'ai';
    if (Math.random() < difficult) {
        aiTurn();
    } else{
        falseAiTurn();
    }
}

// 用户质疑
function userChallenge() {
    logAction("【你质疑了AI的叫点！】");
    showAllDices(); // 公开所有玩家的骰子
    const total = countCorrectedDices()[beforeCall.value] || 0;
    checkChallengeResult(total);
    resetCall(); // 重置叫点
    currentTurn = 'user';
}

// AI的错误策略选择
function falseAiTurn() {
    let aiCall;
    const totalDicesForAiCall = countCorrectedDices();
    const likelySuccess = totalDicesForAiCall[beforeCall.value] || 0;

    if (likelySuccess <= beforeCall.count && beforeCall.count != 10) {
        // AI 叫点
        aiCall = {count:beforeCall.count+1,value:beforeCall.value};
        likelySuccessAfter = totalDicesForAiCall[aiCall.value];
        beforeCall = aiCall;
        logAction(`AI 叫了 ${aiCall.count} 个 ${aiCall.value}`);
        currentTurn = 'user';
    } else {
        // AI 选择质疑
        logAction("【AI 质疑了你的叫点！】");
        showAllDices(); // 公开所有玩家的骰子
        const total = countCorrectedDices()[beforeCall.value] || 0;
        checkChallengeResult(total);
        resetCall(); // 重置叫点
        currentTurn = 'user';
    }
}

// AI的策略选择
function aiTurn() {
    let aiCall;
    const totalDicesForAiCall = countCorrectedDices();
    const likelySuccess = totalDicesForAiCall[beforeCall.value] || 0;

    // if (likelySuccess > beforeCall.count || Math.random() > 0.6) {
    //     // AI 叫点
    //     aiCall = getRandomCall(totalDicesForAiCall);
    //     while (!check(beforeCall, aiCall)) {
    //         aiCall = getRandomCall(totalDicesForAiCall);
    //     }
    //     beforeCall = aiCall;
    //     logAction(`AI 叫了 ${aiCall.count} 个 ${aiCall.value}`);
    //     currentTurn = 'user';
    // } else {
    //     // AI 选择质疑
    //     logAction("AI 质疑了你的叫点！");
    //     showAllDices(); // 公开所有玩家的骰子
    //     const total = countCorrectedDices()[beforeCall.value] || 0;
    //     checkChallengeResult(total);
    //     resetCall(); // 重置叫点
    //     currentTurn = 'user';
    // }

    if (likelySuccess > beforeCall.count) {
        // AI 叫点
        aiCall = getRandomCall(totalDicesForAiCall);
        likelySuccessAfter = totalDicesForAiCall[aiCall.value];
        while ((!check(beforeCall, aiCall)) || likelySuccessAfter < aiCall.count) {
            aiCall = getRandomCall(totalDicesForAiCall);
            likelySuccessAfter = totalDicesForAiCall[aiCall.value];
        }
        beforeCall = aiCall;
        logAction(`AI 叫了 ${aiCall.count} 个 ${aiCall.value}`);
        currentTurn = 'user';
    } else {
        // AI 选择质疑
        logAction("【AI 质疑了你的叫点！】");
        showAllDices(); // 公开所有玩家的骰子
        const total = countCorrectedDices()[beforeCall.value] || 0;
        checkChallengeResult(total);
        resetCall(); // 重置叫点
        currentTurn = 'user';
    }
}

// 显示所有玩家的骰子
function showAllDices() {
    logAction("所有玩家的骰子：");
    logAction("你的骰子: " + user.getDices().join(', '));
    logAction("AI的骰子: " + ai.getDices().join(', '));
}

// 检查质疑结果
function checkChallengeResult(total) {
    if (beforeCall.count > total) {
        logAction(`质疑成功！共计 ${total} 个 ${beforeCall.value}`);
        logAction(`---------------------`);
        if (currentTurn === 'user') {
            ai.decreaseLife();
            document.getElementById("aiLife").textContent = ai.getLife();
        } else {
            user.decreaseLife();
            document.getElementById("playerLife").textContent = user.getLife();
        }
    } else {
        logAction(`质疑失败！共计 ${total} 个 ${beforeCall.value}`);
        logAction(`---------------------`);
        if (currentTurn === 'user') {
            user.decreaseLife();
            document.getElementById("playerLife").textContent = user.getLife();
        } else {
            ai.decreaseLife();
            document.getElementById("aiLife").textContent = ai.getLife();
        }
    }
    checkGameOver();
}

// 统计骰子点数，其中1可以代替2-6
function countCorrectedDices() {
    totalDices = {};
    [...user.getDices(), ...ai.getDices()].forEach(dice => {
        if (!totalDices[dice]) {
            totalDices[dice] = 0;
        }
        totalDices[dice]++;
    });

    // 修正1可以代替任意骰子点数
    let correctedDices = {...totalDices};
    if (totalDices[1]) {
        for (let i = 2; i <= 6; i++) {
            correctedDices[i] = (correctedDices[i] || 0) + totalDices[1];
        }
    }

    return correctedDices;
}

// 随机生成AI叫点，考虑1点可以代替其他点
function getRandomCall(totalDicesForAiCall) {
    let diceValue = Math.floor(Math.random() * 5) + 2; // 2到6之间
    let diceCount = Math.floor(Math.random() * 10) + 1; // 1到10之间
    return {count: diceCount, value: diceValue};
}

// 检查游戏是否结束
function checkGameOver() {
    if (user.getLife() <= 0) {
        logAction("游戏结束，AI 获胜！");
        disableButtons();
    } else if (ai.getLife() <= 0) {
        logAction("游戏结束，你获胜！");
        disableButtons();
    }
}

// 重置叫点为初始值 (1, 1)
function resetCall() {
    beforeCall = {count: 1, value: 1};
    // logAction("叫点已重置为初始值（1个1）。");
}

// 禁用按钮
function disableButtons() {
    document.querySelector("button[onclick='rollDices()']").disabled = true;
    document.querySelector("button[onclick='userCall()']").disabled = true;
    document.querySelector("button[onclick='userChallenge()']").disabled = true;
}

// 游戏日志
function logAction(action) {
    const log = document.getElementById("logText");
    log.innerHTML += "<br>" + action;
}

// 重置日志
function resetLogAction() {
    const log = document.getElementById("logText");
    log.innerHTML = "游戏日志："
    log.innerHTML += "<br>";
}