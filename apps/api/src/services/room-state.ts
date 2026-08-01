export type RoomPhase = "lobby" | "countdown" | "playing" | "round_result" | "finished";
export type MemberStatus = "connected" | "disconnected" | "forfeited" | "left";

export type RoomMember = {
  userId: string;
  displayName: string;
  status: MemberStatus;
  ready: boolean;
  score: number;
  guessCount: number;
  joinedAt: number;
  disconnectedAt?: number;
};

export type LiveRoom = {
  id: string;
  code: string;
  hostId: string;
  isPublic: boolean;
  maxPlayers: number;
  roundCount: number;
  roundDurationSeconds: number;
  phase: RoomPhase;
  roundNumber: number;
  members: RoomMember[];
  createdAt: number;
  roundEndsAt?: number;
  targetPlayerId?: string;
  correctUserId?: string;
};

export function createInviteCode(random = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

export function createLiveRoom(input: Omit<LiveRoom, "phase" | "roundNumber" | "members" | "createdAt"> & { host: RoomMember }): LiveRoom {
  if (input.maxPlayers < 2 || input.maxPlayers > 8) throw new Error("Room capacity must be between 2 and 8");
  if (![1, 3, 5].includes(input.roundCount)) throw new Error("Round count must be 1, 3, or 5");
  if (![30, 60, 90].includes(input.roundDurationSeconds)) throw new Error("Round duration must be 30, 60, or 90 seconds");
  return { ...input, phase: "lobby", roundNumber: 0, members: [{ ...input.host, ready: false, status: "connected", score: 0, guessCount: 0 }], createdAt: Date.now() };
}

export function activeMembers(room: LiveRoom) { return room.members.filter((member) => member.status === "connected"); }

export function joinRoom(room: LiveRoom, member: RoomMember): LiveRoom {
  if (room.phase !== "lobby") throw new Error("Room has already started");
  const existing = room.members.find((item) => item.userId === member.userId);
  if (existing) { existing.status = "connected"; existing.disconnectedAt = undefined; return room; }
  if (room.members.filter((item) => item.status !== "left").length >= room.maxPlayers) throw new Error("Room is full");
  room.members.push({ ...member, status: "connected", ready: false, score: 0, guessCount: 0 });
  return room;
}

export function setReady(room: LiveRoom, userId: string, ready: boolean): LiveRoom {
  if (room.phase !== "lobby") throw new Error("Room is not in lobby");
  const member = room.members.find((item) => item.userId === userId && item.status === "connected");
  if (!member) throw new Error("Member is not connected");
  member.ready = ready;
  return room;
}

export function beginCountdown(room: LiveRoom, userId: string): LiveRoom {
  if (room.hostId !== userId) throw new Error("Only the host can start the room");
  if (room.phase !== "lobby") throw new Error("Room is not in lobby");
  if (activeMembers(room).filter((member) => member.ready).length < 2) throw new Error("At least two ready members are required");
  room.phase = "countdown";
  return room;
}

export function beginRound(room: LiveRoom, now = Date.now()): LiveRoom {
  if (room.phase !== "countdown" && room.phase !== "round_result") throw new Error("Room cannot begin a round now");
  room.phase = "playing"; room.roundNumber += 1; room.roundEndsAt = now + room.roundDurationSeconds * 1000; room.correctUserId = undefined;
  for (const member of room.members) member.guessCount = 0;
  return room;
}

export function finishRound(room: LiveRoom): LiveRoom {
  room.phase = room.roundNumber >= room.roundCount ? "finished" : "round_result";
  room.roundEndsAt = undefined;
  return room;
}

export function recordGuess(room: LiveRoom, userId: string, correct: boolean, now = Date.now()): { room: LiveRoom; points: number } {
  if (room.phase !== "playing" || !room.roundEndsAt || now >= room.roundEndsAt) throw new Error("Round is not accepting guesses");
  const member = room.members.find((item) => item.userId === userId && item.status === "connected");
  if (!member) throw new Error("Member is not connected");
  if (member.guessCount >= 8) throw new Error("Guess limit reached");
  member.guessCount += 1;
  const points = correct ? Math.max(100, 1000 - (member.guessCount - 1) * 100 - Math.floor((now - (room.roundEndsAt - room.roundDurationSeconds * 1000)) / 1000) * 5) : 0;
  if (correct) { member.score += points; room.correctUserId = userId; finishRound(room); }
  return { room, points };
}

export function disconnectMember(room: LiveRoom, userId: string, now = Date.now()): LiveRoom {
  const member = room.members.find((item) => item.userId === userId && item.status === "connected");
  if (!member) return room;
  member.status = "disconnected"; member.disconnectedAt = now;
  if (room.hostId === userId) room.hostId = activeMembers(room)[0]?.userId ?? userId;
  return room;
}

export function forfeitExpiredMembers(room: LiveRoom, now = Date.now()): LiveRoom {
  for (const member of room.members) if (member.status === "disconnected" && member.disconnectedAt !== undefined && now - member.disconnectedAt >= 20_000) member.status = "forfeited";
  return room;
}
