// 听一听：被动学习模式 —— 数字数数 / 字母朗读 / 唐诗整首跟读
// 与「闯关答题」分开，不结算金币经验，专注听与跟读，适合家长陪伴或孩子自己磨耳朵
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Volume2,
} from "lucide-react";
import {
  listenLetters,
  listenNumbers,
  listenPoems,
  primeVoices,
  speechSupported,
  speak,
  stopSpeaking,
} from "../game/study";
import type { StudySubject } from "../game/study";

interface ListenRoomProps {
  subject: StudySubject;
}

type ListenItem =
  | { kind: "numbers"; value: number; sheep: number }
  | { kind: "letters"; letter: string; word: string }
  | { kind: "poetry"; title: string; author: string; lines: string[] };

// 生成当前条目要朗读的文字；唐诗 line === -1 念标题和作者，否则念该句
const speechFor = (item: ListenItem, line: number): string => {
  if (item.kind === "letters")
    return `${item.letter}, ${item.letter}. ${item.word}.`;
  if (item.kind === "numbers") return `${item.value}`;
  if (line < 0) return `${item.title}，${item.author}。`;
  return item.lines[line] ?? "";
};

// 每条播完的停顿：诗句稍长，数字/字母稍短
const gapFor = (item: ListenItem) => (item.kind === "poetry" ? 3400 : 2100);

export default function ListenRoom({ subject }: ListenRoomProps) {
  const [ready, setReady] = useState(false);
  const [index, setIndex] = useState(0);
  const [line, setLine] = useState(0); // 唐诗行号，-1 标题；数字/字母恒为 0
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef<ListenItem[]>([]);

  // 科目内容库（固定一份，切换科目自动从头播）
  useEffect(() => {
    itemsRef.current =
      subject === "numbers"
        ? listenNumbers.map((n) => ({
            kind: "numbers" as const,
            value: n.value,
            sheep: n.sheep,
          }))
        : subject === "letters"
          ? listenLetters.map((l) => ({
              kind: "letters" as const,
              letter: l.letter,
              word: l.word,
            }))
          : listenPoems.map((p) => ({
              kind: "poetry" as const,
              title: p.title,
              author: p.author,
              lines: p.lines,
            }));
  }, [subject]);

  // 从 (第 i 条, 第 l 行) 开始朗读，并自动接续到结束
  const playAt = useCallback((i: number, l: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const items = itemsRef.current;
    if (!items.length) return;
    if (i >= items.length || i < 0) {
      // 全部播完：停在最后一首/最后一条
      setIndex(Math.max(0, items.length - 1));
      setLine(items[items.length - 1]?.kind === "poetry" ? 0 : 0);
      setPlaying(false);
      return;
    }
    const item = items[i];
    setIndex(i);
    setLine(l);
    stopSpeaking();
    speak(speechFor(item, l));

    // 计算下一步
    let nextI = i;
    let nextL = l < 0 ? 0 : l + 1;
    if (item.kind === "poetry") {
      if (nextL >= item.lines.length) {
        // 本首诗念完，读下一首的标题
        nextI = i + 1;
        nextL = -1;
      }
    } else {
      nextI = i + 1;
      nextL = 0;
    }
    timerRef.current = setTimeout(() => playAt(nextI, nextL), gapFor(item));
  }, []);

  // 进入 / 切换科目：自动从头播放；卸载 / 换科目时清理语音
  useEffect(() => {
    primeVoices();
    setReady(speechSupported());
    setIndex(0);
    setLine(-1);
    setPlaying(true);
    const t = setTimeout(() => playAt(0, -1), 350);
    return () => {
      clearTimeout(t);
      if (timerRef.current) clearTimeout(timerRef.current);
      stopSpeaking();
    };
  }, [subject, playAt]);

  const pause = () => {
    setPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    stopSpeaking();
  };
  const resume = () => {
    setPlaying(true);
    playAt(index, line);
  };
  const skip = () => {
    if (!playing) return;
    // 下一条 / 下一首诗；唐诗从新一首的标题开始，数字字母从下一条开始
    const item = itemsRef.current[index];
    if (!item) return;
    playAt(index + 1, -1);
  };
  const playCurrent = () => playAt(index, line);

  const items = itemsRef.current;
  const current = items[index];

  return (
    <div className="listen">
      <div className="listen-top">
        <div className="listen-mode">
          <Volume2 size={15} />
          听一听 · 被动跟读
        </div>
        <span className="listen-count">
          {Math.min(index + 1, items.length)}{" "}
          <small>/ {items.length}</small>
        </span>
      </div>

      {!ready && (
        <div className="listen-ready-note">
          这个浏览器暂时不支持朗读。可以先跟着看，稍后到「设置」里打开系统语音。
        </div>
      )}

      <div className="listen-stage">
        {current?.kind === "poetry" && (
          <div className="listen-poem">
            <div className="listen-poem-title">
              {current.title}
              <small>{current.author}</small>
            </div>
            {current.lines.map((text, i) => (
              <p
                key={i}
                className={line === i ? "is-current" : ""}
                onClick={() => playAt(index, i)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && playAt(index, i)}
              >
                {text}
                {i === line && (
                  <span className="listen-speaker">
                    <Volume2 size={13} />
                  </span>
                )}
              </p>
            ))}
          </div>
        )}
        {current?.kind === "letters" && (
          <div className="listen-letter">
            <div className="listen-letter-big">{current.letter}</div>
            <div className="listen-letter-word">{current.word}</div>
          </div>
        )}
        {current?.kind === "numbers" && (
          <div className="listen-number">
            <div className="listen-number-sheep">
              {"🐑".repeat(current.sheep)}
            </div>
            <div className="listen-number-big">{current.value}</div>
          </div>
        )}
      </div>

      <div className="listen-controls">
        <button
          className="listen-control"
          onClick={playCurrent}
          aria-label="重听本条"
          disabled={!ready}
        >
          <RotateCcw size={17} />
          <small>重听</small>
        </button>
        <button
          className="listen-control listen-primary"
          onClick={() => (playing ? pause() : resume())}
          aria-label={playing ? "暂停朗读" : "继续朗读"}
          disabled={!ready}
        >
          {playing ? <Pause size={20} /> : <Play size={20} />}
          <small>{playing ? "暂停" : "继续"}</small>
        </button>
        <button
          className="listen-control"
          onClick={skip}
          aria-label="下一条"
          disabled={!ready}
        >
          <SkipForward size={17} />
          <small>下一条</small>
        </button>
      </div>
    </div>
  );
}