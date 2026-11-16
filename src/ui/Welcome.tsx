import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  Cloud,
  Flower2,
  Leaf,
  LoaderCircle,
  Pencil,
  Shirt,
  Sprout,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { api } from "../game/api";
import { playSound } from "../game/audio";
import type { Room, RoomDetail, User } from "../game/types";
import { getProfile } from "../game/localRoom";
import AvatarEditor from "./AvatarEditor";
import "./profile.css";

export default function Welcome({
  user,
  setUser,
  enter,
}: {
  user: User | null;
  setUser: (u: User | null) => void;
  enter: (r: RoomDetail) => void;
}) {
  const [screen, setScreen] = useState<"title" | "rooms">("title");
  const [profile, setProfile] = useState<User>(() => user ?? getProfile());
  const [name, setName] = useState("云朵牧场"),
    [renaming, setRenaming] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]),
    [roomsLoading, setRoomsLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setRooms([]);
    setRoomsLoading(true);
    setError("");
    api
      .rooms()
      .then((r) => {
        if (active) setRooms(r.rooms);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setRoomsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    playSound();
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接牧场失败");
    } finally {
      setBusy(false);
    }
  };
  const applyProfile = () => {
    const next = getProfile();
    setProfile(next);
    setUser(next);
  };
  return (
    <main className="welcome">
      {editingAvatar && (
        <AvatarEditor
          user={profile}
          onSave={(next) => {
            setProfile(next);
            setUser(next);
          }}
          onClose={() => setEditingAvatar(false)}
        />
      )}
      <img
        className="welcome-art"
        src="./art/pasture-concept.webp"
        alt="春日的溪边牧场，柔软的小羊和盛开的花田"
      />
      <div className="welcome-shade" />
      <div className="welcome-brand">
        <img src="./favicon.svg" alt="" /> Little Flock{" "}
        <span>一小片自己的春天</span>
      </div>
      {screen === "title" ? (
        <div className="title-content">
          <div className="title-flower">
            <Flower2 size={24} />
            <span>把日子过得，像云朵一样软。</span>
          </div>
          <h1>
            小羊<span>慢慢</span>
            <i>
              <Leaf size={40} />
            </i>
          </h1>
          <p>
            种下一点期待，照顾一群小可爱。
            <br />
            玩累了就学一会儿，学完了接着养羊。
          </p>
          <button
            className="start-button"
            onClick={() => {
              playSound();
              setScreen("rooms");
            }}
          >
            开启牧场生活 <ArrowRight size={22} />
          </button>
          <button
            className="welcome-login"
            onClick={() => {
              playSound();
              applyProfile();
              setScreen("rooms");
            }}
          >
            以 <b>{profile.username}</b> 的身份回家 <span>↗</span>
          </button>
          <div className="title-pills">
            <span>
              <Cloud size={16} />
              12 种软乎乎的小羊
            </span>
            <span>
              <Sprout size={16} />
              四时耕种
            </span>
            <span>
              <Users size={16} />
              认数字 · 学字母 · 读唐诗
            </span>
          </div>
        </div>
      ) : (
        <section
          className="entry-card"
          aria-label="选择牧场"
          aria-busy={busy || roomsLoading}
        >
          <button
            className="entry-back icon-button"
            aria-label="返回"
            disabled={busy}
            onClick={() => {
              setScreen("title");
              setError("");
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="entry-emblem">
            <img src="./favicon.svg" alt="" />
          </div>
          <h2>你好，{profile.username}</h2>
          <p>有小羊在等你。进度会自动保存在这台设备上。</p>
          {roomsLoading && (
            <div className="entry-note" role="status">
              <LoaderCircle className="spin" size={15} />
              正在看看你的小世界…
            </div>
          )}
          {rooms.length > 0 && (
            <div className="room-list">
              {rooms.map((room) => (
                <div className="room-list-item" key={room.id}>
                  <button
                    className="room-enter"
                    disabled={busy}
                    onClick={() =>
                      run(async () => enter(await api.room(room.id)))
                    }
                  >
                    <span className="room-icon">
                      <Sprout />
                    </span>
                    <span>
                      <strong>{room.name}</strong>
                      <small>{room.memberCount} 位牧羊人 · 全部由你照顾</small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                  {room.ownerId === profile.id && (
                    <button
                      className="room-delete"
                      aria-label={`删除牧场 ${room.name}`}
                      disabled={busy}
                      onClick={() =>
                        setDeletingRoom(
                          deletingRoom === room.id ? null : room.id,
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {deletingRoom === room.id && (
                    <div className="room-delete-confirm">
                      <p>
                        确定删除「{room.name}
                        」吗？这里的小羊、田地和所有进度都会永久删除。
                      </p>
                      <div>
                        <button
                          disabled={busy}
                          onClick={() => setDeletingRoom(null)}
                        >
                          留着它
                        </button>
                        <button
                          className="confirm-delete"
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const result = await api.deleteRoom(room.id);
                              setRooms(result.rooms);
                              setDeletingRoom(null);
                              if (localStorage.getItem("flock-room") === room.id)
                                localStorage.removeItem("flock-room");
                            })
                          }
                        >
                          确定删除牧场
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => enter(await api.create(name.trim())));
              }}
            >
              <label>
                新建一座牧场
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="给它起个名字，例如：云朵牧场"
                  required
                  disabled={busy}
                  minLength={1}
                  maxLength={32}
                  autoComplete="off"
                  spellCheck={false}
                  aria-describedby={error ? "entry-error" : undefined}
                />
              </label>
              <button className="primary-button" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Sprout size={18} />
                )}{" "}
                种下我的小世界
              </button>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await api.auth("register", profile.username);
                  applyProfile();
                  setRenaming(false);
                });
              }}
            >
              <label>
                给牧羊人换个名字
                <input
                  autoComplete="off"
                  value={profile.username}
                  onChange={(e) =>
                    setProfile({ ...profile, username: e.target.value })
                  }
                  placeholder="中文、字母、数字都可以"
                  required
                  disabled={busy}
                  minLength={2}
                  maxLength={24}
                  spellCheck={false}
                />
              </label>
              <button className="primary-button" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <Pencil size={18} />
                )}{" "}
                改好了
              </button>
            </form>
          )}
          <div className="entry-actions">
            <button
              className="profile-link"
              disabled={busy}
              onClick={() => setEditingAvatar(true)}
            >
              <Shirt size={16} /> 我的牧羊人形象
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => {
                setRenaming(!renaming);
                setError("");
              }}
            >
              <Pencil size={14} />
              {renaming ? "收起改名" : "换个名字"}
            </button>
          </div>
          {error && (
            <div className="entry-error" id="entry-error" role="alert">
              <X size={16} />
              {error}
            </div>
          )}
          <div className="entry-note">
            <Leaf size={13} />
            不用赶路，慢慢来就很好。
          </div>
        </section>
      )}
      <div className="welcome-footer">
        <span>一款关于照顾、相遇和慢生活的游戏 · 单机版</span>
        <span>
          戴上耳机，听见春天 <span aria-hidden="true">♫</span>
        </span>
      </div>
    </main>
  );
}