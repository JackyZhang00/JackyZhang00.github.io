let numbers = [];
let memorizationTimer;
let fillTimer;
let timeRemaining = 120; // 2 minutes for memorization
let fillTime = 180; // 3 minutes to fill in
let score = 0;
let penalties = 0;
let gridSize = 5;
let isGameStarted = false;
let memorizationPhase = true;
let gameEnded = false;

// Initialize the game board
function initGameBoard() {
    const board = document.getElementById('game-board');
    board.innerHTML = '';
    numbers = shuffleArray(Array.from({ length: gridSize * gridSize }, (_, i) => i + 1));

    for (let i = 0; i < gridSize * gridSize; i++) {
        const cell = document.createElement('div');
        cell.textContent = numbers[i];  // Display the number for memorization phase
        cell.setAttribute('data-index', i);
        board.appendChild(cell);
    }
}

// Shuffle array function
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Start the game
function startGame() {
    if (isGameStarted) return;

    // Reset all variables and timers
    isGameStarted = true;
    memorizationPhase = true;
    timeRemaining = 120; // Reset memorization timer to 2 minutes
    fillTime = 180; // Reset fill timer to 3 minutes
    score = 0;
    penalties = 0;
    gameEnded = false;

    document.getElementById('score-value').textContent = score;
    document.getElementById('penalty').textContent = '';
    
    clearInterval(memorizationTimer); // Clear any previous memorization timer
    clearInterval(fillTimer); // Clear any previous fill timer

    initGameBoard(); // Reinitialize the game board with random numbers
    startMemorizationTimer(); // Start the memorization timer
}

// Start the memorization timer
function startMemorizationTimer() {
    memorizationTimer = setInterval(() => {
        if (timeRemaining > 0) {
            document.getElementById('time-remaining').textContent = timeRemaining;
            timeRemaining--;
        } else {
            clearInterval(memorizationTimer);
            hideNumbers();
            memorizationPhase = false;
            startFillTimer();
        }
    }, 1000);
}

// Hide numbers after memorization phase and show input fields
function hideNumbers() {
    const cells = document.querySelectorAll('#game-board div');
    cells.forEach(cell => {
        const input = document.createElement('input');
        input.type = 'text';
        input.maxLength = 2;
        input.addEventListener('keydown', handleEnterKey);
        cell.innerHTML = '';  // Clear the previous number
        cell.appendChild(input);  // Add input field for user to type
        cell.classList.add('hidden');
    });
}

// Handle Enter key to confirm input
function handleEnterKey(e) {
    if (e.key === 'Enter') {
        handleSingleCellConfirm(e.target);  // Only confirm the current input field
    }
}

// Handle single cell input confirmation
function handleSingleCellConfirm(input) {
    if (gameEnded) return;
    
    const cell = input.parentElement;
    const index = cell.getAttribute('data-index');
    const inputValue = parseInt(input.value);

    // If the input is correct
    if (inputValue === numbers[index]) {
        input.disabled = true;  // Disable the input field
        input.style.borderColor = 'green';  // Set border color to green
        input.style.borderWidth = '4px';    // Make border thicker for emphasis
        input.style.backgroundColor = 'lightgreen';  // Change background to light green
        score++;
        document.getElementById('score-value').textContent = score;
    } else {
        // If the input is wrong
        applyPenalty();  // Apply penalty for wrong input
        input.style.borderColor = 'red';  // Set border color to red
        input.style.borderWidth = '4px';    // Make border thicker for emphasis
        input.style.backgroundColor = 'lightcoral';  // Change background to light red
        setTimeout(() => {
            input.style.borderColor = '';  // Reset border color after flash
            input.style.borderWidth = '';  // Reset border width
            input.style.backgroundColor = '';  // Reset background color
            input.value = '';  // Clear input field after wrong input
        }, 500);  // Flash red for 500ms (increase for more emphasis)
    }

    // Check if all inputs are completed
    checkGameEndCondition();
}

// Apply a 5-second penalty only when input is wrong
function applyPenalty() {
    fillTime -= 5;  // Subtract 5 seconds for each wrong input
    penalties++;
    document.getElementById('penalty').textContent = `罚时: -${penalties * 5}秒 (总罚时: ${penalties * 5}秒)`;
}

// Check if all inputs are completed or time is over
function checkGameEndCondition() {
    const cells = document.querySelectorAll('#game-board div input');
    let allCompleted = true;

    cells.forEach(input => {
        if (input.value === '' || !input.disabled) {
            allCompleted = false;  // If any input is empty or not disabled, game is not over
        }
    });

    if (allCompleted) {
        gameEnded = true;
        endGame(true);  // End game when all inputs are completed
    }
}

// Start the fill phase timer
function startFillTimer() {
    document.getElementById('time-remaining').textContent = fillTime;
    fillTimer = setInterval(() => {
        if (fillTime > 0) {
            document.getElementById('time-remaining').textContent = fillTime;
            fillTime--;
        } else {
            clearInterval(fillTimer);
            showAnswers();  // End game due to timeout and show answers
        }
    }, 1000);
}

// Show all correct answers after time is up
function showAnswers() {
    const cells = document.querySelectorAll('#game-board div input');
    cells.forEach((input, index) => {
        if (!input.disabled || input.value === '') {  // If not disabled or empty (even with cursor)
            input.value = numbers[index];  // Show correct answer
            input.style.backgroundColor = 'lightgray';  // Set background to light gray for correct answers
            input.disabled = true;  // Disable the input
        }
    });
    endGame(false);  // Game over
}

// End the game
function endGame(success) {
    let message = success ? `恭喜！你成功完成了游戏，得分: ${score}` : `时间结束! 正确答案已显示，得分: ${score}`;
    alert(message);
    // resetGame();
}

// Reset game state
function resetGame() {
    isGameStarted = false;
    document.getElementById('game-board').innerHTML = '';
    document.getElementById('time-remaining').textContent = '120';
    document.getElementById('score-value').textContent = '0';
    document.getElementById('penalty').textContent = '';
}

// Add event listener to start and confirm button
document.getElementById('start-button').addEventListener('click', startGame);
document.getElementById('confirm-button').addEventListener('click', () => {
    // Check each active input field when "确认" button is clicked
    const inputs = document.querySelectorAll('#game-board div input');
    inputs.forEach(input => {
        if (!input.disabled && input.value !== '') {  // Only check non-disabled inputs with values
            handleSingleCellConfirm(input);
        }
    });
});
