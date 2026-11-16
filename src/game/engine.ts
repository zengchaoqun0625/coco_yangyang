// Local single-player game engine.
// Faithful port of the original Go server rules (server/game.go, progression.go, model.go)
// so every existing action behaves exactly as before, but runs entirely in the browser.

import type {
  FarmState,
  GameAction,
  Order,
  Plot,
  RegionId,
  Sheep,
  Vec2,
} from "./types";
import catalog from "./catalog.json";
import regionsData from "./regions.json";

export const xpThresholds = catalog.config.xpThresholds as number[];

// ---- world regions (same shape as server/regions.json) ----
interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}
interface RegionDef {
  id: RegionId;
  viewPoint?: Vec2;
  viewRadius?: number;
  bounds?: Bounds;
  returnPoint: Vec2;
  returnRadius?: number;
  grazePoint?: Vec2;
  grazeRadius?: number;
  waterPoint?: Vec2;
  waterRadius?: number;
  forageRadius?: number;
  forageNodes?: {
    id: string;
    regionId?: string;
    itemId: string;
    position: Vec2;
  }[];
}
const worldMap = regionsData as unknown as {
  bounds: Bounds;
  home: RegionDef;
  meadow: RegionDef;
  forest: RegionDef;
  highland: RegionDef;
};

export function cropByID(id: string) {
  return catalog.crops.find((c) => c.id === id);
}
export function breedByID(id: string) {
  return (catalog.breeds as { id: string; name: string; woolValue: number }[]).find(
    (b) => b.id === id,
  );
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
export function newID() {
  const b = new Uint8Array(12);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(b);
  } else {
    for (let i = 0; i < 12; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}
function randInt(n: number) {
  return Math.floor(Math.random() * n);
}
const traits = catalog.traits as string[];

export function makeSheep(
  breedID: string,
  name: string,
  sex: string,
  at: number,
  adult: boolean,
): Sheep {
  const s: Sheep = {
    id: newID(),
    name,
    breedId: breedID,
    sex: sex as "female" | "male",
    bornAt: at,
    adultAt: at + 300000,
    hunger: 85,
    happiness: 80,
    wool: 0,
    lastBredAt: 0,
    petAt: 0,
    position: { x: -8 + Math.random() * 6, z: Math.random() * 6 },
    trait: traits[randInt(traits.length)],
  };
  if (adult) {
    s.bornAt = at - 600000;
    s.adultAt = at - 1;
    s.wool = 100;
  }
  return s;
}

export function initialState(at: number): FarmState {
  const s: FarmState = {
    progression: { step: 0, forestFinds: 0, lastStargazeDay: 0 },
    buildings: { shelter: false, garden: false },
    regions: ["home"],
    grazing: { active: false, leaderId: null, regionId: "home", startedAt: 0, grazeSeconds: 0, watered: false, completedCount: 0 },
    forageNodes: [],
    version: 1,
    createdAt: at,
    updatedAt: at,
    coins: 180,
    xp: 0,
    level: 1,
    inventory: { feed: 2 },
    sheep: [],
    plots: [],
    orders: [],
    upgrades: { pasture: 0, watering: 0 },
    stats: { harvested: 0, woolCollected: 0, births: 0, ordersCompleted: 0 },
    discoveries: [],
    weather: "sunny",
    day: 1,
    dayProgress: 1 / 3,
    season: "春日",
    clockSeconds: 240,
  };
  for (const node of worldMap.forest.forageNodes ?? []) {
    s.forageNodes.push({
      id: node.id,
      regionId: "forest",
      itemId: node.itemId as "mushroom" | "herb",
      position: node.position,
      readyAt: 0,
    });
  }
  return s;
}

function makeGarden(): Plot[] {
  const plots: Plot[] = [];
  for (let i = 0; i < 6; i++) {
    plots.push({
      id: `plot-${i + 1}`,
      position: { x: 3 + (i % 3) * 1.7, z: -3 + Math.floor(i / 3) * 1.7 },
      cropId: null,
      plantedAt: 0,
      wateredAt: 0,
      readyAt: 0,
    });
  }
  return plots;
}

export function tick(s: FarmState, at: number, active: boolean) {
  const dt = clamp((at - s.updatedAt) / 1000, 0, 10);
  s.updatedAt = at;
  if (active) {
    s.clockSeconds += dt;
    const oldDay = s.day;
    s.day = Math.floor(s.clockSeconds / 720) + 1;
    s.dayProgress = (Math.floor(s.clockSeconds * 1000) % 720000) / 720000;
    s.season = (["春日", "夏日", "秋日", "冬日"] as const)[
      Math.floor(((s.day - 1) / 7)) % 4
    ];
    if (s.day !== oldDay) {
      s.weather = s.day % 4 === 0 ? "rain" : "sunny";
      for (let i = 0; i < s.orders.length; i++) {
        if (s.orders[i].completed) s.orders[i] = newOrder(s);
      }
    }
    for (const sh of s.sheep) {
      sh.hunger = clamp(sh.hunger - dt * 0.025, 10, 100);
      sh.happiness = clamp(sh.happiness - dt * 0.008, 30, 100);
      if (sh.adultAt <= at) {
        let rate = 0.5;
        if (sh.breedId === "cloud") rate *= 1.1;
        if (sh.hunger < 25) rate *= 0.4;
        if (sh.breedId === "moon" && (s.dayProgress < 0.24 || s.dayProgress > 0.78))
          rate *= 1.2;
        sh.wool = clamp(sh.wool + dt * rate, 0, 100);
      }
    }
  }
  if (s.weather === "rain") {
    for (const p of s.plots) {
      if (p.cropId && p.wateredAt === 0) waterPlot(s, p, at);
    }
  }
}

function addXP(s: FarmState, n: number) {
  s.xp += n;
  for (let i = 0; i < xpThresholds.length; i++) {
    if (s.xp >= xpThresholds[i]) s.level = i + 1;
  }
}
export function capacity(s: FarmState) {
  return [8, 14, 24][s.upgrades.pasture];
}
function sheepByID(s: FarmState, id: string) {
  return s.sheep.find((x) => x.id === id);
}
function plotByID(s: FarmState, id: string) {
  return s.plots.find((x) => x.id === id);
}
function itemPrice(id: string, buy: boolean) {
  if (!buy) {
    if (id === "mushroom") return 12;
    if (id === "herb") return 16;
  }
  if (id === "feed") {
    if (buy) return 5;
    return 0;
  }
  if (id.startsWith("seed_")) {
    const c = cropByID(id.slice(5));
    if (c && buy) return c.seedPrice;
    return 0;
  }
  if (id.startsWith("wool_")) {
    const b = breedByID(id.slice(5));
    if (b && !buy) return b.woolValue;
    return 0;
  }
  const c = cropByID(id);
  if (c && !buy) return c.sellPrice;
  return 0;
}
function discover(s: FarmState, id: string) {
  if (s.discoveries.includes(id)) return false;
  s.discoveries.push(id);
  addXP(s, 35);
  return true;
}
function randomBreed(s: FarmState) {
  const n = randInt(1000);
  let tier = "common";
  if (n < 10 && s.level >= 5 && s.regions.includes("highland")) tier = "legendary";
  else if (n < 80 && s.regions.includes("highland")) tier = "epic";
  else if (n < 280 && s.regions.includes("forest")) tier = "rare";
  else if (n < 600) tier = "uncommon";
  const ids = (catalog.breeds as { id: string; rarity: string }[])
    .filter((b) => b.rarity === tier)
    .map((b) => b.id);
  return ids[randInt(ids.length)];
}
function waterPlot(s: FarmState, p: Plot, at: number) {
  if (!p.cropId || p.wateredAt > 0) return;
  p.wateredAt = at;
  const c = cropByID(p.cropId);
  if (!c) return;
  p.readyAt = at + Math.floor(c.growSeconds * 1000 * (1 - s.upgrades.watering * 0.1));
}
function cropUnlocked(s: FarmState, id: string) {
  const step = (
    { clover: 6, carrot: 9, wheat: 10, daisy: 12, lavender: 13, pumpkin: 14, moonflower: 15 } as Record<string, number>
  )[id];
  return step !== undefined && s.progression.step >= step;
}
function newOrder(s: FarmState): Order {
  const ids: string[] = [];
  for (const crop of catalog.crops) {
    if (cropUnlocked(s, crop.id)) ids.push(crop.id);
  }
  for (const d of s.discoveries) ids.push("wool_" + d);
  const id = ids[randInt(ids.length)];
  const n = 2 + randInt(3);
  return {
    id: newID(),
    title: ["村口集市的订单", "邻居的小小心愿", "小镇庆典的准备", "邮差带来的约定"][randInt(4)],
    itemId: id,
    quantity: n,
    reward: Math.floor(itemPrice(id, false) * n * 1.4) + 5,
    xp: 20 + n * 5,
    completed: false,
  };
}

function fail(message: string): [never, Error] {
  throw new Error(message);
}

// ---- action context (was filled by the server under the room lock) ----
export interface ActionContext {
  actorID: string;
  actorPosition: Vec2 | null;
  leaderOnline: boolean;
}
export type EngineAction = GameAction & ActionContext;

export function applyAction(
  s: FarmState,
  a: EngineAction,
  at: number,
): { message: string } {
  checkProgression(s, a);
  let message = "";
  switch (a.type) {
    case "build":
    case "startGraze":
    case "waterFlock":
    case "finishGraze":
    case "unlockRegion":
    case "forage":
    case "rehome":
    case "stargaze": {
      const r = applyProgressionAction(s, a, at);
      message = r.message;
      break;
    }
    case "pet":
    case "feed":
    case "shear":
    case "rename":
    case "breed": {
      const sh = sheepByID(s, a.sheepId);
      if (!sh) throw new Error("没有找到这只小羊");
      switch (a.type) {
        case "pet": {
          if (at - sh.petAt < 15000)
            throw new Error("小羊正享受你的摸摸，稍等一会儿再来吧");
          sh.petAt = at;
          sh.happiness = clamp(sh.happiness + 15, 0, 100);
          addXP(s, 3);
          message = sh.name + "开心地蹭了蹭你 ♡";
          break;
        }
        case "feed": {
          if (sh.hunger > 95) throw new Error("小羊已经吃得饱饱的啦");
          let food = "";
          for (const id of ["feed", "clover", "carrot"]) {
            if (s.inventory[id]! > 0) {
              food = id;
              break;
            }
          }
          if (!food) throw new Error("饲料用完啦，也可以种一些三叶草或胡萝卜");
          s.inventory[food]!--;
          sh.hunger = clamp(sh.hunger + 35, 0, 100);
          sh.happiness = clamp(sh.happiness + 8, 0, 100);
          addXP(s, 2);
          message = sh.name + "吃得香喷喷，心情也变好了";
          break;
        }
        case "shear": {
          if (at < sh.adultAt) throw new Error("小羊还在长身体，长大后再剪毛吧");
          if (sh.wool < 100) throw new Error("绒毛还没有长好，再耐心等一等");
          let n = 2;
          if (sh.happiness >= 90) n = 3;
          s.inventory["wool_" + sh.breedId] = (s.inventory["wool_" + sh.breedId] || 0) + n;
          s.stats.woolCollected += n;
          sh.wool = 0;
          addXP(s, 8);
          message = `收获 ${n} 团${breedByID(sh.breedId)?.name}绒毛，清清爽爽！`;
          break;
        }
        case "rename": {
          const name = a.name.trim();
          const length = [...name].length;
          if (length < 1 || length > 16) throw new Error("给小羊取一个 1–16 字的名字吧");
          sh.name = name;
          message = "以后就叫你" + name + "啦";
          break;
        }
        case "breed": {
          const p = sheepByID(s, a.partnerId);
          if (!p || p.id === sh.id) throw new Error("请选择两只不同的小羊");
          if (sh.sex === p.sex) throw new Error("需要一只羊妈妈和一只羊爸爸");
          if (at < sh.adultAt || at < p.adultAt)
            throw new Error("小羊长大后才能拥有自己的宝宝");
          if (sh.hunger < 55 || p.hunger < 55 || sh.happiness < 65 || p.happiness < 65)
            throw new Error("先照顾好它们：饱腹至少 55，心情至少 65");
          if (
            (sh.lastBredAt > 0 && at - sh.lastBredAt < 360000) ||
            (p.lastBredAt > 0 && at - p.lastBredAt < 360000)
          )
            throw new Error("羊爸妈还需要休息一下，六分钟后再来吧");
          if (s.sheep.length >= capacity(s)) throw new Error("牧场住满啦，先扩建牧场吧");
          if (s.coins < 45) throw new Error("爱心点心需要 45 金币");
          s.coins -= 45;
          sh.lastBredAt = at;
          p.lastBredAt = at;
          let id = sh.breedId;
          if (randInt(2) === 0) id = p.breedId;
          if (randInt(100) < 35) id = randomBreed(s);
          const sex = randInt(2) === 0 ? "male" : "female";
          const child = makeSheep(id, "小" + breedByID(id)?.name, sex, at, false);
          s.sheep.push(child);
          s.stats.births++;
          addXP(s, 30);
          message = "新生命来啦！欢迎" + child.name + " ♡";
          if (discover(s, id)) message += " · 发现全新品种！";
          break;
        }
      }
      break;
    }
    case "buy":
    case "sell": {
      if (a.quantity < 1 || a.quantity > 99) throw new Error("数量需要在 1–99 之间");
      const price = itemPrice(a.itemId, a.type === "buy");
      if (price <= 0) throw new Error("商店没有这件物品");
      const total = price * a.quantity;
      if (a.type === "buy") {
        if (s.coins < total) throw new Error("金币不够啦，出售收获或完成订单赚一些吧");
        s.coins -= total;
        s.inventory[a.itemId] = (s.inventory[a.itemId] || 0) + a.quantity;
        message = `补给已放进背包 · −${total} 金币`;
      } else {
        if ((s.inventory[a.itemId] || 0) < a.quantity) throw new Error("背包里的数量不够");
        s.inventory[a.itemId] = (s.inventory[a.itemId] || 0) - a.quantity;
        s.coins += total;
        message = `收获卖出啦 · +${total} 金币`;
      }
      break;
    }
    case "plant":
    case "water":
    case "harvest": {
      const p = plotByID(s, a.plotId);
      if (!p) throw new Error("没有找到这块田地");
      switch (a.type) {
        case "plant": {
          if (p.cropId) throw new Error("这块地已经种着东西啦");
          const c = cropByID(a.cropId);
          if (!c) throw new Error("还不认识这种种子");
          if ((s.inventory[c.seedId] || 0) < 1) throw new Error("种子用完啦，去小店补充一些吧");
          s.inventory[c.seedId]!--;
          p.cropId = c.id;
          p.plantedAt = at;
          p.wateredAt = 0;
          p.readyAt = 0;
          if (s.weather === "rain") waterPlot(s, p, at);
          addXP(s, 2);
          message = c.name + "种好啦，记得浇水哦";
          break;
        }
        case "water": {
          if (!p.cropId) throw new Error("先种下种子再浇水吧");
          if (p.wateredAt > 0) {
            if (s.progression.step === 7) {
              message = "雨水已经帮你浇好啦，等小苗长大就能收获了";
              break;
            }
            throw new Error("土壤湿润，小苗正在好好长大");
          }
          waterPlot(s, p, at);
          if (s.upgrades.watering >= 2) {
            for (const plot of s.plots) waterPlot(s, plot, at);
          }
          addXP(s, 1);
          message = "咕噜咕噜，小苗喝饱水啦";
          break;
        }
        case "harvest": {
          if (!p.cropId) throw new Error("这里还没有种下作物");
          if (p.wateredAt === 0) throw new Error("小苗有点渴，先给它浇水吧");
          if (at < p.readyAt) throw new Error("作物还在生长，再等一小会儿吧");
          const c = cropByID(p.cropId);
          if (!c) throw new Error("这里还没有种下作物");
          s.inventory[c.id] = (s.inventory[c.id] || 0) + c.yield;
          s.stats.harvested += c.yield;
          addXP(s, c.xp);
          message = `丰收啦！+${c.yield} ${c.name}`;
          p.cropId = null;
          p.plantedAt = 0;
          p.wateredAt = 0;
          p.readyAt = 0;
          break;
        }
      }
      break;
    }
    case "order": {
      const o = s.orders.find((x) => x.id === a.orderId);
      if (!o) throw new Error("没有找到这份订单");
      if (o.completed) throw new Error("这份订单已经送达啦");
      if ((s.inventory[o.itemId] || 0) < o.quantity)
        throw new Error("收获还不够，再照顾一下农场吧");
      s.inventory[o.itemId] = (s.inventory[o.itemId] || 0) - o.quantity;
      s.coins += o.reward;
      addXP(s, o.xp);
      s.stats.ordersCompleted++;
      message = `心愿达成！+${o.reward} 金币 · +${o.xp} 经验`;
      s.orders[s.orders.indexOf(o)] = newOrder(s);
      break;
    }
    case "upgrade": {
      let level: "pasture" | "watering" = a.upgradeId;
      let prices: number[];
      if (level === "pasture") prices = [260, 680];
      else prices = [180, 420];
      if (s.upgrades[level] >= prices.length) throw new Error("已经升级到最好啦");
      const price = prices[s.upgrades[level]];
      if (s.coins < price) throw new Error(`这次升级需要 ${price} 金币`);
      s.coins -= price;
      s.upgrades[level]++;
      addXP(s, 35);
      if (level === "pasture") message = `牧场扩建完成！现在能住 ${capacity(s)} 只小羊`;
      else message = "灌溉升级完成！作物长得更快啦";
      break;
    }
    case "adopt": {
      if (s.sheep.length >= capacity(s)) throw new Error("牧场住满啦，先扩建牧场吧");
      if (s.coins < 110) throw new Error("领养一位新朋友需要 110 金币");
      s.coins -= 110;
      let id = randomBreed(s);
      let sex = randInt(2) === 0 ? "male" : "female";
      if (s.sheep.length === 0) {
        id = "cloud";
        sex = "female";
      }
      if (s.sheep.length === 1) {
        if (s.stats.births === 0) id = "milktea";
        sex = "male";
        if (s.sheep[0].sex === "male") sex = "female";
      }
      let name = breedByID(id)?.name ?? "小羊";
      if (s.progression.step === 1) name = "棉花糖";
      s.sheep.push(makeSheep(id, name, sex, at, true));
      addXP(s, 12);
      message = "欢迎新朋友：" + breedByID(id)?.name;
      if (discover(s, id)) message += " · 图鉴点亮啦！";
      break;
    }
    case "study": {
      // Learning mini-game integration: rewards stay inside the farm economy.
      // A round has up to 5 questions; rewards scale with first-try correctness.
      const correct = Math.max(0, Math.min(5, a.correct));
      if (correct <= 0) throw new Error("再试一次，你一定能答对！");
      const coins = [0, 3, 8, 15, 25, 40][correct];
      const xp = [0, 5, 12, 20, 35, 50][correct];
      s.coins += coins;
      addXP(s, xp);
      message = `答对 ${correct} 题！+${coins} 金币 · +${xp} 经验，小羊也为你开心 ♡`;
      break;
    }
    default: {
      const _never: never = a;
      throw new Error("不认识这个操作");
    }
  }
  advanceProgression(s, a);
  s.version++;
  s.updatedAt = at;
  return { message };
}

// ---- progression (port of server/progression.go) ----
function checkProgression(s: FarmState, a: GameAction) {
  const step = s.progression.step;
  let minimum = 0;
  switch (a.type) {
    case "adopt":
      minimum = 1;
      if (!s.buildings.shelter || (s.sheep.length > 0 && step < 12))
        throw new Error("先完成眼前的小目标，再迎接下一位朋友吧");
      break;
    case "pet":
    case "rename":
      minimum = 2;
      break;
    case "feed":
      minimum = 3;
      break;
    case "shear":
    case "sell":
      minimum = 4;
      break;
    case "buy":
      minimum = 3;
      if (a.itemId !== "feed") {
        const c = cropByID(a.itemId.slice(5));
        if (!c || c.seedId !== a.itemId || !cropUnlocked(s, c.id))
          throw new Error("这种种子会在之后的牧场旅程中解锁");
      }
      break;
    case "plant":
      minimum = 6;
      if (!cropUnlocked(s, a.cropId)) throw new Error("这种作物还没有解锁，先种眼前的小苗吧");
      break;
    case "water":
      minimum = 7;
      break;
    case "harvest":
      minimum = 8;
      break;
    case "order":
      minimum = 9;
      break;
    case "startGraze":
      minimum = 10;
      break;
    case "waterFlock":
    case "finishGraze":
      minimum = 11;
      break;
    case "breed":
    case "rehome":
    case "upgrade":
      minimum = 12;
      break;
    case "forage":
      minimum = 13;
      break;
    case "unlockRegion":
      minimum = 14;
      break;
    case "stargaze":
      minimum = 15;
      break;
    case "study":
      minimum = 0; // learning is always available
      return;
  }
  if (step < minimum) throw new Error("这个玩法还没有解锁，先完成当前的小目标吧");
}

function advanceProgression(s: FarmState, a: GameAction) {
  let completed = false;
  switch (s.progression.step) {
    case 0:
      completed = a.type === "build" && a.facility === "shelter";
      break;
    case 1:
      completed = a.type === "adopt";
      break;
    case 2:
      completed = a.type === "pet";
      break;
    case 3:
      completed = a.type === "feed";
      break;
    case 4:
      completed = a.type === "shear";
      break;
    case 5:
      completed = a.type === "build" && a.facility === "garden";
      break;
    case 6:
      completed = a.type === "plant";
      break;
    case 7:
      completed = a.type === "water";
      break;
    case 8:
      completed = a.type === "harvest";
      break;
    case 9:
      completed = a.type === "order";
      break;
    case 10:
      completed = a.type === "startGraze";
      break;
    case 11:
      completed = a.type === "finishGraze";
      break;
    case 12:
      completed = a.type === "breed";
      break;
    case 13:
      completed = s.progression.forestFinds >= 3;
      break;
    case 14:
      completed = a.type === "unlockRegion";
      break;
  }
  if (!completed) return;
  s.progression.step++;
  switch (s.progression.step) {
    case 9:
      s.inventory["seed_carrot"] = (s.inventory["seed_carrot"] || 0) + 3;
      s.orders = [
        {
          id: newID(),
          title: "邻居送来的第一份心愿",
          itemId: "clover",
          quantity: 3,
          reward: 70,
          xp: 25,
          completed: false,
        },
      ];
      break;
    case 10:
      s.regions.push("meadow");
      break;
    case 12:
      s.inventory["seed_daisy"] = (s.inventory["seed_daisy"] || 0) + 2;
      break;
    case 13:
      s.regions.push("forest");
      break;
  }
}

function near(position: Vec2 | null, target: Vec2, radius: number) {
  return position !== null && Math.hypot(position.x - target.x, position.z - target.z) <= radius;
}

function applyProgressionAction(
  s: FarmState,
  a: EngineAction,
  at: number,
): { message: string } {
  switch (a.type) {
    case "build": {
      if (a.facility === "shelter") {
        if (s.buildings.shelter || s.progression.step !== 0)
          throw new Error("小羊的家已经建好啦");
        s.buildings.shelter = true;
        addXP(s, 10);
        return { message: "小羊的家建好啦！去迎接第一位朋友吧" };
      }
      if (a.facility === "garden") {
        if (s.buildings.garden || s.progression.step !== 5)
          throw new Error("先完成当前的小目标，再开垦菜园吧");
        s.buildings.garden = true;
        s.plots = makeGarden();
        s.inventory["seed_clover"] = (s.inventory["seed_clover"] || 0) + 3;
        addXP(s, 10);
        return { message: "六块小田开垦好啦，三包三叶草种子已放入背包" };
      }
      throw new Error("没有这项建设");
    }
    case "startGraze": {
      if (!near(a.actorPosition, worldMap.home.returnPoint, worldMap.home.returnRadius ?? 4) || a.actorID === "")
        throw new Error("回到基地的集合点，再带羊群出发吧");
      if (s.sheep.length === 0) throw new Error("先迎接一位小羊朋友吧");
      if (s.grazing.active) {
        if (a.leaderOnline) throw new Error("羊群已经在放牧旅途中了");
        s.grazing.leaderId = a.actorID;
        return { message: "你接过了牧羊铃，继续这次放牧吧" };
      }
      s.grazing = {
        active: true,
        leaderId: a.actorID,
        regionId: "meadow",
        startedAt: at,
        grazeSeconds: 0,
        watered: false,
        completedCount: s.grazing.completedCount,
      };
      return { message: "羊群跟上来啦！带它们去铃兰花坡吃草吧" };
    }
    case "waterFlock":
    case "finishGraze": {
      if (!s.grazing.active || s.grazing.leaderId === null || s.grazing.leaderId !== a.actorID)
        throw new Error("由这次领队带羊群完成放牧吧");
      if (a.type === "waterFlock") {
        if (!near(a.actorPosition, worldMap.meadow.waterPoint!, worldMap.meadow.waterRadius ?? 2.7))
          throw new Error("带羊群靠近花坡泉水，再让它们喝水吧");
        if (s.grazing.watered) throw new Error("羊群已经喝过清凉的泉水啦");
        s.grazing.watered = true;
        return { message: "咕噜咕噜，羊群喝到了清凉的泉水" };
      }
      if (s.grazing.grazeSeconds < 20 || !s.grazing.watered)
        throw new Error("先在花坡吃草 20 秒，再带羊群到泉水喝水吧");
      if (!near(a.actorPosition, worldMap.home.returnPoint, worldMap.home.returnRadius ?? 4))
        throw new Error("把羊群带回基地集合点，才能完成这次放牧");
      let reward = 25;
      if (s.grazing.completedCount === 0) reward = 180;
      s.coins += reward;
      addXP(s, 50);
      for (const sh of s.sheep) {
        sh.hunger = clamp(sh.hunger + 30, 0, 100);
        sh.happiness = clamp(sh.happiness + 15, 0, 100);
      }
      s.grazing.active = false;
      s.grazing.leaderId = null;
      s.grazing.regionId = "home";
      s.grazing.completedCount++;
      if (reward === 180) return { message: "第一次放牧完成！+180 金币，迎接一位新朋友吧" };
      return { message: "羊群平安回家，吃饱喝足！+25 金币" };
    }
    case "forage": {
      if (!s.regions.includes("forest")) throw new Error("蘑菇秘林还没有开放");
      for (const node of s.forageNodes) {
        if (node.id !== a.nodeId) continue;
        if (!near(a.actorPosition, node.position, worldMap.forest.forageRadius ?? 2.4))
          throw new Error("走近这丛林间收获，再采集吧");
        if (at < node.readyAt) throw new Error("让森林休息一会儿，三分钟后会有新收获");
        node.readyAt = at + 180000;
        s.inventory[node.itemId] = (s.inventory[node.itemId] || 0) + 1;
        if (node.itemId === "mushroom")
          s.progression.forestFinds = Math.min(3, s.progression.forestFinds + 1);
        addXP(s, 8);
        if (node.itemId === "mushroom") return { message: "发现一朵林间蘑菇！+1 蘑菇" };
        return { message: "闻到了清新的香气！+1 香草" };
      }
      throw new Error("没有找到这丛林间收获");
    }
    case "unlockRegion": {
      if (a.regionId !== "highland" || s.regions.includes("highland"))
        throw new Error("没有可以修复的新栖息地");
      if (s.level < 3 || s.coins < 120 || (s.inventory["mushroom"] || 0) < 3 || (s.inventory["carrot"] || 0) < 3)
        throw new Error("修复高地需要牧场 3 级、120 金币、3 朵蘑菇和 3 根胡萝卜");
      s.coins -= 120;
      s.inventory["mushroom"] = (s.inventory["mushroom"] || 0) - 3;
      s.inventory["carrot"] = (s.inventory["carrot"] || 0) - 3;
      s.regions.push("highland");
      addXP(s, 50);
      return { message: "星落高地重新开放了！新的梦幻品种正在等你" };
    }
    case "stargaze": {
      if (!s.regions.includes("highland") || !near(a.actorPosition, worldMap.highland.viewPoint!, worldMap.highland.viewRadius ?? 6))
        throw new Error("走到星落高地的观星台，再抬头看看夜空吧");
      if (s.dayProgress >= 0.24 && s.dayProgress <= 0.78)
        throw new Error("星星还没亮起来，夜晚再来观星台吧");
      if (s.progression.lastStargazeDay === s.day)
        throw new Error("今晚的星光已经收进背包啦，明天再来吧");
      s.progression.lastStargazeDay = s.day;
      s.inventory["seed_moonflower"] = (s.inventory["seed_moonflower"] || 0) + 1;
      s.coins += 15;
      addXP(s, 15);
      return { message: "收下今晚的星光！+1 月光花种子 · +15 金币 · +15 经验" };
    }
    case "rehome": {
      if (s.sheep.length <= 1) throw new Error("牧场至少要留下一位小羊朋友哦");
      const index = s.sheep.findIndex((x) => x.id === a.sheepId);
      if (index === -1) throw new Error("没有找到这只小羊");
      const [gone] = s.sheep.splice(index, 1);
      return { message: gone.name + "搬去了邻居的牧场，图鉴会记住它" };
    }
    default:
      throw new Error("不认识这个操作");
  }
}

export function allowedPosition(s: FarmState, proposed: Vec2, previous: Vec2): Vec2 {
  const bounds = worldMap.bounds;
  const clamped = {
    x: clamp(proposed.x, bounds.minX, bounds.maxX),
    z: clamp(proposed.z, bounds.minZ, bounds.maxZ),
  };
  for (const region of [worldMap.meadow, worldMap.forest, worldMap.highland]) {
    if (region.bounds && isInside(region.bounds, clamped) && !s.regions.includes(region.id)) {
      return previous;
    }
  }
  return clamped;
}
function isInside(b: Bounds, p: Vec2) {
  return p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
}

export function cloneState(s: FarmState): FarmState {
  return JSON.parse(JSON.stringify(s)) as FarmState;
}