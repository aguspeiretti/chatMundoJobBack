const jwt = require("jwt-simple");
const User = require("../models/User");

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization");
  if (!token) {
    return res.status(401).json({ msg: "No token, authorization denied" });
  }

  try {
    const decoded = jwt.decode(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(400).json({ msg: "Token is not valid" });
  }
};

module.exports = authMiddleware;
