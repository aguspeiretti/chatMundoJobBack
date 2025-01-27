const Message = require("../models/Message");

exports.createRoom = (req, res) => {
  // Lógica para crear una nueva sala (puedes gestionarla solo en el frontend si no es necesario almacenarla en la base de datos)
  res.json({ msg: "Sala creada con éxito" });
};

exports.sendMessage = async (req, res) => {
  const { room, message } = req.body;
  const newMessage = new Message({
    sender: "Usuario desconocido",
    room,
    message,
  });

  try {
    await newMessage.save();
    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ msg: "Error al guardar el mensaje", error });
  }
};

exports.getMessages = async (req, res) => {
  const { room } = req.params;
  try {
    const messages = await Message.find({ room }).populate(
      "sender",
      "username"
    );
    res.json(messages);
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener los mensajes", error });
  }
};
