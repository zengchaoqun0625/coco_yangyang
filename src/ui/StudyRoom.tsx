import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Coins, Headphones, RefreshCw, Sparkles, Volume2, X } from "lucide-react";
import type { FarmState, GameAction } from "../game/types";
import {
  buildSession,
  celebrate,
  primeVoices,
  speak,
  stopSpeaking,
  subjectInfo,
  type StudyQuestion,
  type StudySubject,
} from "../game/study";
import ListenRoom from "./ListenRoom";
import "./study.css";

interface StudyRoomProps {
  state: FarmState;
  serverNow: number;
  onStudy: (correct: number) => Promise<void>;
}

const SESSION_SIZE = 5;

export default function StudyRoom({ state, serverNow, onStudy }: StudyRoomProps) {
  const [subject, setSubject] = useState<StudySubject>("numbers");
  const [mode, setMode] = useState<"quiz" | "listen">("listen");
  const [seed, setSeed] = useState(() => Math.random());
  const questions = useMemo(() => buildSession(subject, seed), [subject, seed]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState("");
  const question = questions[index];

  useEffect(() => {
    primeVoices();
  }, []);

  useEffect(() => {
    // restart when switching subject
    setIndex(0);
    setPicked(null);
    setCorrectCount(0);
    setFinished(false);
    setHint("");
    stopSpeaking();
  }, [subject, seed]);

  useEffect(() => {
    // 切到答题模式时停掉听一听的语音，避免两只喇叭同时响
    if (mode === "quiz") stopSpeaking();
  }, [mode]);

  const speakQuestion = useCallback(() => {
    if (!question) return;
    const text =
      question.speak ??
      question.prompt.replace(/[「」：，。——]/g, " ");
    speak(text);
  }, [question]);

  useEffect(() => {
    if (question) {
      const t = setTimeout(() => speakQuestion(), 350);
      return () => clearTimeout(t);
    }
  }, [question, speakQuestion]);

  const pick = async (optionIndex: number) => {
    if (picked !== null || busy || finished) return;
    setPicked(optionIndex);
    const correct = optionIndex === question.answer;
    // always read the correct answer aloud for reinforcement
    setTimeout(() => speak(question.options[question.answer]), 350);
    if (correct) {
      celebrate();
      const next = correctCount + 1;
      setCorrectCount(next);
      if (index + 1 >= questions.length) {
        setFinished(true);
        setBusy(true);
        try {
          await onStudy(next);
        } finally {
          setBusy(false);
        }
      }
    } else {
      setHint("再想一想，小羊相信你！");
    }
  };

  const nextQuestion = () => {
    setPicked(null);
    setHint("");
    setIndex((i) => i + 1);
  };

  const restart = () => {
    setSeed(Math.random());
  };

  const info = subjectInfo[subject];
  return (
    <div className="study">
      <div className="study-modes" role="tablist" aria-label="学习方式">
        <button
          role="tab"
          aria-selected={mode === "listen"}
          className={`study-mode ${mode === "listen" ? "is-active" : ""}`}
          onClick={() => setMode("listen")}
        >
          <Headphones size={16} />
          听一听
          <small>磨耳朵 · 跟读</small>
        </button>
        <button
          role="tab"
          aria-selected={mode === "quiz"}
          className={`study-mode ${mode === "quiz" ? "is-active" : ""}`}
          onClick={() => setMode("quiz")}
        >
          <Sparkles size={16} />
          闯关答题
          <small>答对有金币</small>
        </button>
      </div>

      <div className="study-subjects" role="tablist" aria-label="学习内容">
        {(Object.keys(subjectInfo) as StudySubject[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={subject === s}
            className={`study-subject ${subject === s ? "is-active" : ""}`}
            style={{ "--accent": subjectInfo[s].color } as React.CSSProperties}
            onClick={() => setSubject(s)}
          >
            <span>{subjectInfo[s].emoji}</span>
            <strong>{subjectInfo[s].name}</strong>
            <small>{subjectInfo[s].hint}</small>
          </button>
        ))}
      </div>

      {mode === "listen" ? (
        <ListenRoom subject={subject} key={subject} />
      ) : (
        <>
      <div className="study-stage" style={{ "--accent": info.color } as React.CSSProperties}>
        {finished ? (
          <div className="study-done">
            <span className="study-done-emoji">🎉</span>
            <h3>
              答对 {correctCount} / {questions.length} 题！
            </h3>
            <p>小羊为你鼓掌，学习真让人开心。</p>
            <button className="study-button" onClick={restart}>
              <RefreshCw size={17} /> 再来一轮
            </button>
          </div>
        ) : question ? (
          <>
            <div className="study-flourish">
              <span>
                第 {index + 1} / {questions.length} 题
              </span>
              <span className="study-score">
                <Coins size={14} /> 答对有金币，答错不扣
              </span>
            </div>
            <div className="study-prompt">
              <span className="study-speaker" role="button" tabIndex={0} onClick={speakQuestion} onKeyDown={(e) => e.key === "Enter" && speakQuestion()} aria-label="朗读题目">
                <Volume2 size={19} />
              </span>
              <h3>{question.prompt}</h3>
            </div>
            <div className="study-options">
              {question.options.map((option, i) => {
                let className = "study-option";
                if (picked !== null) {
                  if (i === question.answer) className += " is-correct";
                  else if (i === picked) className += " is-wrong";
                  else className += " is-dim";
                }
                return (
                  <button
                    key={`${option}-${i}`}
                    className={className}
                    disabled={picked !== null || busy}
                    onClick={() => pick(i)}
                  >
                    <span>{option}</span>
                    {picked !== null && i === question.answer && (
                      <Check size={18} />
                    )}
                    {picked === i && i !== question.answer && <X size={18} />}
                  </button>
                );
              })}
            </div>
            {hint && <p className="study-hint">{hint}</p>}
            {picked !== null && !finished && (
              <div className="study-next">
                <button className="study-button" onClick={nextQuestion}>
                  {index + 1 >= questions.length ? "看成绩" : "下一题"}
                  <span aria-hidden>→</span>
                </button>
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="study-footer">
        <Sparkles size={14} />
        <span>
          每答对一题，小羊都会为你开心；一轮全对还有大惊喜！
        </span>
        <BookOpen size={14} />
      </div>
      </>
      )}
    </div>
  );
}