const board = document.getElementById("game-board");
const startButton = document.getElementById("start-button");
const result = document.getElementById("result");

let numbers = [];
let currentNumber = 1;
let startTime, endTime;

function getRandomPosition() {
    const x = Math.floor(Math.random() * (board.clientWidth - 50));
    const y = Math.floor(Math.random() * (board.clientHeight - 50));
    return { x, y };
}

function generateNumbers() {
    numbers = [];
    for (let i = 1; i <= 20; i++) {  // 生成10个随机数字
        numbers.push(i);
    }
    numbers.sort(() => Math.random() - 0.5);  // 随机排序
}

function displayNumbers() {
    board.innerHTML = "";
    generateNumbers();
    numbers.forEach(number => {
        const div = document.createElement("div");
        div.classList.add("number");
        div.textContent = number;
        const position = getRandomPosition();
        div.style.left = `${position.x}px`;
        div.style.top = `${position.y}px`;
        div.onclick = () => numberClicked(number, div);
        board.appendChild(div);
    });
}

function numberClicked(number, div) {
    if (number === currentNumber) {
        div.remove();
        currentNumber++;
        if (currentNumber > numbers.length) {
            endTime = new Date();
            const timeTaken = (endTime - startTime) / 1000;
            result.textContent = `你完成了！用时 ${timeTaken} 秒!`;
        }
    }
}

startButton.addEventListener("click", () => {
    currentNumber = 1;
    result.textContent = "";
    startTime = new Date();
    displayNumbers();
});
