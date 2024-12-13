const net = require("net");
const express = require("express");
const bodyParser = require("body-parser");
const chalk = require("chalk");

const TCP_PORT = 12345;
const HTTP_PORT = 3000;
const userId = "1234";
const devices = new Map(); // Store IMEI -> socket mapping
const devicesInfromation = new Map(); // Store IMEI -> device information mapping
const bikes = [
  { bikeId: "1689327020", model: "Electric Bike 1", imei: "867255075759094" },
  { bikeId: "1689327019", model: "Electric Bike 2", imei: "867255075759084" },
];

let bikeStatus = "locked";

// ---------------- TCP SERVER ---------------- //
const tcpServer = net.createServer((socket) => {
  console.log(
    chalk.green.bold(
      `New connection from ${socket.remoteAddress}:${socket.remotePort}`
    )
  );

  socket.on("data", (data) => {
    const message = data.toString().trim();
    console.log(
      chalk.cyan(`Received: ${message} from ${socket.remoteAddress}`)
    );

    if (message.includes("Q0")) {
      console.log(chalk.yellow("Processing Q0 (Sign-in Command)"));
      const parts = message.split(",");
      const imei = parts[2];
      const voltage = parts[4];
      const power = parts[5];
      const signalValue = parts[6];

      devices.set(imei, socket);
      devicesInfromation.set(imei, {
        voltage: voltage,
        power: power,
        signalValue: signalValue,
      });
      console.log(chalk.magenta(`Device with IMEI ${imei} registered.`));
    } else if (message.includes("H0")) {
      console.log(chalk.yellow("Processing H0 (Heartbeat Command)"));
      const parts = message.split(",");
      const imei = parts[2];
      if (!devices.has(imei)) {
        devices.set(imei, socket);
        devicesInfromation.set(imei, {
          voltage: voltage,
          power: power,
          signalValue: signalValue,
        });
        console.log(chalk.magenta(`Device with IMEI ${imei} registered.`));
      }
    } else if (message.includes("CLR0")) {
      console.log(
        chalk.yellow("Processing CLR0 (Special Unlock/Lock Request)")
      );
      const parts = message.split(",");
      const imei = parts[2];

      if (devices.has(imei)) {
        const deviceSocket = devices.get(imei);
        const response = `*SCOS,OM,${imei},R0,0,20,${userId},${Date.now()}#`;
        console.log(
          chalk.green(`Sending CLR0 response to device ${imei}: ${response}`)
        );
        deviceSocket.write(response + "\n");
      } else {
        console.log(chalk.red(`Device with IMEI ${imei} not connected.`));
        socket.write("Device not connected\n");
      }
    } else if (message.includes("R0")) {
      console.log(
        chalk.yellow("Processing R0 (Unlock/Lock Operation Request)")
      );
      const parts = message.split(",");
      const operation = parts[4];
      const operationKey = parts[5];
      const userId = parts[6];
      const timestamp = parts[7].replace("#", "");

      const imei = parts[2];

      if (devices.has(imei)) {
        if (operation == "0") {
          const deviceSocket = devices.get(imei);
          const response = `*SCOS,OM,${imei},L0,${operationKey},${userId},${timestamp}#`;
          console.log(chalk.green(`Sending unlock command: ${response}`));
          deviceSocket.write(response + "\n");
        } else if (operation == "1") {
          const deviceSocket = devices.get(imei);
          const response = `*SCOS,OM,${imei},L1,${operationKey}#`;
          console.log(chalk.green(`Sending lock command: ${response}`));
          deviceSocket.write(response + "\n");
        }
      }

      // const l0Response = `*SCOS,OM,${imei},L0,${operationKey},${userId},${timestamp}#`;
      // console.log(chalk.green(`Sending unlock command: ${l0Response}`));
      // socket.write(l0Response + "\n");
    } else if (message.includes("L0")) {
      console.log(chalk.yellow("Processing L0 (Unlock Command Response)"));
      const parts = message.split(",");
      const imei = parts[2];
      const responseStatus = parts[4];
      if (devices.has(imei)) {
        const deviceSocket = devices.get(imei);
        if (responseStatus == "0") {
          bikeStatus = "unlocked";
        } else if (responseStatus == "1") {
          bikeStatus = "locked";
        }
        const response = `*SCOS,OM,${imei},L0#`;
        console.log(chalk.green(`Responding with: ${response}`));
        deviceSocket.write(response + "\n");
      }
    } else if (message.includes("L1")) {
      console.log(chalk.yellow("Processing L1 (Lock Command)"));
      const parts = message.split(",");
      const key = parts[4].replace("#", "");
      const imei = parts[2];
      const responseStatus = parts[4];
      if (devices.has(imei)) {
        const deviceSocket = devices.get(imei);
        if (responseStatus == "0") {
          bikeStatus = "locked";
        } else if (responseStatus == "1") {
          bikeStatus = "unlocked";
        }
        const response = `*SCOS,OM,${imei},L1#`;
        console.log(chalk.green(`Responding with: ${response}`));
        deviceSocket.write(response + "\n");
      }
    } else {
      console.log(chalk.red("Unknown command received."));
      socket.write("Unknown command\n");
    }
  });

  socket.on("end", () => {
    console.log(
      chalk.yellow.bold(`Connection ended from ${socket.remoteAddress}`)
    );
    for (let [imei, s] of devices.entries()) {
      if (s === socket) {
        devices.delete(imei);
        console.log(chalk.magenta(`Device with IMEI ${imei} disconnected.`));
      }
    }
  });

  socket.on("error", (err) => {
    console.error(chalk.red.bold(`Error: ${err.message}`));
  });
});

tcpServer.listen(TCP_PORT, () => {
  console.log(chalk.green.bold(`TCP server listening on port ${TCP_PORT}`));
});

// ---------------- HTTP SERVER ---------------- //
const app = express();
const cors = require("cors");
const corsOptions = {
  origin: "*",
  credentials: true, //access-control-allow-credentials:true
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

// Endpoint to send CLR0 command to a specific device
app.post("/send-clr0", (req, res) => {
  const { imei } = req.body;
  if (!imei) {
    return res.status(400).send({ error: "IMEI is required" });
  }

  if (devices.has(imei)) {
    const deviceSocket = devices.get(imei);
    const response = `*SCOS,OM,${imei},R0,0,20,${userId},${Date.now()}#`;
    console.log(
      chalk.blue(`HTTP Request: Sending CLR0 to device ${imei}: ${response}`)
    );
    deviceSocket.write(response + "\n");
    res.send({ status: "CLR0 command sent", imei });
  } else {
    console.log(
      chalk.red(`HTTP Request: Device with IMEI ${imei} not connected.`)
    );
    res.status(404).send({ error: "Device not connected", imei });
  }
});
app.post("/send-clr1", (req, res) => {
  const { imei } = req.body;

  if (!imei) {
    return res.status(400).send({ error: "IMEI is required" });
  }

  if (devices.has(imei)) {
    const deviceSocket = devices.get(imei);
    const response = `*SCOS,OM,${imei},R0,1,20,${userId},${Date.now()}#`;
    console.log(
      chalk.blue(`HTTP Request: Sending CLR1 to device ${imei}: ${response}`)
    );
    deviceSocket.write(response + "\n");
    res.send({ status: "CLR1 command sent", imei });
  } else {
    console.log(
      chalk.red(`HTTP Request: Device with IMEI ${imei} not connected.`)
    );
    res.status(404).send({ error: "Device not connected", imei });
  }
});

app.options("/checkBikeId", cors());
app.post("/checkBikeId", (req, res) => {
  const { bikeId } = req.body; // Extract BikeId from request body
  // Check if BikeId exists in the bikes array
  const bike = bikes.find((bike) => bike.bikeId === bikeId);

  if (bike) {
    // If BikeId exists, return success with bike info
    if (devices.size > 0) {
      return res.status(200).json({
        message: "Bike found",
        imei: bike.imei,
      });
    } else {
      return res.status(405).json({
        message: "No devices connected",
      });
    }
  } else {
    // If BikeId does not exist
    return res.status(404).json({
      message: "BikeId not found",
    });
  }
});
app.get("/getDeviceInfromation", (req, res) => {
  if (devices.size > 0) {
    const device = devicesInfromation.get(devices.get("867255075759094"));
    console.log(device);
    return res.status(200).json({
      message: "Device found",
      device: device,
    });
  } else {
    return res.status(404).json({
      message: "Device not found",
    });
  }
});

// app.options("/getBikeStatus", cors());
app.post("/getBikeStatus", (req, res) => {
  return res.status(200).json({
    message: "Bike status",
    bikeStatus: bikeStatus,
  });
});

app.listen(HTTP_PORT, () => {
  console.log(chalk.green.bold(`HTTP server listening on port ${HTTP_PORT}`));
});
