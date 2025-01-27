const socketIo = require("socket.io");

const initSocket = (server) => {
  const io = socketIo(server, {
    cors: {
      origin: "http://localhost:5173", // URL de tu frontend
      methods: ["GET", "POST"],
    },
  });
  io.on("connection", (socket) => {
    console.log("Usuario conectado:", socket.id);

    socket.on("joinRoom", (data) => {
      console.log(`${data.userId} se unió a la sala ${data.room}`);
      socket.join(data.room);
    });

    socket.on("sendMessage", (data) => {
      io.to(data.room).emit("newMessage", {
        user: data.userId,
        message: data.message,
      });
    });

    socket.on("disconnect", () => {
      console.log("Usuario desconectado");
    });
  });

  return io;
};

module.exports = initSocket;
