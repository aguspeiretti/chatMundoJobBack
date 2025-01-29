// models/Conversation.js
const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["private", "group"],
      required: true,
    },
    participants: [
      {
        type: String, // sessionId
        required: true,
      },
    ],
    name: {
      type: String, // For group chats
      required: function () {
        return this.type === "group";
      },
    },
    lastMessage: {
      text: String,
      sender: String,
      timestamp: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Conversation", conversationSchema);
