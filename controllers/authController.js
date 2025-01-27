const bcrypt = require("bcryptjs");
const jwt = require("jwt-simple");
const User = require("../models/User");

exports.register = async (req, res) => {
  const { username, email, password, role } = req.body;
  const userExists = await User.findOne({ email });

  if (userExists) return res.status(400).json({ msg: "El usuario ya existe" });

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new User({ username, email, password: hashedPassword, role });
  await newUser.save();

  res.status(201).json({ msg: "Usuario registrado correctamente" });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.status(400).json({ msg: "Usuario no encontrado" });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.status(400).json({ msg: "Contraseña incorrecta" });

  const token = jwt.encode(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET
  );
  res.json({ token });
};
