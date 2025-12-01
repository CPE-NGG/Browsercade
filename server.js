const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Store Game State
let rooms = {}; 

io.on('connection', (socket) => {
    
    // Create Room
    socket.on('createRoom', ({ name }) => {
        const roomId = Math.random().toString(36).substring(7);
        rooms[roomId] = {
            players: [{ id: socket.id, name, score: 0 }],
            deck: generateDeck(), // Deck is generated SERVER SIDE (Anti-cheat)
            flipped: [], // Indices of currently flipped cards
            turn: 0, // Player index (0 or 1)
            matches: [] // Indices of matched cards
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId });
    });

    // Join Room
    socket.on('joinRoom', ({ roomId, name }) => {
        const room = rooms[roomId];
        if (room && room.players.length < 2) {
            room.players.push({ id: socket.id, name, score: 0 });
            socket.join(roomId);
            // Notify both players game is starting
            io.to(roomId).emit('gameStart', { 
                players: room.players, 
                deckCount: room.deck.length // Do not send full deck yet!
            });
        } else {
            socket.emit('error', 'Room full or invalid');
        }
    });

    // Handle Card Flip
    socket.on('flipCard', ({ roomId, cardIndex }) => {
        const room = rooms[roomId];
        if (!room) return;

        // Validation: Is it this socket's turn?
        const isMyTurn = room.players[room.turn].id === socket.id;
        if (!isMyTurn) return; // Ignore clicks if not turn

        // Validation: Is card already matched or flipped?
        if (room.matches.includes(cardIndex) || room.flipped.includes(cardIndex)) return;

        // Add to flipped list
        room.flipped.push(cardIndex);
        
        // Reveal THIS card to everyone
        const icon = room.deck[cardIndex];
        io.to(roomId).emit('cardRevealed', { index: cardIndex, icon });

        // Check Logic
        if (room.flipped.length === 2) {
            const idx1 = room.flipped[0];
            const idx2 = room.flipped[1];
            
            if (room.deck[idx1] === room.deck[idx2]) {
                // MATCH!
                room.matches.push(idx1, idx2);
                room.players[room.turn].score++;
                room.flipped = []; // Reset flipped array
                
                io.to(roomId).emit('matchFound', { 
                    indexes: [idx1, idx2], 
                    scores: room.players.map(p => p.score) 
                });
            } else {
                // MISMATCH
                setTimeout(() => {
                    room.flipped = [];
                    room.turn = (room.turn + 1) % 2; // Switch turn
                    io.to(roomId).emit('mismatch', { 
                        indexes: [idx1, idx2], 
                        turn: room.players[room.turn].id 
                    });
                }, 1000);
            }
        }
    });
});

function generateDeck() {
    // Logic to create shuffled array of icons
    const icons = ['🍎','🍎','🍌','🍌']; // Simplified
    return icons.sort(() => Math.random() - 0.5);
}

server.listen(3000, () => {
  console.log('listening on *:3000');
});