require("dotenv").config(); // Cargar variables de entorno
const express = require("express");
const { AzureSignalRService, HttpRequestHandler } = require("@microsoft/signalr");
const bodyParser = require("body-parser");
const { body, validationResult } = require("express-validator");

const app = express();
const port = process.env.PORT || 3001;

// Configurar Azure SignalR con la cadena de conexión desde variables de entorno
const signalR = new AzureSignalRService({
  connectionString: process.env.SIGNALR_CONNECTION_STRING,
});

// Configuración de Middleware
app.use(bodyParser.json());
const signalRHandler = new HttpRequestHandler(signalR);
app.use(signalRHandler.handleRequest);

// Datos del juego
let rooms = {};

// Crear una sala
app.post(
  "/createRoom",
  body("roomId").isString().notEmpty().withMessage("El ID de la sala es obligatorio."),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { roomId } = req.body;
    if (!rooms[roomId]) {
      rooms[roomId] = {
        players: [],
        pot: 0,
        currentTurn: 0,
        communityCards: [],
        deck: shuffleDeck(),
        hands: {}, // Cartas privadas de los jugadores
      };
    }
    res.send({ message: `Sala ${roomId} creada.` });
  }
);

// Unirse a una sala
app.post(
  "/joinRoom",
  [
    body("roomId").isString().notEmpty(),
    body("playerName").isString().notEmpty(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { roomId, playerName } = req.body;
    if (rooms[roomId]) {
      const player = { id: generatePlayerId(), name: playerName, hand: [] };
      rooms[roomId].players.push(player);
      rooms[roomId].hands[player.id] = []; // Inicializar mano vacía

      signalR.sendToGroup(roomId, "gameUpdate", rooms[roomId]).catch(console.error);
      res.send({ message: `Jugador ${playerName} unido a la sala ${roomId}.` });
    } else {
      res.status(404).send({ error: "La sala no existe." });
    }
  }
);

// Iniciar el juego
app.post("/startGame", (req, res) => {
  const { roomId } = req.body;
  if (rooms[roomId]) {
    const room = rooms[roomId];
    room.players.forEach((player) => {
      room.hands[player.id] = [room.deck.pop(), room.deck.pop()];
    });

    signalR.sendToGroup(roomId, "gameUpdate", room).catch(console.error);
    res.send({ message: "Juego iniciado." });
  } else {
    res.status(404).send({ error: "La sala no existe." });
  }
});

// Revelar cartas comunitarias por ronda
app.post("/revealCards", (req, res) => {
  const { roomId, round } = req.body;
  if (rooms[roomId]) {
    const room = rooms[roomId];
    if (round === "flop" && room.communityCards.length === 0) {
      room.communityCards.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    } else if (round === "turn" && room.communityCards.length === 3) {
      room.communityCards.push(room.deck.pop());
    } else if (round === "river" && room.communityCards.length === 4) {
      room.communityCards.push(room.deck.pop());
    } else {
      return res.status(400).send({ error: "Ronda inválida o ya completada." });
    }

    signalR.sendToGroup(roomId, "gameUpdate", room).catch(console.error);
    res.send({ message: `Cartas reveladas para la ronda ${round}.` });
  } else {
    res.status(404).send({ error: "La sala no existe." });
  }
});

// Realizar una apuesta
app.post("/placeBet", (req, res) => {
  const { roomId, amount } = req.body;
  if (rooms[roomId]) {
    try {
      const room = rooms[roomId];
      room.pot += amount;
      room.currentTurn = (room.currentTurn + 1) % room.players.length;

      signalR.sendToGroup(roomId, "gameUpdate", room).catch(console.error);
      res.send({ message: "Apuesta realizada." });
    } catch (error) {
      console.error("Error al realizar la apuesta:", error);
      res.status(500).send({ error: "Error interno del servidor." });
    }
  } else {
    res.status(404).send({ error: "La sala no existe." });
  }
});

// Determinar el ganador
app.post("/determineWinner", (req, res) => {
  const { roomId } = req.body;
  if (rooms[roomId]) {
    const room = rooms[roomId];
    const results = room.players.map((player) => {
      return {
        playerName: player.name,
        bestHand: evaluateHand([...room.hands[player.id], ...room.communityCards]),
      };
    });

    results.sort((a, b) => b.bestHand.score - a.bestHand.score);
    signalR
      .sendToGroup(roomId, "gameResult", { winner: results[0], results })
      .catch(console.error);

    res.send({ message: "Ganador calculado.", winner: results[0] });
  } else {
    res.status(404).send({ error: "La sala no existe." });
  }
});

// Reiniciar sala
app.post("/resetRoom", (req, res) => {
  const { roomId } = req.body;
  if (rooms[roomId]) {
    rooms[roomId] = {
      players: [],
      pot: 0,
      currentTurn: 0,
      communityCards: [],
      deck: shuffleDeck(),
      hands: {},
    };
    res.send({ message: `Sala ${roomId} reiniciada.` });
  } else {
    res.status(404).send({ error: "La sala no existe." });
  }
});

// Función para mezclar el mazo
function shuffleDeck() {
  const suits = ["♠", "♥", "♦", "♣"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const deck = suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit })));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// Generar un ID único para el jugador
function generatePlayerId() {
  return Math.random().toString(36).substr(2, 9);
}

// Evaluar la mejor mano (simplificado)
function evaluateHand(cards) {
  const ranks = cards.map((card) => card.rank);
  const rankCounts = {};
  ranks.forEach((rank) => {
    rankCounts[rank] = (rankCounts[rank] || 0) + 1;
  });

  if (Object.values(rankCounts).includes(2)) {
    return { score: 100, hand: "Un par" };
  }
  return { score: 0, hand: "Carta alta" };
}

// Iniciar el servidor
app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
