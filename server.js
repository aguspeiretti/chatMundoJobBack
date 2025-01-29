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

// Almacenar usuarios por sala y sus sockets
const roomUsers = new Map();
const userSocketMap = new Map(); // Mapeo de usuarios a sus sockets

app.use(
  cors({
    origin: "https://chatmundojob.onrender.com",
    methods: ["GET", "POST"],
    credentials: true,
    allowedHeaders: ["Content-Type"],
  })
);

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

// Middleware para parsear JSON
app.use(express.json());

// Rutas API
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

app.get("/api/messages/private/:chatId", async (req, res) => {
  try {
    const messages = await Message.find({
      room: req.params.chatId,
      isPrivate: true,
    })
      .sort({ timestamp: -1 })
      .limit(50);
    res.json(messages.reverse());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Socket.IO
io.on("connection", (socket) => {
  console.log("Usuario conectado:", socket.id);

  // Unirse a una sala
  socket.on("joinRoom", ({ username, room }) => {
    socket.join(room);

    // Guardar la relación usuario-socket
    userSocketMap.set(username, socket.id);

    // Inicializar sala si no existe
    if (!roomUsers.has(room)) {
      roomUsers.set(room, new Set());
    }
    roomUsers.get(room).add(username);

    // Emitir lista actualizada de usuarios
    io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));

    // Guardar y emitir mensaje de bienvenida
    const message = new Message({
      room,
      username: "Sistema",
      text: `${username} se ha unido a la sala`,
      isSystemMessage: true,
    });
    message.save();

    socket.to(room).emit("message", {
      username: "Sistema",
      text: `${username} se ha unido a la sala`,
      timestamp: new Date(),
      isSystemMessage: true,
    });
  });

  // Manejar mensajes normales
  socket.on("sendMessage", async ({ username, room, message }) => {
    const newMessage = new Message({
      room,
      username,
      text: message,
      isPrivate: false,
    });

    try {
      await newMessage.save();
      io.to(room).emit("message", {
        username,
        text: message,
        timestamp: newMessage.timestamp,
        isPrivate: false,
      });
    } catch (error) {
      console.error("Error al guardar mensaje:", error);
    }
  });

  // Estructura para mantener chats privados
  const privateChats = new Map();

  io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id);

    // Unirse a una sala
    socket.on("joinRoom", ({ username, room }) => {
      socket.join(room);

      if (!roomUsers.has(room)) {
        roomUsers.set(room, new Set());
      }
      roomUsers.get(room).add(username);
      userSocketMap.set(username, socket.id);

      io.to(room).emit("roomUsers", Array.from(roomUsers.get(room)));

      socket.to(room).emit("message", {
        username: "Sistema",
        text: `${username} se ha unido a la sala`,
        timestamp: new Date(),
        room,
      });
    });

    // Manejar mensajes privados
    socket.on("privateMessage", async ({ username, to, message }) => {
      const targetSocketId = userSocketMap.get(to);
      const chatId = [username, to].sort().join("--");

      if (!privateChats.has(chatId)) {
        privateChats.set(chatId, []);
      }

      const messageObj = {
        username,
        to,
        text: message,
        timestamp: new Date(),
        isPrivate: true,
      };

      privateChats.get(chatId).push(messageObj);

      // Guardar en MongoDB
      const newMessage = new Message({
        ...messageObj,
        room: chatId,
      });
      await newMessage.save();

      // Enviar a ambos usuarios
      if (targetSocketId) {
        io.to(targetSocketId).emit("privateMessage", messageObj);
      }
      socket.emit("privateMessage", messageObj);
    });

    // Obtener mensajes privados anteriores
    socket.on("getPrivateMessages", async ({ chatId }) => {
      try {
        const messages = await Message.find({
          room: chatId,
          isPrivate: true,
        })
          .sort({ timestamp: -1 })
          .limit(50);

        socket.emit("privateMessageHistory", {
          chatId,
          messages: messages.reverse(),
        });
      } catch (error) {
        console.error("Error al obtener mensajes privados:", error);
      }
    });
  });

  // Manejar desconexión y salida de sala
  socket.on("leaveRoom", async ({ username, room }) => {
    handleUserLeave(socket, username, room);
  });

  socket.on("disconnect", () => {
    console.log("Usuario desconectado:", socket.id);
    // Encontrar y limpiar el usuario desconectado de todas las salas
    for (const [room, users] of roomUsers.entries()) {
      for (const user of users) {
        if (userSocketMap.get(user) === socket.id) {
          handleUserLeave(socket, user, room);
          break;
        }
      }
    }
  });
});

// Función auxiliar para manejar la salida de usuarios
async function handleUserLeave(socket, username, room) {
  socket.leave(room);
  userSocketMap.delete(username);

  if (roomUsers.has(room)) {
    roomUsers.get(room).delete(username);
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
    text: `${username} ha dejado la sala`,
    isSystemMessage: true,
  });
  await message.save();

  socket.to(room).emit("message", {
    username: "Sistema",
    text: `${username} ha dejado la sala`,
    timestamp: new Date(),
    isSystemMessage: true,
  });
}

server.listen(3001, () => {
  console.log("Servidor corriendo en puerto 3001");
});
