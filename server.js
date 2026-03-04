const express = require("express");
const path = require("path");
const app = express();

app.use(express.json());

// Serve static files
app.use(express.static(path.join(__dirname, "game")));

// In-memory rooms
let rooms = {};

// Generate random room code
function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// CREATE ROOM
app.post("/create-room", (req, res) => {
    const code = generateRoomCode();
    rooms[code] = { players: ["host"] }; // host counts as first player
    console.log("Room created:", code);
    res.json({ roomCode: code });
});

// JOIN ROOM
app.post("/join-room", (req, res) => {
    const { roomCode } = req.body;

    if (!rooms[roomCode]) {
        return res.status(404).json({ message: "Room not found" });
    }

    if (rooms[roomCode].players.length >= 4) {
        return res.status(400).json({ message: "Room full" });
    }

    rooms[roomCode].players.push("player"); // placeholder name
    console.log(`Player joined room ${roomCode}`);
    res.json({ message: "Joined room" });
});

// GET ROOM INFO (player count)
app.post("/room-info", (req, res) => {
    const { roomCode } = req.body;

    if (!rooms[roomCode]) {
        return res.status(404).json({ message: "Room not found" });
    }

    res.json({ players: rooms[roomCode].players.length });
});

// Start server
app.listen(3000, () => {
    console.log("Server running at http://localhost:3000");
});