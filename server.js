const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Message = require("./models/Message");
const cors = require("cors");
const activeRooms = new Set(["General", "Random", "Ayuda"]);
require("dotenv").config();
app.use(
  cors({
    origin: "https://chatmundojob.onrender.com", // Actualizado para Vite
  })
);

const io = new Server(server, {
  cors: {
    origin: "https://chatmundojob.onrender.com", // Actualizado para Vite
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
    serverSelectionTimeoutMS: 5000, // Tiempo máximo para intentar conectarse
  })
  .then(() => console.log("Conectado a MongoDB"))
  .catch((err) => {
    console.error("Error conectando a MongoDB:", err.message);
    process.exit(1); // Salir si no se puede conectar
  });

// Almacenar usuarios por sala
const roomUsers = new Map();

// Middleware para parsear JSON
app.use(express.json());

app.get("/api/rooms", (req, res) => {
  res.json(Array.from(activeRooms));
});

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
// Ruta para obtener mensajes anteriores de una sala
app.get("/api/messages/:room", async (req, res) => {
  try {
    const messages = await Message.find({ room: req.params.room })
      .sort({ timestamp: -1 })
      .limit(50); // Limitamos a los últimos 50 mensajes
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Unirse a una sala
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);

    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Set());
    }
    roomUsers.get(room).add(username);

    io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));

    // Guardar mensaje de bienvenida en la base de datos
    const message = new Message({
      room,
      username: "Sistema",
      text: `${username} se ha unido a la sala`,
    });
    message.save();

    socket.to(room).emit("message", {
      username: "Sistema",
      text: `${username} se ha unido a la sala`,
      timestamp: new Date(),
    });
  });

  // Manejar mensajes
  socket.on("sendMessage", async ({ username, room, message }) => {
    // Guardar mensaje en la base de datos
    const newMessage = new Message({
      room,
      username,
      text: message,
    });

    try {
      await newMessage.save();
      io.to(room).emit("message", {
        username,
        text: message,
        timestamp: newMessage.timestamp,
      });
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  // Manejar desconexión y salida de sala
  socket.on("leaveRoom", async ({ username, room }) => {
    socket.leave(room);

    if (roomUsers.has(room)) {
      roomUsers.get(room).delete(username);
      if (roomUsers.get(room).size === 0) {
        roomUsers.delete(room);
        // Solo eliminar salas personalizadas cuando se vacían
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
      text: `${username} ha dejado la sala`,
    });
    await message.save();

    socket.to(room).emit("message", {
      username: "Sistema",
      text: `${username} ha dejado la sala`,
      timestamp: new Date(),
    });
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
  });
});

server.listen(3001, () => {
  console.log("Servidor corriendo en puerto 3001");
});
