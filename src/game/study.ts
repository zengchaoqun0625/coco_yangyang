// 融合学习内容库：数字、字母、唐诗（适合 2-7 岁孩子，和牧场玩法结合）
import { playSound } from "./audio";

export type StudySubject = "numbers" | "letters" | "poetry";

export interface StudyQuestion {
  id: string;
  prompt: string;
  options: string[];
  answer: number; // index into options
  speak?: string; // text to read aloud
}

// ---- 数字 1-10 ----
const NUMBER_WORDS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const numberQuestions = (): StudyQuestion[] => {
  const out: StudyQuestion[] = [];
  for (let i = 0; i < 10; i++) {
    const n = i + 1;
    const answer = `${n}`;
    // pick two distractors
    const distractors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      .filter((x) => x !== n)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((x) => `${x}`);
    const options = [answer, ...distractors].sort(() => Math.random() - 0.5);
    out.push({
      id: `num-${n}`,
      prompt: `${NUMBER_WORDS[i]} —— 是哪个数字？`,
      options,
      answer: options.indexOf(answer),
      speak: NUMBER_WORDS[i],
    });
  }
  // counting with sheep emoji blocks
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    const sheep = "🐑".repeat(n);
    const wrong = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((x) => x !== n)
      .sort(() => Math.random() - 0.5)
      .slice(0, 2)
      .map((x) => `${x}`);
    const correct = `${n}`;
    const options = [correct, ...wrong].sort(() => Math.random() - 0.5);
    out.push({
      id: `count-${n}`,
      prompt: `数一数：${sheep}`,
      options,
      answer: options.indexOf(correct),
      speak: `${n}`,
    });
  }
  return out;
};

// ---- 字母 A-Z ----
const LETTER_LOWER: Record<string, string> = {
  A: "a", B: "b", C: "c", D: "d", E: "e", F: "f", G: "g", H: "h", I: "i",
  J: "j", K: "k", L: "l", M: "m", N: "n", O: "o", P: "p", Q: "q", R: "r",
  S: "s", T: "t", U: "u", V: "v", W: "w", X: "x", Y: "y", Z: "z",
};
const letterQuestions = (): StudyQuestion[] => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const out: StudyQuestion[] = [];
  for (const L of letters) {
    const wrong = letters
      .filter((x) => x !== L)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3);
    const options = [L, L.toLowerCase(), ...wrong].sort(() => Math.random() - 0.5);
    const target = L;
    out.push({
      id: `letter-${L}`,
      prompt: `这个字母读作「${L}」，找到它：`,
      options,
      answer: options.indexOf(target),
      speak: L,
    });
  }
  return out;
};

// ---- 唐诗（带拼音和注音朗读）----
export interface Poem {
  title: string;
  author: string;
  lines: string[]; // 4 or 8 lines, each with (内容, 生字拼音按需)
  missing: { line: number; blank: string; correct: string; options: string[] }[];
}
// 精选 10 首入门唐诗，每题抽一句挖空
export const poems: Poem[] = [
  {
    title: "静夜思",
    author: "李白",
    lines: [
      "床前明月光", "疑是地上霜", "举头望明月", "低头思故乡",
    ],
    missing: [
      { line: 0, blank: "床□□月光", correct: "前明", options: ["前明", "后暗", "边亮", "外黑"] },
      { line: 2, blank: "□□望明月", correct: "举头", options: ["举头", "低头", "抬头", "转头"] },
      { line: 3, blank: "低头□□乡", correct: "思故", options: ["思故", "念家", "想故", "望山"] },
    ],
  },
  {
    title: "春晓",
    author: "孟浩然",
    lines: ["春眠不觉晓", "处处闻啼鸟", "夜来风雨声", "花落知多少"],
    missing: [
      { line: 0, blank: "春眠□□晓", correct: "不觉", options: ["不觉", "已知", "初醒", "方知"] },
      { line: 1, blank: "处处□□鸟", correct: "闻啼", options: ["闻啼", "听歌", "见飞", "看群"] },
      { line: 3, blank: "花落□□少", correct: "知多", options: ["知多", "无多", "几多", "恨多"] },
    ],
  },
  {
    title: "咏鹅",
    author: "骆宾王",
    lines: ["鹅鹅鹅", "曲项向天歌", "白毛浮绿水", "红掌拨清波"],
    missing: [
      { line: 1, blank: "曲项□□歌", correct: "向天", options: ["向天", "对水", "朝山", "临风"] },
      { line: 2, blank: "白毛□□水", correct: "浮绿", options: ["浮绿", "游清", "荡平", "漂蓝"] },
      { line: 3, blank: "红掌□□波", correct: "拨清", options: ["拨清", "划碧", "踏青", "翻白"] },
    ],
  },
  {
    title: "登鹳雀楼",
    author: "王之涣",
    lines: ["白日依山尽", "黄河入海流", "欲穷千里目", "更上一层楼"],
    missing: [
      { line: 0, blank: "白日□□尽", correct: "依山", options: ["依山", "沿河", "傍云", "照水"] },
      { line: 2, blank: "欲穷千□目", correct: "里", options: ["里", "万", "百", "丈"] },
      { line: 3, blank: "更上□□楼", correct: "一层", options: ["一层", "两层", "半层", "高"] },
    ],
  },
  {
    title: "悯农",
    author: "李绅",
    lines: ["锄禾日当午", "汗滴禾下土", "谁知盘中餐", "粒粒皆辛苦"],
    missing: [
      { line: 0, blank: "锄禾□当午", correct: "日", options: ["日", "月", "夜", "风"] },
      { line: 1, blank: "汗滴□□土", correct: "禾下", options: ["禾下", "田里", "地中", "土边"] },
      { line: 3, blank: "粒粒□□苦", correct: "皆辛", options: ["皆辛", "多艰", "最难", "真累"] },
    ],
  },
  {
    title: "江南",
    author: "汉乐府",
    lines: ["江南可采莲", "莲叶何田田", "鱼戏莲叶间", "鱼戏莲叶东"],
    missing: [
      { line: 0, blank: "江南□采莲", correct: "可", options: ["可", "能", "爱", "要"] },
      { line: 1, blank: "莲叶何□□", correct: "田田", options: ["田田", "青青", "圆圆", "绿绿"] },
      { line: 2, blank: "鱼戏□□间", correct: "莲叶", options: ["莲叶", "荷叶", "水草", "花间"] },
    ],
  },
  {
    title: "风",
    author: "李峤",
    lines: ["解落三秋叶", "能开二月花", "过江千尺浪", "入竹万竿斜"],
    missing: [
      { line: 0, blank: "解落□□叶", correct: "三秋", options: ["三秋", "一春", "夏日", "冬天"] },
      { line: 1, blank: "能开□□花", correct: "二月", options: ["二月", "三月", "四月", "五月"] },
      { line: 2, blank: "过江□□浪", correct: "千尺", options: ["千尺", "百尺", "万丈", "千层"] },
    ],
  },
  {
    title: "山村咏怀",
    author: "邵雍",
    lines: ["一去二三里", "烟村四五家", "亭台六七座", "八九十枝花"],
    missing: [
      { line: 0, blank: "一去□□里", correct: "二三", options: ["二三", "三四", "四五", "六七"] },
      { line: 1, blank: "烟村□□家", correct: "四五", options: ["四五", "二三", "六七", "八九十"] },
      { line: 3, blank: "八□□枝花", correct: "九十", options: ["九十", "七八", "五六", "四五"] },
    ],
  },
  {
    title: "寻隐者不遇",
    author: "贾岛",
    lines: ["松下问童子", "言师采药去", "只在此山中", "云深不知处"],
    missing: [
      { line: 0, blank: "松下问□□", correct: "童子", options: ["童子", "牧童", "小孩", "书童"] },
      { line: 2, blank: "只在此□中", correct: "山", options: ["山", "林", "云", "谷"] },
      { line: 3, blank: "云深不知□", correct: "处", options: ["处", "路", "去", "远"] },
    ],
  },
  {
    title: "画",
    author: "王维",
    lines: ["远看山有色", "近听水无声", "春去花还在", "人来鸟不惊"],
    missing: [
      { line: 0, blank: "远看山□□", correct: "有色", options: ["有色", "无色", "多色", "高色"] },
      { line: 1, blank: "近听水无□", correct: "声", options: ["声", "色", "味", "名"] },
      { line: 2, blank: "春去花□在", correct: "还", options: ["还", "不", "仍", "犹"] },
    ],
  },
];

function poetryQuestions(): StudyQuestion[] {
  const out: StudyQuestion[] = [];
  for (const poem of poems) {
    for (const m of poem.missing) {
      const options = [...m.options].sort(() => Math.random() - 0.5);
      const line = poem.lines[m.line];
      const full = line.slice(0, line.indexOf("□") === -1 ? 0 : 0) || line;
      out.push({
        id: `poem-${poem.title}-${m.line}`,
        prompt: `${poem.title}（${poem.author}）：「${m.blank}」 应填：`,
        options,
        answer: options.indexOf(m.correct),
        speak: m.correct,
      });
    }
  }
  return out;
}

export const questionBank: Record<StudySubject, () => StudyQuestion[]> = {
  numbers: numberQuestions,
  letters: letterQuestions,
  poetry: poetryQuestions,
};

export const subjectInfo: Record<
  StudySubject,
  { name: string; emoji: string; color: string; hint: string }
> = {
  numbers: { name: "认数字", emoji: "🔢", color: "#e8a14f", hint: "数一数羊圈里的小羊，认识 1-10" },
  letters: { name: "学字母", emoji: "🔤", color: "#6a9fd8", hint: "认识 26 个英文字母宝宝" },
  poetry: { name: "读唐诗", emoji: "📜", color: "#b88ad0", hint: "跟着小羊念唐诗，补全诗句" },
};

// ---- speech (Web Speech API, graceful fallback) ----
let voicesReady = false;
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === "zh-CN" && /Xiaoxiao|Huihui|Yunxi|Tingting|Meijia/i.test(v.name)) ??
    voices.find((v) => v.lang === "zh-CN") ??
    voices.find((v) => v.lang.startsWith("zh")) ??
    null
  );
}
export function speak(text: string, lang = "zh-CN") {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  u.rate = 0.85;
  u.pitch = 1.1;
  speechSynthesis.speak(u);
}
export function primeVoices() {
  if (typeof speechSynthesis === "undefined") return;
  speechSynthesis.getVoices();
  voicesReady = true;
}
if (typeof speechSynthesis !== "undefined" && typeof window !== "undefined") {
  window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    voicesReady = true;
  });
}

// ---- study session state ----
export function buildSession(subject: StudySubject, seed = Math.random()): StudyQuestion[] {
  const bank = questionBank[subject]();
  const shuffled = [...bank].sort((a, b) => (seed * 1000) % 2 - 0.5);
  return shuffled.slice(0, 5);
}
export function celebrate() {
  playSound("harvest");
}