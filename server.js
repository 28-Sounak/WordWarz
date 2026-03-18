const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static("game"));

let rooms = {};

// ─── QUESTION BANK ───────────────────────────────────────────────────────────

const questions = require("./questions");


function getRandomQuestion() {
    return questions[Math.floor(Math.random() * questions.length)];
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateRoomCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do {
        code = Array.from({ length: 6 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join("");
    } while (rooms[code]);
    return code;
}

function buildPlayerList(room) {
    return room.players.map(p => ({
        id: p.id,
        name: p.name,
        score: p.score,
        connected: p.connected,
    }));
}

function buildScoreSnapshot(room) {
    return [...room.players]
        .sort((a, b) => b.score - a.score)
        .map(p => ({ name: p.name, score: p.score, connected: p.connected }));
}

function findRoomBySocketId(socketId) {
    for (const [roomCode, room] of Object.entries(rooms)) {
        if (room.players.some(p => p.id === socketId)) {
            return { roomCode, room };
        }
    }
    return null;
}

// ─── ROUND LOGIC ─────────────────────────────────────────────────────────────

const TOTAL_ROUNDS = 5;
const ROUND_DURATION_MS = 30000; // 30 seconds per round

function startNextRound(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;

    // End game if all rounds done
    if (room.round && room.round.current >= room.round.total) {
        room.status = "finished";
        io.to(roomCode).emit("game:end", { scores: buildScoreSnapshot(room) });
        return;
    }

    // Clear any previous round timer
    if (room.roundTimer) clearTimeout(room.roundTimer);

    const q = getRandomQuestion();
    const roundNumber = room.round ? room.round.current + 1 : 1;

    room.round = {
        current: roundNumber,
        total: TOTAL_ROUNDS,
        question: q.question,
        answer: q.answer,
        endsAt: Date.now() + ROUND_DURATION_MS,
        guessedPlayers: [], // track who already guessed correctly this round
    };

    // Send question to all players
    io.to(roomCode).emit("round:start", {
        round: roundNumber,
        totalRounds: TOTAL_ROUNDS,
        question: q.question,
        timeLeft: ROUND_DURATION_MS,
    });

    // Auto-end round after timer
    room.roundTimer = setTimeout(() => {
        endRound(roomCode);
    }, ROUND_DURATION_MS);
}

function endRound(roomCode) {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    clearTimeout(room.roundTimer);

    const roundsLeft = room.round.total - room.round.current;

    io.to(roomCode).emit("round:end", {
        word: room.round.answer,
        scores: buildScoreSnapshot(room),
        roundsLeft,
    });

    // Start next round after a 5-second break
    if (roundsLeft > 0) {
        setTimeout(() => startNextRound(roomCode), 5000);
    } else {
        room.status = "finished";
        io.to(roomCode).emit("game:end", { scores: buildScoreSnapshot(room) });
    }
}

// ─── SOCKET EVENTS ──────────────────────────────────────────────────────────

io.on("connection", (socket) => {

    console.log("Player connected:", socket.id);

    // ── CREATE ROOM ──────────────────────────────────────────────────────────
    socket.on("createRoom", (playerName) => {
        if (!playerName?.trim()) {
            return socket.emit("errorMessage", "Name is required.");
        }

        const roomCode = generateRoomCode();

        rooms[roomCode] = {
            host: socket.id,
            hostName: playerName.trim(),
            status: "waiting",
            players: [],
            round: null,
            roundTimer: null,
        };

        rooms[roomCode].players.push({
            id: socket.id,
            name: playerName.trim(),
            score: 0,
            connected: true,
        });

        socket.join(roomCode);

        socket.emit("roomCreated", {
            roomCode,
            playerName: playerName.trim(),
            isHost: true,
        });

        io.to(roomCode).emit("updateScoreboard", buildPlayerList(rooms[roomCode]));
    });

    // ── VALIDATE ROOM CODE ───────────────────────────────────────────────────
    socket.on("validateRoom", (roomCode) => {
        const code = roomCode?.trim().toUpperCase();
        const room = rooms[code];

        if (!room) return socket.emit("errorMessage", "Room not found. Check your code.");
        if (room.status !== "waiting") return socket.emit("errorMessage", "Game already in progress.");
        if (room.players.length >= 4) return socket.emit("errorMessage", "Room is full (max 4 players).");

        socket.emit("roomValid", { roomCode: code });
    });

    // ── JOIN ROOM ────────────────────────────────────────────────────────────
    socket.on("joinRoom", ({ roomCode, playerName }) => {
        const code = roomCode?.trim().toUpperCase();
        const room = rooms[code];

        if (!room) return socket.emit("errorMessage", "Room no longer exists.");
        if (!playerName?.trim()) return socket.emit("errorMessage", "Name is required.");
        if (room.status !== "waiting") return socket.emit("errorMessage", "Game already in progress.");
        if (room.players.length >= 4) return socket.emit("errorMessage", "Room is full (max 4 players).");

        const nameTaken = room.players.some(
            p => p.name.toLowerCase() === playerName.trim().toLowerCase()
        );
        if (nameTaken) return socket.emit("errorMessage", "That name is already taken in this room.");

        room.players.push({
            id: socket.id,
            name: playerName.trim(),
            score: 0,
            connected: true,
        });

        socket.join(code);

        socket.emit("roomJoined", {
            roomCode: code,
            playerName: playerName.trim(),
            isHost: false,
            players: buildPlayerList(room),
        });

        socket.to(code).emit("playerJoined", {
            id: socket.id,
            name: playerName.trim(),
            playerCount: room.players.length,
        });

        io.to(code).emit("updateScoreboard", buildPlayerList(room));
    });

    // ── START GAME (host only) ───────────────────────────────────────────────
    socket.on("startGame", ({ roomCode }) => {
        const code = roomCode?.trim().toUpperCase();
        const room = rooms[code];

        if (!room) return socket.emit("errorMessage", "Room not found.");
        const requestingPlayer = room.players.find(p => p.id === socket.id);
    if (!requestingPlayer) return socket.emit("errorMessage", "Player not found.");
    if (room.hostName !== requestingPlayer.name) return socket.emit("errorMessage", "Only the host can start the game.");
        if (room.players.length < 2) return socket.emit("errorMessage", "Need at least 2 players to start.");
        if (room.status !== "waiting") return socket.emit("errorMessage", "Game already started.");

        room.status = "playing";
        io.to(code).emit("game:start");
        startNextRound(code);
    });

    // ── GUESS SUBMIT ─────────────────────────────────────────────────────────
    socket.on("guess:submit", ({ roomCode, guess }) => {
        const code = roomCode?.trim().toUpperCase();
        const room = rooms[code];

        if (!room || !room.round) return;
        if (room.status !== "playing") return;

        // Prevent double-guessing in the same round
        if (room.round.guessedPlayers.includes(socket.id)) {
            return socket.emit("errorMessage", "You already guessed correctly this round!");
        }

        const correct = guess.trim().toUpperCase() === room.round.answer.toUpperCase();

        if (correct) {
            // Award points — earlier correct guesses score more
            const player = room.players.find(p => p.id === socket.id);
            if (player) {
                const bonus = Math.max(1, 10 - room.round.guessedPlayers.length * 2);
                player.score += bonus;
            }

            room.round.guessedPlayers.push(socket.id);

            socket.emit("guess:correct");
            socket.to(code).emit("player:guessed", { name: player?.name });
            io.to(code).emit("updateScoreboard", buildPlayerList(room));

            // End round early if everyone guessed
            const connectedPlayers = room.players.filter(p => p.connected);
            if (room.round.guessedPlayers.length >= connectedPlayers.length) {
                endRound(code);
            }
        } else {
            socket.emit("guess:wrong");
        }
    });

    // ── REJOIN ROOM ──────────────────────────────────────────────────────────
    socket.on("rejoinRoom", ({ roomCode, playerName }) => {
        const code = roomCode?.trim().toUpperCase();
        const room = rooms[code];
        if (!room) return socket.emit("errorMessage", "Room no longer exists.");

        // AFTER
    const existing = room.players.find(
        p => p.name.toLowerCase() === playerName?.trim().toLowerCase()
    );

    if (!existing) return socket.emit("errorMessage", "Player not found in this room.");

        clearTimeout(existing.reconnectTimer);
        existing.id = socket.id;
        existing.connected = true;
        delete existing.reconnectTimer;

        socket.join(code);

        const payload = {
            roomCode: code,
            playerName: existing.name,
            isHost: room.host === socket.id,
            players: buildPlayerList(room),
        };

        if (room.status === "playing" && room.round) {
            payload.gameSync = {
                round: room.round.current,
                totalRounds: room.round.total,
                question: room.round.question,
                timeLeft: room.round.endsAt - Date.now(),
                scores: buildScoreSnapshot(room),
            };
        }

        socket.emit("roomJoined", payload);
        socket.to(code).emit("playerReconnected", { name: existing.name });
        io.to(code).emit("updateScoreboard", buildPlayerList(room));
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────────
    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);

        const found = findRoomBySocketId(socket.id);
        if (!found) return;

        const { roomCode, room } = found;
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        player.connected = false;
        socket.to(roomCode).emit("playerDisconnected", { name: player.name });
        io.to(roomCode).emit("updateScoreboard", buildPlayerList(room));

        player.reconnectTimer = setTimeout(() => {
            evictPlayer(roomCode, socket.id);
        }, 15000);
    });

});

// ─── EVICTION ────────────────────────────────────────────────────────────────

function evictPlayer(roomCode, socketId) {
    const room = rooms[roomCode];
    if (!room) return;

    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx === -1) return;

    const [evicted] = room.players.splice(idx, 1);
    io.to(roomCode).emit("playerLeft", { name: evicted.name });
    io.to(roomCode).emit("updateScoreboard", buildPlayerList(room));

    if (room.host === socketId) {
        if (room.players.length > 0) {
            room.host = room.players[0].id;
            io.to(roomCode).emit("hostChanged", { newHost: room.players[0].name });
        } else {
            if (room.roundTimer) clearTimeout(room.roundTimer);
            delete rooms[roomCode];
            console.log(`Room ${roomCode} deleted (empty).`);
        }
    }
}

// ─── REST ENDPOINTS ──────────────────────────────────────────────────────────

app.post("/scoreboard", (req, res) => {
    const { roomCode } = req.body;
    if (!rooms[roomCode]) return res.status(404).json({ message: "Room not found" });
    res.json({ players: buildScoreSnapshot(rooms[roomCode]) });
});

app.get("/room/:roomCode", (req, res) => {
    const room = rooms[req.params.roomCode?.toUpperCase()];
    if (!room) return res.status(404).json({ message: "Room not found" });
    res.json({
        roomCode: req.params.roomCode.toUpperCase(),
        status: room.status,
        playerCount: room.players.length,
        players: buildPlayerList(room),
    });
});

// ─── START ───────────────────────────────────────────────────────────────────

server.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});