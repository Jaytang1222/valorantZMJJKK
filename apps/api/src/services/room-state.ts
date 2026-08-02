export type RoomPhase =
  "lobby" | "countdown" | "playing" | "round_result" | "finished" | "cancelled";
export type MemberStatus = "connected" | "disconnected" | "forfeited" | "left";
export type RoundFinishReason =
  "correct" | "time_expired" | "guesses_exhausted" | "disconnect" | "surrender";

export const ROUND_WIN_POINTS = 1;

export type PrivateGuess = {
  id: string;
  playerId: string;
  canonicalName: string;
  comparison: Record<string, string>;
  isCorrect: boolean;
  points: number;
};

export type RoomMember = {
  userId: string;
  displayName: string;
  status: MemberStatus;
  ready: boolean;
  score: number;
  guessCount: number;
  joinedAt: number;
  disconnectedAt?: number;
  rematchReady: boolean;
  feedback: string[][];
  guesses: PrivateGuess[];
};

export type LiveRoom = {
  id: string;
  code: string;
  hostId: string;
  isPublic: boolean;
  isMatchmade: boolean;
  maxPlayers: number;
  roundCount: number;
  roundDurationSeconds: number;
  phase: RoomPhase;
  roundNumber: number;
  members: RoomMember[];
  createdAt: number;
  roundEndsAt?: number;
  roundStartedAt?: number;
  roundFinishedAt?: number;
  targetPlayerId?: string;
  targetPuzzleId?: string;
  answerName?: string;
  correctUserId?: string;
  winnerId?: string;
  finishReason?: RoundFinishReason;
};

export function createInviteCode(random = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(random() * alphabet.length)],
  ).join("");
}

type NewRoomMember = Omit<RoomMember, "rematchReady" | "feedback" | "guesses">;

export function createLiveRoom(
  input: Omit<
    LiveRoom,
    | "phase"
    | "roundNumber"
    | "members"
    | "createdAt"
    | "winnerId"
    | "finishReason"
    | "answerName"
  > & { host: NewRoomMember },
): LiveRoom {
  if (input.maxPlayers !== 2)
    throw new Error("Rooms support exactly two players");
  if (input.roundCount !== 1) throw new Error("Rooms support BO1 only");
  if (![30, 60, 90].includes(input.roundDurationSeconds))
    throw new Error("Round duration must be 30, 60, or 90 seconds");
  return {
    id: input.id,
    code: input.code,
    hostId: input.hostId,
    isPublic: input.isPublic,
    isMatchmade: input.isMatchmade,
    maxPlayers: input.maxPlayers,
    roundCount: 1,
    roundDurationSeconds: input.roundDurationSeconds,
    phase: "lobby",
    roundNumber: 0,
    members: [
      {
        ...input.host,
        ready: false,
        status: "connected",
        score: 0,
        guessCount: 0,
        rematchReady: false,
        feedback: [],
        guesses: [],
      },
    ],
    createdAt: Date.now(),
    targetPlayerId: input.targetPlayerId,
    correctUserId: input.correctUserId,
  };
}

export function activeMembers(room: LiveRoom) {
  return room.members.filter((member) => member.status === "connected");
}

export function joinRoom(room: LiveRoom, member: NewRoomMember): LiveRoom {
  const existing = room.members.find((item) => item.userId === member.userId);
  if (existing) {
    if (existing.status === "left") throw new Error("You left this room");
    if (existing.status === "forfeited") {
      if (room.phase === "finished") return room;
      throw new Error("Reconnect window expired");
    }
    if (
      existing.disconnectedAt !== undefined &&
      Date.now() - existing.disconnectedAt >= 20_000
    )
      throw new Error("Reconnect window expired");
    existing.status = "connected";
    existing.disconnectedAt = undefined;
    return room;
  }
  if (room.phase !== "lobby") throw new Error("Room has already started");
  if (
    room.members.filter(
      (item) => item.status === "connected" || item.status === "disconnected",
    ).length >= room.maxPlayers
  )
    throw new Error("Room is full");
  room.members.push({
    ...member,
    status: "connected",
    ready: false,
    score: 0,
    guessCount: 0,
    rematchReady: false,
    feedback: [],
    guesses: [],
  });
  return room;
}

export function setReady(
  room: LiveRoom,
  userId: string,
  ready: boolean,
): LiveRoom {
  if (room.phase !== "lobby") throw new Error("Room is not in lobby");
  const member = room.members.find(
    (item) => item.userId === userId && item.status === "connected",
  );
  if (!member) throw new Error("Member is not connected");
  member.ready = ready;
  return room;
}

export function beginCountdown(room: LiveRoom, userId: string): LiveRoom {
  if (room.hostId !== userId)
    throw new Error("Only the host can start the room");
  if (room.phase !== "lobby") throw new Error("Room is not in lobby");
  if (activeMembers(room).filter((member) => member.ready).length < 2)
    throw new Error("At least two ready members are required");
  room.phase = "countdown";
  return room;
}

export function beginRound(room: LiveRoom, now = Date.now()): LiveRoom {
  if (room.phase !== "countdown" && room.phase !== "round_result")
    throw new Error("Room cannot begin a round now");
  room.phase = "playing";
  room.roundNumber += 1;
  room.roundStartedAt = now;
  room.roundFinishedAt = undefined;
  room.roundEndsAt = now + room.roundDurationSeconds * 1000;
  room.correctUserId = undefined;
  room.winnerId = undefined;
  room.finishReason = undefined;
  room.answerName = undefined;
  for (const member of room.members) {
    member.guessCount = 0;
    member.feedback = [];
    member.guesses = [];
    member.rematchReady = false;
  }
  return room;
}

export function finishRound(
  room: LiveRoom,
  reason: RoundFinishReason = "time_expired",
  now = Date.now(),
): LiveRoom {
  room.phase = "finished";
  room.roundEndsAt = undefined;
  room.roundFinishedAt = now;
  room.finishReason = reason;
  return room;
}

export function recordGuess(
  room: LiveRoom,
  userId: string,
  guess: PrivateGuess,
  now = Date.now(),
): { room: LiveRoom; points: number } {
  if (room.phase !== "playing" || !room.roundEndsAt || now >= room.roundEndsAt)
    throw new Error("Round is not accepting guesses");
  const member = room.members.find(
    (item) => item.userId === userId && item.status === "connected",
  );
  if (!member) throw new Error("Member is not connected");
  if (member.guessCount >= 8) throw new Error("Guess limit reached");
  member.guessCount += 1;
  member.feedback.push(Object.values(guess.comparison));
  const points = guess.isCorrect ? ROUND_WIN_POINTS : 0;
  member.guesses.push({ ...guess, points });
  if (guess.isCorrect) {
    member.score += points;
    room.correctUserId = userId;
    room.winnerId = userId;
    finishRound(room, "correct", now);
  } else if (
    activeMembers(room).length > 0 &&
    activeMembers(room).every((item) => item.guessCount >= 8)
  ) {
    finishRound(room, "guesses_exhausted", now);
  }
  return { room, points };
}

export function disconnectMember(
  room: LiveRoom,
  userId: string,
  now = Date.now(),
): LiveRoom {
  const member = room.members.find(
    (item) => item.userId === userId && item.status === "connected",
  );
  if (!member) return room;
  member.status = "disconnected";
  member.disconnectedAt = now;
  if (room.hostId === userId)
    room.hostId = activeMembers(room)[0]?.userId ?? userId;
  return room;
}

export function awardForfeitWin(
  room: LiveRoom,
  winnerId: string,
  reason: "disconnect" | "surrender",
): LiveRoom {
  if (room.phase !== "playing") return room;
  const winner = room.members.find(
    (member) => member.userId === winnerId && member.status === "connected",
  );
  if (!winner) throw new Error("Winner is not connected");
  winner.score += ROUND_WIN_POINTS;
  room.winnerId = winnerId;
  finishRound(room, reason);
  return room;
}

export function surrenderMember(room: LiveRoom, userId: string): LiveRoom {
  if (room.phase !== "playing") throw new Error("Match is not in progress");
  const member = room.members.find(
    (item) => item.userId === userId && item.status === "connected",
  );
  if (!member) throw new Error("Member is not connected");
  member.status = "forfeited";
  member.disconnectedAt = undefined;
  const connected = activeMembers(room);
  if (connected.length === 1)
    awardForfeitWin(room, connected[0].userId, "surrender");
  return room;
}

export function forfeitExpiredMembers(
  room: LiveRoom,
  now = Date.now(),
): LiveRoom {
  for (const member of room.members) {
    if (
      member.status === "disconnected" &&
      member.disconnectedAt !== undefined &&
      now - member.disconnectedAt >= 20_000
    ) {
      member.status = "forfeited";
    }
  }
  const connected = activeMembers(room);
  if (
    room.phase === "playing" &&
    connected.length === 1 &&
    room.members.some((member) => member.status === "forfeited")
  ) {
    awardForfeitWin(room, connected[0].userId, "disconnect");
  }
  return room;
}

export function leaveRoom(room: LiveRoom, userId: string): LiveRoom {
  const member = room.members.find((item) => item.userId === userId);
  if (!member) throw new Error("Member was not found");
  if (room.phase === "playing" && member.status === "connected")
    return surrenderMember(room, userId);
  member.status = "left";
  member.ready = false;
  member.rematchReady = false;
  member.disconnectedAt = undefined;
  if (room.hostId === userId)
    room.hostId = activeMembers(room)[0]?.userId ?? room.hostId;
  return room;
}

export function hasActiveMembership(room: LiveRoom): boolean {
  return room.members.some(
    (member) =>
      member.status === "connected" || member.status === "disconnected",
  );
}

export function cancelRoom(room: LiveRoom): LiveRoom {
  room.phase = "cancelled";
  room.roundEndsAt = undefined;
  return room;
}

export function voteRematch(room: LiveRoom, userId: string): LiveRoom {
  if (room.phase !== "finished") throw new Error("Match is not finished");
  const member = room.members.find(
    (item) => item.userId === userId && item.status === "connected",
  );
  if (!member) throw new Error("Member is not connected");
  member.rematchReady = true;
  const eligible = room.members.filter((item) => item.status === "connected");
  if (eligible.length >= 2 && eligible.every((item) => item.rematchReady))
    room.phase = "countdown";
  return room;
}
