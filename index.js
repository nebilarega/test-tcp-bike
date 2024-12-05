const net = require("net");

const PORT = 12345;
const HOST = "0.0.0.0";

const server = net.createServer((socket) => {
  console.log(
    `New connection from ${socket.remoteAddress}:${socket.remotePort}`
  );
  socket.on("data", (data) => {
    const message = data.toString().trim();
    console.log(`Received: ${message} from ${socket.remoteAddress}`);
    if (message === "PING") {
      socket.write("PONG\n");
    } else {
      socket.write(`ECHO: ${message}\n`);
    }
  });
  socket.on("end", () => {
    console.log(`Connection ended from ${socket.remoteAddress}`);
  });
  socket.on("error", (err) => {
    console.error(`Error: ${err.message}`);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`TCP server listening on ${HOST}:${PORT}`);
});

server.on("error", (err) => {
  console.error(`Server error: ${err.message}`);
});

server.on("close", () => {
  console.log("Server closed");
});
