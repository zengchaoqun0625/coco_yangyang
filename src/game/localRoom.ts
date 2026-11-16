// Local single-player runtime: replaces the Go server's REST + WebSocket layer.
// - Auth is gone: one local shepherd saved in localStorage (no password).
// - Rooms/farms are created and owned locally, archived in localStorage.
// - A tiny fake WebSocket surface (LocalRoomSocket) keeps App.tsx wiring intact.

import type {
  ActionResult,
  AvatarAppearance,
  FarmState,
  GameAction,
  Player,
  Room,
  RoomDetail,
  RoomRecord,
  User,
  Vec2,
} from "./types";
import {
  allowedPosition,
  applyAction,
  cloneState,
  initialState,
  newID,
  tick,
} from "./engine";

const SAVE_KEY = "little-flock-single-v1";
const PROFILE_KEY = "little-flock-profile-v1";

interface LocalSave {
  rooms: Record<string, RoomRecord>;
}
interface LocalProfile {
  id: string;
  username: string;
  avatar: AvatarAppearance;
}

function loadJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable: keep playing in memory */
  }
}

function defaultProfileName() {
  const names = ["小牧羊人", "山风", "云朵收集家", "青草团子", "溪边散步的人"];
  return names[Math.floor(Math.random() * names.length)];
}

export const emptyAvatar: AvatarAppearance = { skin: 0, hair: 0, outfit: 0, hat: 0 };

// ---- local player (no authentication) ----
function readProfile(): LocalProfile {
  const cached = loadJSON<LocalProfile>(PROFILE_KEY);
  if (cached?.id && cached.username) return cached;
  const profile: LocalProfile = {
    id: newID(),
    username: defaultProfileName(),
    avatar: emptyAvatar,
  };
  saveJSON(PROFILE_KEY, profile);
  return profile;
}
let profile: LocalProfile = readProfile();

export function getProfile(): User {
  return { id: profile.id, username: profile.username, avatar: profile.avatar };
}
export function renameProfile(username: string) {
  const name = username.trim().slice(0, 24) || "小牧羊人";
  profile = { ...profile, username: name };
  saveJSON(PROFILE_KEY, profile);
}
export function updateProfileAvatar(avatar: AvatarAppearance) {
  profile = { ...profile, avatar };
  saveJSON(PROFILE_KEY, profile);
}

// ---- room storage ----
function readSave(): LocalSave {
  const s = loadJSON<LocalSave>(SAVE_KEY);
  return s && s.rooms ? s : { rooms: {} };
}
function persist() {
  saveJSON(SAVE_KEY, { rooms: localRoom.rooms });
}

function nowMS() {
  return Date.now();
}
function inviteCode(len = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < len; i++)
    code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}
function uniqueCode(existing: Record<string, RoomRecord>) {
  let code = inviteCode();
  while (Object.values(existing).some((r) => r.room.code === code))
    code = inviteCode();
  return code;
}

interface SpawnState {
  position: Vec2;
  facing: number;
  jumpAt?: number;
}

// ---- local room runtime (one shepherd, many local farms) ----
class LocalRoomRuntime {
  rooms: Record<string, RoomRecord> = {};
  streams = new Map<string, LocalRoomSocket>();
  spawn = new Map<string, SpawnState>();
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private lastPersistAt = 0;

  constructor() {
    this.rooms = readSave().rooms;
    // resume the farm clock from the last moment we wrote it
    for (const record of Object.values(this.rooms)) {
      // keep updatedAt honest: seconds spent away are simulated away on load
      // by the next tick's delta clamp (max 10s), like the original server.
    }
  }

  boot() {
    if (this.tickTimer) return;
    this.tickTimer = setInterval(() => this.pump(), 1000);
  }

  listRooms(): Room[] {
    return Object.values(this.rooms)
      .filter((r) => r.room.id) // all rooms are the local user's own
      .map((r) => ({
        ...r.room,
        memberCount: Object.keys(r.members).length,
        onlineCount: this.streams.has(r.room.id) ? 1 : 0,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  createRoom(name: string): RoomDetail {
    const at = nowMS();
    const id = newID();
    const code = uniqueCode(this.rooms);
    const record: RoomRecord = {
      room: {
        id,
        name: name.trim().slice(0, 32) || "云朵牧场",
        code,
        ownerId: profile.id,
        memberCount: 1,
        onlineCount: 1,
        createdAt: at,
      },
      members: { [profile.id]: true },
      state: initialState(at),
    };
    this.rooms[id] = record;
    persist();
    return this.roomDetail(record, at);
  }

  /** Single player: joining is not applicable. Throws a friendly message. */
  joinRoom(_code: string): RoomDetail {
    throw new Error("单机版的小世界由你自己照看，不需要邀请码哦。");
  }

  getRoom(id: string): RoomDetail {
    const record = this.rooms[id];
    if (!record) throw new Error("没有找到这座农场");
    const at = nowMS();
    this.advance(record, at, true);
    return this.roomDetail(record, at);
  }

  deleteRoom(id: string): { deletedRoomId: string; rooms: Room[] } {
    const record = this.rooms[id];
    if (!record) throw new Error("没有找到这座牧场");
    if (record.room.ownerId !== profile.id)
      throw new Error("只有创建这座牧场的主人才能删除它");
    delete this.rooms[id];
    this.spawn.delete(id);
    const stream = this.streams.get(id);
    if (stream) {
      this.streams.delete(id);
      stream.emit({ type: "roomDeleted", roomId: id });
      stream.finish();
    }
    persist();
    return { deletedRoomId: id, rooms: this.listRooms() };
  }

  applyAction(id: string, action: GameAction): ActionResult {
    const record = this.rooms[id];
    if (!record) throw new Error("没有找到这座农场");
    const at = nowMS();
    this.advance(record, at, true);
    // move/chat/whistle never arrive here: they are handled via the stream.
    const leaderId = record.state.grazing.leaderId;
    const leaderOnline =
      leaderId !== null ? this.spawn.get(id)?.position !== undefined : false;
    const actorPosition = this.spawn.get(id)?.position ?? null;
    const next = cloneState(record.state);
    const result = applyAction(next, { ...action, actorID: profile.id, actorPosition, leaderOnline }, at);
    record.state = next;
    persist();
    const serverTime = nowMS();
    this.broadcast(id, { type: "state", state: next, serverTime });
    this.broadcast(id, {
      type: "event",
      text: profile.username + " · " + result.message,
      at: nowMS(),
    });
    return { state: next, message: result.message, serverTime: nowMS() };
  }

  // move/chat/whistle are gatewayed through the stream (like the original ws)
  handleStreamMessage(id: string, data: string) {
    let msg: {
      type?: string;
      position?: Vec2;
      facing?: number;
      jump?: boolean;
      text?: string;
    } = {};
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg.type) return;
    const record = this.rooms[id];
    if (!record) return;
    if (msg.type === "move" && msg.position) {
      const spawn = this.spawn.get(id);
      if (!spawn) return;
      const at = nowMS();
      const p = msg.position;
      this.spawn.set(id, {
        position: allowedPosition(record.state, p, spawn.position),
        facing: msg.facing ?? spawn.facing,
        jumpAt: msg.jump ? at : spawn.jumpAt,
      });
      this.broadcast(id, { type: "presence", players: this.players(id) });
    } else if (msg.type === "chat" && msg.text) {
      this.broadcast(id, {
        type: "chat",
        userId: profile.id,
        username: profile.username,
        text: msg.text.trim().slice(0, 180),
        at: nowMS(),
      });
    } else if (msg.type === "whistle") {
      this.broadcast(id, {
        type: "whistle",
        position: this.spawn.get(id)?.position ?? { x: 0, z: 6 },
        at: nowMS(),
      });
    }
  }

  private advance(record: RoomRecord, at: number, active: boolean) {
    tick(record.state, at, active);
  }

  private pump() {
    const now = nowMS();
    for (const [id, stream] of this.streams) {
      const record = this.rooms[id];
      if (!record) {
        stream.finish();
        this.streams.delete(id);
        continue;
      }
      this.advance(record, now, true);
      stream.emit({ type: "state", state: record.state, serverTime: now });
    }
    if (now - this.lastPersistAt > 5000) {
      this.lastPersistAt = now;
      persist();
    }
  }

  private broadcast(id: string, message: unknown) {
    const stream = this.streams.get(id);
    stream?.emit(message);
  }

  players(id: string): Player[] {
    const spawn = this.spawn.get(id);
    return spawn
      ? [
          {
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            position: spawn.position,
            facing: spawn.facing,
            color: "#de9479",
            jumpAt: spawn.jumpAt,
          },
        ]
      : [];
  }

  private roomDetail(record: RoomRecord, at: number): RoomDetail {
    return {
      room: {
        ...record.room,
        memberCount: Object.keys(record.members).length,
        onlineCount: this.streams.has(record.room.id) ? 1 : 0,
      },
      state: record.state,
      serverTime: at,
    };
  }

  openStream(roomId: string): LocalRoomSocket {
    const record = this.rooms[roomId];
    if (!record || !record.members[profile.id]) throw new Error("没有找到这座农场");
    // fresh presence on enter
    if (!this.spawn.has(roomId)) this.spawn.set(roomId, { position: { x: 0, z: 6 }, facing: Math.PI });
    const stream = new LocalRoomSocket(roomId, this);
    this.streams.delete(roomId);
    this.streams.set(roomId, stream);
    this.broadcast(roomId, { type: "presence", players: this.players(roomId) });
    stream.handshake = true;
    this.boot();
    stream.emit({ type: "state", state: record.state, serverTime: nowMS() });
    return stream;
  }

  closeStream(roomId: string) {
    this.streams.delete(roomId);
    this.spawn.delete(roomId);
  }
}

// WebSocket-shaped bridge so App.tsx keeps its existing message plumbing.
export class LocalRoomSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = LocalRoomSocket.OPEN; // opens synchronously
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  handshake = false;
  private runtime: LocalRoomRuntime;
  private roomId: string;
  private closed = false;
  private pending: string[] = [];

  constructor(roomId: string, runtime: LocalRoomRuntime) {
    this.roomId = roomId;
    this.runtime = runtime;
  }
  send(data: string) {
    if (this.closed) return;
    this.runtime.handleStreamMessage(this.roomId, data);
  }
  emit(message: unknown) {
    if (this.closed) return;
    const data = JSON.stringify(message);
    if (this.onmessage) {
      this.onmessage({ data });
    } else {
      // handlers attach synchronously after openStream() returns;
      // flush them on the next microtask.
      this.pending.push(data);
      queueMicrotask(() => this.flush());
    }
  }
  private flush() {
    if (!this.onmessage || this.closed) return;
    while (this.pending.length) this.onmessage({ data: this.pending.shift()! });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = LocalRoomSocket.CLOSED;
    this.runtime.closeStream(this.roomId);
    this.onclose?.();
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.readyState = LocalRoomSocket.CLOSED;
    this.onclose?.();
  }
}

export const localRoom = new LocalRoomRuntime();