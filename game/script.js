document.addEventListener("DOMContentLoaded", () => {

    // =====================================================
    // INDEX PAGE (index.html)
    // =====================================================

    const singleBtn = document.getElementById("single");
    const multiBtn = document.getElementById("multi");

    if (singleBtn) {
        singleBtn.addEventListener("click", () => {
            alert("AI Mode Coming Soon!");
        });
    }

    if (multiBtn) {
        multiBtn.addEventListener("click", () => {
            window.location.href = "friends.html";
        });
    }


    // =====================================================
    // FRIENDS PAGE (friends.html)
    // =====================================================

    const createBtn = document.getElementById("create");
    const joinBtn = document.getElementById("join");

    // CREATE ROOM
    if (createBtn) {
        createBtn.addEventListener("click", async () => {
            try {
                const response = await fetch("/create-room", {
                    method: "POST"
                });

                const data = await response.json();

                localStorage.setItem("roomCode", data.roomCode);
                localStorage.setItem("isHost", "true");

                window.location.href = "game1.html";

            } catch (error) {
                console.error("Error creating room:", error);
            }
        });
    }

    // JOIN ROOM
    if (joinBtn) {
        joinBtn.addEventListener("click", async () => {

            const code = prompt("Enter Room Code:");
            if (!code) return;

            try {
                const response = await fetch("/join-room", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roomCode: code.toUpperCase() })
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
                console.error("Error joining room:", error);
            }
        });
    }


    // =====================================================
    // GAME PAGE (game1.html)
    // =====================================================

    const roomDisplay = document.getElementById("roomDisplay");
    const playerCountDisplay = document.getElementById("playerCountDisplay");

    if (roomDisplay && playerCountDisplay) {

        const roomCode = localStorage.getItem("roomCode");

        // Prevent direct access to game page
        if (!roomCode) {
            window.location.href = "friends.html";
            return;
        }

        roomDisplay.textContent = "Room Code: " + roomCode;

        // Function to update player count
        function updatePlayerCount() {
            fetch("/room-info", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ roomCode })
            })
            .then(res => {
                if (!res.ok) {
                    throw new Error("Room not found");
                }
                return res.json();
            })
            .then(data => {
                playerCountDisplay.textContent = "Players: " + data.players + "/4";
            })
            .catch(error => {
                console.error("Error fetching player count:", error);
            });
        }

        // Initial call
        updatePlayerCount();

        // Auto update every 2 seconds
        setInterval(updatePlayerCount, 2000);
    }

});