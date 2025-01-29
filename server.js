const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const cors = require("cors");
const Message = require("./models/Message");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://chatmundojob.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"],
  },
});

// Conectar a MongoDB
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

// Salas activas y usuarios en salas
const activeRooms = new Set(["General", "Random", "Ayuda"]);
const roomUsers = new Map();
const privateChats = new Map();

app.use(express.json());
app.use(cors({ origin: "https://chatmundojob.onrender.com" }));

// Obtener lista de salas
app.get("/api/rooms", (req, res) => {
  res.json(Array.from(activeRooms));
});

// Crear una nueva sala
app.post("/api/rooms", (req, res) => {
  const { roomName } = req.body;
  if (roomName && !activeRooms.has(roomName)) {
    activeRooms.add(roomName);
    io.emit("roomsUpdated", Array.from(activeRooms));
    res.status(201).json({ message: "Sala creada exitosamente" });
  } else {
    res.status(400).json({ message: "Nombre de sala inválido o ya existe" });
  }
});

// Obtener mensajes de una sala
app.get("/api/messages/:room", async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  // Generar un ID aleatorio para el usuario
  const userId = `user_${Math.random().toString(36).substr(2, 9)}`;
  socket.emit("userAssigned", userId);
  console.log(`Usuario conectado: ${socket.id} (ID: ${userId})`);

  // Unirse a una sala
  socket.on("joinRoom", ({ room }) => {
    socket.join(room);

    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Set());
    }
    roomUsers.get(room).add(userId);

    io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));

    const message = new Message({
      room,
      username: "Sistema",
      text: `${userId} se ha unido a la sala`,
    });
    message.save();

    io.to(room).emit("message", {
      username: "Sistema",
      text: `${userId} se ha unido a la sala`,
      timestamp: new Date(),
    });
  });

  // Manejar mensajes en salas
  socket.on("sendMessage", async ({ room, message }) => {
    const newMessage = new Message({
      room,
      username: userId,
      text: message,
    });

    try {
      await newMessage.save();
      io.to(room).emit("message", {
        username: userId,
        text: message,
        timestamp: newMessage.timestamp,
      });
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  // Enviar mensaje privado
  socket.on("sendPrivateMessage", ({ toUserId, message }) => {
    if (!privateChats.has(userId)) {
      privateChats.set(userId, new Map());
    }
    if (!privateChats.get(userId).has(toUserId)) {
      privateChats.get(userId).set(toUserId, []);
    }
    privateChats.get(userId).get(toUserId).push({ from: userId, message });

    io.to(toUserId).emit("privateMessage", { from: userId, message });
  });

  // Manejar desconexión y salida de sala
  socket.on("leaveRoom", ({ room }) => {
    socket.leave(room);

    if (roomUsers.has(room)) {
      roomUsers.get(room).delete(userId);
      if (roomUsers.get(room).size === 0) {
        roomUsers.delete(room);
        if (!["General", "Random", "Ayuda"].includes(room)) {
          activeRooms.delete(room);
          io.emit("roomsUpdated", Array.from(activeRooms));
        }
      } else {
        io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));
      }
    }

    const message = new Message({
      room,
      username: "Sistema",
      text: `${userId} ha dejado la sala`,
    });
    message.save();

    io.to(room).emit("message", {
      username: "Sistema",
      text: `${userId} ha dejado la sala`,
      timestamp: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log(`Usuario desconectado: ${socket.id} (ID: ${userId})`);
  });
});

server.listen(3001, () => {
  console.log("Servidor corriendo en puerto 3001");
});
