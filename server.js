const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const cors = require("cors");

const activeRooms = new Set([
  "Ventas",
  "Coordinacion",
  "Gestion",
  "Marketing",
  "Contabilidad",
  "RRHH",
]);
require("dotenv").config();

app.use(
  cors({
    origin: "https://chatmundojob.onrender.com",
    // origin: "http://localhost:5173",
  })
);

const io = new Server(server, {
  cors: {
    origin: "https://chatmundojob.onrender.com",
    // origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"],
  },
});

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => {
    console.error("Error conectando a MongoDB:", err.message);
    process.exit(1);
  });

// Store users and their socket IDs
const userSockets = new Map();
const roomUsers = new Map();

app.use(express.json());

app.get("/api/rooms", (req, res) => {
  res.json(Array.from(activeRooms));
});

app.get("/api/messages/:room", async (req, res) => {
  try {
    const messages = await Message.find({
      room: req.params.room,
      type: { $ne: "system" },
    })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  socket.on("joinRoom", ({ username, room }) => {
    userSockets.set(username, socket.id);
    socket.join(room);

    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Set());
    }
    roomUsers.get(room).add(username);

    io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));
  });

  socket.on("directMessage", async ({ from, to, message }) => {
    const toSocketId = userSockets.get(to);
    if (toSocketId) {
      io.to(toSocketId).emit("message", {
        username: from,
        text: message,
        timestamp: new Date(),
        isDirect: true,
      });

      socket.emit("message", {
        username: from,
        text: message,
        timestamp: new Date(),
        isDirect: true,
      });

      const newMessage = new Message({
        type: "direct",
        from,
        to,
        text: message,
      });
      await newMessage.save();
    }
  });

  socket.on("sendMessage", async ({ username, room, message }) => {
    const newMessage = new Message({
      room,
      username,
      text: message,
      type: "room",
    });

    try {
      await newMessage.save();
      io.to(room).emit("message", {
        username,
        text: message,
        timestamp: newMessage.timestamp,
        type: "room",
      });
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  socket.on("leaveRoom", async ({ username, room }) => {
    socket.leave(room);

    if (roomUsers.has(room)) {
      roomUsers.get(room).delete(username);
      if (roomUsers.get(room).size === 0) {
        roomUsers.delete(room);
        if (
          ![
            "Ventas",
            "Coordinacion",
            "Gestion",
            "Marketing",
            "Contabilidad",
            "RRHH",
          ].includes(room)
        ) {
          activeRooms.delete(room);
          io.emit("roomsUpdated", Array.from(activeRooms));
        }
      } else {
        io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));
      }
    }
  });

  socket.on("disconnect", () => {
    let disconnectedUsername;
    for (const [username, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        disconnectedUsername = username;
        userSockets.delete(username);
        break;
      }
    }

    if (disconnectedUsername) {
      for (const [room, users] of roomUsers.entries()) {
        if (users.has(disconnectedUsername)) {
          users.delete(disconnectedUsername);
          io.to(room).emit("roomUsers", Array.from(users));
        }
      }
    }

    console.log("Usuario desconectado:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("Servidor corriendo en puerto 3001");
});
