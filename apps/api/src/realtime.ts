import type { Server as HttpServer } from "node:http";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server } from "socket.io";
import { env } from "./config.js";
import { redis, redisSubscriber } from "./redis.js";

export function createRealtimeServer(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN ?? false, credentials: true },
    transports: ["websocket", "polling"],
  });

  io.adapter(createAdapter(redis, redisSubscriber));
  io.on("connection", (socket) => {
    socket.emit("system:ready", { protocolVersion: 1 });
  });

  return io;
}
