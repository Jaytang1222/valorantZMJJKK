import { describe, expect, it } from "vitest";
import { FORFEIT_WIN_POINTS, beginCountdown, beginRound, createLiveRoom, disconnectMember, forfeitExpiredMembers, joinRoom, leaveRoom, recordGuess, setReady, surrenderMember, voteRematch } from "./room-state.js";

const host = { userId: "host", displayName: "Host", status: "connected" as const, ready: false, score: 0, guessCount: 0, joinedAt: 0 };
const wrongGuess = { canonicalName: "Wrong", comparison: { country: "mismatch" }, isCorrect: false, points: 0 };

function createRoom() {
  return createLiveRoom({ id: "room", code: "ABC123", hostId: "host", isPublic: false, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60, host });
}

function addGuest(room: ReturnType<typeof createRoom>) {
  room.members.push({ ...host, userId: "guest", displayName: "Guest", ready: true, rematchReady: false, feedback: [], guesses: [] });
}

describe("room state", () => {
  it("requires two ready players and limits each member to eight guesses", () => {
    const room = createRoom();
    addGuest(room);
    setReady(room, "host", true);
    beginCountdown(room, "host");
    beginRound(room, 0);
    for (let index = 0; index < 8; index += 1) recordGuess(room, "host", wrongGuess, 1);
    expect(() => recordGuess(room, "host", wrongGuess, 1)).toThrow("Guess limit reached");
    expect(room.members[0].guesses).toHaveLength(8);
  });

  it("allows a 20-second reconnect window before forfeit", () => {
    const room = createRoom();
    disconnectMember(room, "host", 0);
    forfeitExpiredMembers(room, 19_999);
    expect(room.members[0].status).toBe("disconnected");
    forfeitExpiredMembers(room, 20_000);
    expect(room.members[0].status).toBe("forfeited");
  });

  it("awards the remaining player for a reconnect timeout", () => {
    const room = createRoom();
    addGuest(room);
    room.phase = "playing";
    disconnectMember(room, "host", 0);
    forfeitExpiredMembers(room, 20_000);
    expect(room.phase).toBe("finished");
    expect(room.winnerId).toBe("guest");
    expect(room.members[1].score).toBe(FORFEIT_WIN_POINTS);
    expect(room.finishReason).toBe("disconnect");
  });

  it("records a surrender as a scored win for the opponent", () => {
    const room = createRoom();
    addGuest(room);
    room.phase = "playing";
    surrenderMember(room, "host");
    expect(room.members[0].status).toBe("forfeited");
    expect(room.phase).toBe("finished");
    expect(room.winnerId).toBe("guest");
    expect(room.members[1].score).toBe(FORFEIT_WIN_POINTS);
    expect(room.finishReason).toBe("surrender");
  });

  it("reconnects an existing member during a match", () => {
    const room = createRoom();
    room.phase = "playing";
    disconnectMember(room, "host", Date.now());
    joinRoom(room, host);
    expect(room.members[0].status).toBe("connected");
  });

  it("releases a lobby place and transfers the host when the host leaves", () => {
    const room = createRoom();
    addGuest(room);
    leaveRoom(room, "host");
    expect(room.members[0].status).toBe("left");
    expect(room.hostId).toBe("guest");
    joinRoom(room, { ...host, userId: "new-user", displayName: "New user" });
    expect(room.members.at(-1)?.userId).toBe("new-user");
  });

  it("starts a rematch only after both players vote and preserves score", () => {
    const room = createRoom();
    addGuest(room);
    room.phase = "finished";
    room.members[0].score = 700;
    voteRematch(room, "host");
    expect(room.phase).toBe("finished");
    voteRematch(room, "guest");
    expect(room.phase).toBe("countdown");
    beginRound(room, 10);
    expect(room.members[0].score).toBe(700);
    expect(room.members[0].feedback).toEqual([]);
    expect(room.members[0].guesses).toEqual([]);
  });
});
