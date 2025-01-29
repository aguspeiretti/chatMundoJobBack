const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true,
  },
  username: {
    type: String,
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  isPrivate: {
    type: Boolean,
    default: false,
  },
  to: {
    type: String,
    default: null,
  },
  isSystemMessage: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model("Message", messageSchema);
