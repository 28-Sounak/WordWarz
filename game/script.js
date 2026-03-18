// ─── SOCKET SETUP ────────────────────────────────────────────────────────────
const socket = io();


// ─── SOCKET LISTENERS ────────────────────────────────────────────────────────

// Host: room created → save to localStorage and go to game
socket.on("roomCreated", (data) => {
    localStorage.setItem("roomCode", data.roomCode);
    localStorage.setItem("playerName", data.playerName);
    localStorage.setItem("isHost", "true");
    window.location.href = "game1.html";
});

// Member step 1: room code valid → ask for name then join
socket.on("roomValid", ({ roomCode }) => {
    const playerName = prompt("Enter your name:");
    if (!playerName?.trim()) return;
    socket.emit("joinRoom", { roomCode, playerName: playerName.trim() });
});

// Member step 2: joined → save and redirect
socket.on("roomJoined", (data) => {
    if (window.location.href.includes("game1.html")) {
        // Rejoining mid-game — sync state
        if (data.gameSync) {
            const { scores, question, round, totalRounds, timeLeft } = data.gameSync;
            updateScoreboard(scores);
            const questionEl = document.getElementById("question");
            if (questionEl) questionEl.textContent = question;
            updateRoundDisplay(round, totalRounds);
            startClientTimer(timeLeft);
        }
        return;
    }
    localStorage.setItem("roomCode", data.roomCode);
    localStorage.setItem("playerName", data.playerName);
    localStorage.setItem("isHost", data.isHost ? "true" : "false");
    window.location.href = "game1.html";
});

// Any server error → show as alert
socket.on("errorMessage", (msg) => {
    alert(msg);
});

// Scoreboard update
socket.on("updateScoreboard", (players) => {
    const display = document.getElementById("playerCountDisplay");
    if (display) {
        const connected = players.filter(p => p.connected !== false).length;
        display.textContent = "Players: " + connected + "/4";
    }
    updateScoreboard(players);
});

// Player events
socket.on("playerJoined", ({ name, playerCount }) => {
    const display = document.getElementById("playerCountDisplay");
    if (display) display.textContent = "Players: " + playerCount + "/4";
});

socket.on("playerDisconnected", ({ name }) => {
    console.log(name + " disconnected.");
});

socket.on("playerLeft", ({ name }) => {
    console.log(name + " left the room.");
});

socket.on("playerReconnected", ({ name }) => {
    console.log(name + " reconnected.");
});

socket.on("hostChanged", ({ newHost }) => {
    const playerName = localStorage.getItem("playerName");
    if (playerName === newHost) {
        localStorage.setItem("isHost", "true");
        alert("The host left. You are now the host!");
        showStartButton(); // reveal start button for new host
    }
});

// Reconnect: re-announce this player if socket drops and comes back
socket.on("connect", () => {
    const roomCode = localStorage.getItem("roomCode");
    const playerName = localStorage.getItem("playerName");
    if (roomCode && playerName && window.location.href.includes("game1.html")) {
        socket.emit("rejoinRoom", { roomCode, playerName });
    }
});

// Guess result events
socket.on("guess:correct", () => {
    const input = document.getElementById("answerInput");
    if (input) input.value = "";
    showFeedback("✅ Correct!", "green");
    setInputLocked(true);
});

socket.on("guess:wrong", () => {
    showFeedback("❌ Wrong answer!", "red");
});

socket.on("player:guessed", ({ name }) => {
    showFeedback(name + " got it right!", "#888");
});

// Game start
socket.on("game:start", () => {
    const startBtn = document.getElementById("startGame");
    if (startBtn) startBtn.style.display = "none";

    const waitingMsg = document.getElementById("waitingMessage");
    if (waitingMsg) waitingMsg.style.display = "none";

    setInputLocked(false);
});

// Round start
socket.on("round:start", ({ round, totalRounds, question, timeLeft }) => {
    const questionEl = document.getElementById("question");
    if (questionEl) questionEl.textContent = question;

    updateRoundDisplay(round, totalRounds);
    startClientTimer(timeLeft);
    setInputLocked(false);
    clearFeedback();

    const input = document.getElementById("answerInput");
    if (input) input.value = "";
});

// Round end
socket.on("round:end", ({ word, scores, roundsLeft }) => {
    clearClientTimer();
    updateScoreboard(scores);
    setInputLocked(true);
    showFeedback("Round over! The word was: " + word, "#333");
    updateRoundDisplay(null, null, roundsLeft);
});

// Game end
socket.on("game:end", ({ scores }) => {
    clearClientTimer();
    updateScoreboard(scores);
    setInputLocked(true);

    const questionEl = document.getElementById("question");
    if (questionEl) questionEl.textContent = "Game Over!";

    const roundDisplay = document.getElementById("roundDisplay");
    if (roundDisplay) roundDisplay.textContent = "";

    showFeedback("🏆 Game over! Final scores above.", "gold");
});


// ─── DOM READY ───────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", function () {

    // =========================================
    // INDEX PAGE (index.html)
    // =========================================

    const singleBtn = document.getElementById("single");
    const multiBtn = document.getElementById("multi");

    if (singleBtn) {
        singleBtn.addEventListener("click", function () {
            alert("AI Mode Coming Soon!");
        });
    }

    if (multiBtn) {
        multiBtn.addEventListener("click", function () {
            window.location.href = "friends.html";
        });
    }


    // =========================================
    // FRIENDS PAGE (friends.html)
    // =========================================

    const createBtn = document.getElementById("create");
    const joinBtn = document.getElementById("join");

    if (createBtn) {
        createBtn.addEventListener("click", function () {
            const playerName = prompt("Enter your name:");
            if (!playerName?.trim()) return;
            socket.emit("createRoom", playerName.trim());
        });
    }

    if (joinBtn) {
        joinBtn.addEventListener("click", function () {
            const code = prompt("Enter Room Code:");
            if (!code?.trim()) return;
            socket.emit("validateRoom", code.trim().toUpperCase());
        });
    }


    // =========================================
    // GAME PAGE (game1.html)
    // =========================================

    const roomDisplay = document.getElementById("roomDisplay");

    if (roomDisplay) {
        const roomCode = localStorage.getItem("roomCode");
        if (!roomCode) {
            window.location.href = "friends.html";
            return;
        }

        roomDisplay.textContent = "Room Code: " + roomCode;

        // Show start button only to host, and only while waiting
        const isHost = localStorage.getItem("isHost") === "true";
        if (isHost) showStartButton();
    }

    // Start game button
    const startBtn = document.getElementById("startGame");
    if (startBtn) {
        startBtn.addEventListener("click", () => {
            const roomCode = localStorage.getItem("roomCode");
            socket.emit("startGame", { roomCode });
        });
    }

    // Answer submission
    const submitBtn = document.getElementById("submitAnswer");
    if (submitBtn) {
        submitBtn.addEventListener("click", submitGuess);
    }

    // Allow pressing Enter to submit
    const answerInput = document.getElementById("answerInput");
    if (answerInput) {
        answerInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") submitGuess();
        });
    }

    // Lock input until game starts
    setInputLocked(true);
});


// ─── GAME HELPERS ─────────────────────────────────────────────────────────────

function submitGuess() {
    const roomCode = localStorage.getItem("roomCode");
    const input = document.getElementById("answerInput");
    if (!input) return;
    const userAnswer = input.value.trim().toUpperCase();
    if (!userAnswer) return;
    socket.emit("guess:submit", { roomCode, guess: userAnswer });
}

function showStartButton() {
    const startBtn = document.getElementById("startGame");
    if (startBtn) startBtn.style.display = "inline-block";

    const waitingMsg = document.getElementById("waitingMessage");
    if (waitingMsg) waitingMsg.style.display = "block";
}

function setInputLocked(locked) {
    const input = document.getElementById("answerInput");
    const btn = document.getElementById("submitAnswer");
    if (input) input.disabled = locked;
    if (btn) btn.disabled = locked;
}

function showFeedback(msg, color) {
    const el = document.getElementById("feedback");
    if (!el) return;
    el.textContent = msg;
    el.style.color = color || "#333";
}

function clearFeedback() {
    const el = document.getElementById("feedback");
    if (el) el.textContent = "";
}

function updateRoundDisplay(round, total, roundsLeft) {
    const el = document.getElementById("roundDisplay");
    if (!el) return;
    if (round && total) {
        el.textContent = "Round " + round + " of " + total;
    } else if (roundsLeft !== undefined) {
        el.textContent = roundsLeft > 0
            ? "Next round in 5s... (" + roundsLeft + " left)"
            : "Last round finished!";
    }
}

// ─── CLIENT-SIDE COUNTDOWN TIMER ─────────────────────────────────────────────

let clientTimerInterval = null;

function startClientTimer(durationMs) {
    clearClientTimer();
    const timerEl = document.getElementById("timer");
    if (!timerEl) return;

    let remaining = Math.max(0, Math.floor(durationMs / 1000));
    timerEl.textContent = "⏱ " + remaining + "s";

    clientTimerInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            timerEl.textContent = "⏱ 0s";
            clearClientTimer();
        } else {
            timerEl.textContent = "⏱ " + remaining + "s";
        }
    }, 1000);
}

function clearClientTimer() {
    if (clientTimerInterval) {
        clearInterval(clientTimerInterval);
        clientTimerInterval = null;
    }
    const timerEl = document.getElementById("timer");
    if (timerEl) timerEl.textContent = "";
}


// ─── SCOREBOARD ───────────────────────────────────────────────────────────────

function updateScoreboard(players) {
    const table = document.getElementById("scoreboard");
    if (!table) return;

    const myName = localStorage.getItem("playerName");

    table.innerHTML = `
        <tr>
            <th>Player</th>
            <th>Score</th>
        </tr>
    `;

    players.forEach(player => {
        const row = document.createElement("tr");

        if (player.name === myName) {
            row.style.background = "lightgreen";
        }
        if (player.connected === false) {
            row.style.opacity = "0.4";
        }

        row.innerHTML = `
            <td>${player.name}${player.connected === false ? " (offline)" : ""}</td>
            <td>${player.score}</td>
        `;

        table.appendChild(row);
    });
}