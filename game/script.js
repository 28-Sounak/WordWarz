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

    // CREATE ROOM
    if (createBtn) {

        createBtn.addEventListener("click", async function () {

            try {

                const response = await fetch("/create-room", {
                    method: "POST"
                });

                if (!response.ok) {
                    throw new Error("Server error");
                }

                const data = await response.json();

                console.log("Room created:", data.roomCode);

                localStorage.setItem("roomCode", data.roomCode);
                localStorage.setItem("isHost", "true");

                alert("Room Code: " + data.roomCode);

                window.location.href = "game1.html";

            } catch (error) {
                console.error("Create room failed:", error);
                alert("Could not create room. Is the server running?");
            }

        });

    }


    // JOIN ROOM
    if (joinBtn) {

        joinBtn.addEventListener("click", async function () {

            const code = prompt("Enter Room Code:");

            if (!code) return;

            try {

                const response = await fetch("/join-room", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        roomCode: code.toUpperCase()
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    alert(data.message);
                    return;
                }

                localStorage.setItem("roomCode", code.toUpperCase());
                localStorage.setItem("isHost", "false");

                window.location.href = "game1.html";

            } catch (error) {
                console.error("Join room failed:", error);
                alert("Could not join room.");
            }

        });

    }


    // =========================================
    // GAME PAGE (game1.html)
    // =========================================

    const roomDisplay = document.getElementById("roomDisplay");
    const playerCountDisplay = document.getElementById("playerCountDisplay");

    if (roomDisplay && playerCountDisplay) {

        const roomCode = localStorage.getItem("roomCode");

        if (!roomCode) {
            window.location.href = "friends.html";
            return;
        }

        roomDisplay.textContent = "Room Code: " + roomCode;

        async function updatePlayerCount() {

            try {

                const response = await fetch("/room-info", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ roomCode })
                });

                if (!response.ok) {
                    throw new Error("Room not found");
                }

                const data = await response.json();

                playerCountDisplay.textContent = "Players: " + data.players + "/4";

            } catch (error) {

                console.error("Player count error:", error);

            }

        }

        updatePlayerCount();

        setInterval(updatePlayerCount, 2000);

    }

});

async function loadQuestion() {

    const response = await fetch("/get-question");

    const data = await response.json();

    document.getElementById("question").textContent = data.question;

    window.currentAnswer = data.answer;

}
loadQuestion();

document.getElementById("submitAnswer").addEventListener("click", () => {

    const userAnswer = document.getElementById("answerInput").value.toUpperCase();

    if (userAnswer === window.currentAnswer) {
        alert("Correct! +5 points");
    } else {
        alert("Wrong answer!");
    }

});