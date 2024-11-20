// src/App.js
import React, { useState, useEffect } from "react";
//import * as signalR from "@microsoft/signalr";
import {
  Box,
  TextField,
  Button,
  Typography,
  Grid,
  Card,
  CardContent,
} from "@mui/material";

function App() {
  const [connection, setConnection] = useState(null);
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [gameState, setGameState] = useState(null);

  useEffect(() => {
    const connectToSignalR = async () => {
      const conn = new signalR.HubConnectionBuilder()
        .withUrl("https://<tu-signalr>.service.signalr.net/api")
        .withAutomaticReconnect()
        .build();

      conn.on("gameUpdate", (state) => {
        setGameState(state);
      });

      await conn.start();
      setConnection(conn);
    };

    connectToSignalR();
  }, []);

  const createRoom = async () => {
    await fetch("http://localhost:3001/createRoom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });
  };

  const joinRoom = async () => {
    await fetch("http://localhost:3001/joinRoom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, playerName }),
    });
  };

  const placeBet = async () => {
    await fetch("http://localhost:3001/placeBet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, amount: 10 }),
    });
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        bgcolor: "background.default",
        p: 2,
      }}
    >
      <Typography variant="h3" gutterBottom>
        Póker entre Amigos
      </Typography>
      <Grid container spacing={2} maxWidth="sm">
        <Grid item xs={12}>
          <TextField
            label="ID de sala"
            variant="outlined"
            fullWidth
            onChange={(e) => setRoomId(e.target.value)}
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Tu nombre"
            variant="outlined"
            fullWidth
            onChange={(e) => setPlayerName(e.target.value)}
          />
        </Grid>
        <Grid item xs={6}>
          <Button variant="contained" color="primary" fullWidth onClick={createRoom}>
            Crear Sala
          </Button>
        </Grid>
        <Grid item xs={6}>
          <Button variant="contained" color="secondary" fullWidth onClick={joinRoom}>
            Unirse a la Sala
          </Button>
        </Grid>
      </Grid>

      {gameState && (
        <Box mt={4} width="100%" maxWidth="md">
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Bote: ${gameState.pot}
              </Typography>
              <Button
                variant="contained"
                color="success"
                onClick={placeBet}
                sx={{ mt: 2 }}
              >
                Apostar 10
              </Button>
              <Typography variant="h6" sx={{ mt: 4 }}>
                Jugadores:
              </Typography>
              <Grid container spacing={2} mt={2}>
                {gameState.players.map((player) => (
                  <Grid item xs={12} sm={6} md={4} key={player.id}>
                    <Card>
                      <CardContent>
                        <Typography>{player.name}</Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
}

export default App;
