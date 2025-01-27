const express = require("express");
const { register, login } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const router = express.Router();

// Rutas públicas
router.post("/register", register);
router.post("/login", login);

// Rutas protegidas por autenticación
router.get("/me", authMiddleware, (req, res) => {
  res.json(req.user);
});

module.exports = router;
