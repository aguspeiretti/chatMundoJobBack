const express = require("express");
const {
  createRoom,
  sendMessage,
  getMessages,
} = require("../controllers/chatController");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// Rutas protegidas para chat
router.post("/create-room", authMiddleware, createRoom); // Crear sala
router.post("/send-message", authMiddleware, sendMessage); // Enviar mensaje
router.get("/messages/:room", authMiddleware, getMessages); // Obtener mensajes de una sala

module.exports = router;
