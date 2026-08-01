import { describe, expect, it } from "vitest";
import { beginCountdown, beginRound, createLiveRoom, disconnectMember, forfeitExpiredMembers, joinRoom, recordGuess, setReady, voteRematch } from "./room-state.js";

const host = { userId: "host", displayName: "Host", status: "connected" as const, ready: false, score: 0, guessCount: 0, joinedAt: 0 };
describe("room state", () => {
  it("requires two ready players and limits each member to eight guesses", () => {
    const room = createLiveRoom({ id: "room", code: "ABC123", hostId: "host", isPublic: false, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60, host });
    room.members.push({ ...host, userId: "guest", displayName: "Guest", ready: true, rematchReady: false, feedback: [] });
    setReady(room, "host", true); beginCountdown(room, "host"); beginRound(room, 0);
    for (let index = 0; index < 8; index += 1) recordGuess(room, "host", false, ["mismatch"], 1);
    expect(() => recordGuess(room, "host", false, [], 1)).toThrow("Guess limit reached");
  });
  it("allows a 20-second reconnect window before forfeit", () => {
    const room = createLiveRoom({ id: "room", code: "ABC123", hostId: "host", isPublic: false, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60, host });
    disconnectMember(room, "host", 0); forfeitExpiredMembers(room, 19_999);
    expect(room.members[0].status).toBe("disconnected");
    forfeitExpiredMembers(room, 20_000);
    expect(room.members[0].status).toBe("forfeited");
  });
  it("reconnects an existing member during a match", () => {
    const room = createLiveRoom({ id: "room", code: "ABC123", hostId: "host", isPublic: false, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60, host });
    room.phase = "playing"; disconnectMember(room, "host", Date.now());
    joinRoom(room, host);
    expect(room.members[0].status).toBe("connected");
  });
  it("starts a rematch only after both players vote and preserves score", () => {
    const room = createLiveRoom({ id: "room", code: "ABC123", hostId: "host", isPublic: false, maxPlayers: 2, roundCount: 1, roundDurationSeconds: 60, host });
    room.members.push({ ...host, userId: "guest", displayName: "Guest", ready: true, rematchReady: false, feedback: [] }); room.phase = "finished"; room.members[0].score = 700;
    voteRematch(room, "host"); expect(room.phase).toBe("finished"); voteRematch(room, "guest"); expect(room.phase).toBe("countdown"); beginRound(room, 10);
    expect(room.members[0].score).toBe(700); expect(room.members[0].feedback).toEqual([]);
  });
});
