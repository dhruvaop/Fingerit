import express from "express";
import cors from "cors";
import db from "./lib/db";
import { WebSocketServer, WebSocket } from "ws";
import authRouter from "./routes/auth-routes";
import roomRouter from "./routes/room-routes";
import dataRouter from "./routes/data-routes";

const app = express();
const httpServer = app.listen(8080);
app.use(cors());
app.use(express.json());

app.use("/auth", authRouter);
app.use("/room", roomRouter);
app.use("/getData", dataRouter);
export interface CustomWebSocket extends WebSocket {
  userId?: string;
  roomId?: string;
  words?: string;
  speed?: number;
}

const wss = new WebSocketServer({ server: httpServer });
export const rooms: { [key: string]: Set<CustomWebSocket> } = {};
app.set("wss", wss);
wss.on("connection", (ws: CustomWebSocket) => {
  console.log("connected");
  ws.on("error", console.error);

  ws.on("message", async (message) => {
    const { action, payload } = JSON.parse(message.toString());
    switch (action) {
      case "start":
        const roomid = ws.roomId;
        if (roomid && rooms[roomid]) {
          rooms[roomid].forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ action: "start" }));
            }
          });
        }
        break;
      case "reload":
        const roomidReload = ws.roomId;
        if (roomidReload && rooms[roomidReload]) {
          rooms[roomidReload].forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ action: "reload" }));
            }
          });
        }
        break;
      case "speed":
        const { speed } = payload;
        if (speed) {
          ws.speed = speed;
        }
        if (!ws.roomId) return;
        const usersInChallenge = await db.roomUser.findMany({
          where: {
            roomId: ws.roomId,
          },
        });
        const usersChallenge = await db.user.findMany({
          where: {
            id: {
              in: usersInChallenge.map((user: any) => user.userId),
            },
          },
        });
        const usersInChallengeMap = new Map();
        usersChallenge.map((user: any) => {
          usersInChallengeMap.set(user.id, user);
        });
        const roomDetails = Array.from(rooms[ws.roomId]).map((client) => ({
          speed: client.speed,
          user: usersInChallengeMap.get(client.userId),
        }));
        rooms[ws.roomId].forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(
              JSON.stringify({ action: "speed", payload: roomDetails })
            );
          }
        });
        break;
    }
  });

  ws.on("close", () => {
    if (ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].delete(ws);
      if (rooms[ws.roomId].size === 0) {
        delete rooms[ws.roomId];
      }
    }
  });
});
