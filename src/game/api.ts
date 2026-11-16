import type {
  ActionResult,
  AvatarAppearance,
  GameAction,
  Room,
  RoomDetail,
  User,
} from "./types";
import {
  getProfile,
  localRoom,
  renameProfile,
  updateProfileAvatar,
} from "./localRoom";

async function local<T>(fn: () => T): Promise<T> {
  // Mirror the original async API so call sites (which await) keep working.
  return Promise.resolve(fn());
}

export const api = {
  me: () => local<{ user: User }>(() => ({ user: getProfile() })),
  auth: (_mode: "login" | "register", username: string) =>
    local<{ user: User }>(() => {
      // Single-player build: no passwords, just name the shepherd.
      renameProfile(username);
      return { user: getProfile() };
    }),
  logout: () => local<{ ok: boolean }>(() => ({ ok: true })),
  updateProfile: (avatar: AvatarAppearance) =>
    local<{ user: User }>(() => {
      updateProfileAvatar(avatar);
      return { user: getProfile() };
    }),
  rooms: () => local<{ rooms: Room[] }>(() => ({ rooms: localRoom.listRooms() })),
  deleteRoom: (id: string) =>
    local<{ deletedRoomId: string; rooms: Room[] }>(() =>
      localRoom.deleteRoom(id),
    ),
  create: (name: string) => local<RoomDetail>(() => localRoom.createRoom(name)),
  join: (_code: string) => local<RoomDetail>(() => localRoom.joinRoom(_code)),
  room: (id: string) => local<RoomDetail>(() => localRoom.getRoom(id)),
  action: (id: string, action: GameAction) =>
    local<ActionResult>(() => localRoom.applyAction(id, action)),
};