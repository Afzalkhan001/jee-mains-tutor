"use client";

import { useMemo, useState } from "react";
import { sha256Hex } from "@/lib/crypto/sha256";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type Difficulty = "easy" | "medium" | "hard" | "mixed";

type QuizItem = {
  id: string;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  explanationBullets: [string, string, string];
  commonMistakes: [string, string];
  fastTip: string;
};

type QuizDoc = {
  schemaVersion: 1;
  quizTitle: string;
  items: QuizItem[];
};

type Attempt = {
  attemptId: string;
  createdAt: number;
  topic: string;
  difficulty: Difficulty;
  score: number;
  total: number;
  answers: Record<string, 0 | 1 | 2 | 3 | null>;
};

type QuizMistake = {
  question: string;
  yourAnswer: string;
  correctAnswer: string;
  timestamp: number;
  topic?: string;
};

// Icons
const SparkleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" />
  </svg>
);

const TrophyIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

export function QuizClient() {
  const [topic, setTopic] = useState("Vectors");
  const [nQuestions, setNQuestions] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("mixed");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [quiz, setQuiz] = useState<QuizDoc | null>(null);
  const [answers, setAnswers] = useState<Record<string, 0 | 1 | 2 | 3 | null>>({});
  const [submitted, setSubmitted] = useState(false);

  const attemptsKey = "quiz_attempts:v1";

  const score = useMemo(() => {
    if (!quiz) return { correct: 0, total: 0, percentage: 0 };
    let correct = 0;
    for (const q of quiz.items) {
      const a = answers[q.id];
      if (a === q.correctIndex) correct += 1;
    }
    return { correct, total: quiz.items.length, percentage: Math.round((correct / quiz.items.length) * 100) };
  }, [quiz, answers]);

  async function generateQuiz() {
    setErr("");
    setLoading(true);
    setSubmitted(false);
    setQuiz(null);
    setAnswers({});
    try {
      const cacheInput = JSON.stringify({ v: 1, topic: topic.trim(), nQuestions, difficulty });
      const cacheKey = `quiz_cache:${await sha256Hex(cacheInput)}`;
      const cached = getStoredJson<QuizDoc>(cacheKey);
      if (cached?.items?.length) {
        setQuiz(cached);
        return;
      }

      const res = await fetch("/api/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic: topic.trim(), nQuestions, difficulty }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Quiz failed");
      const q = data.quiz as QuizDoc;
      setQuiz(q);
      setStoredJson(cacheKey, q, { ttlMs: 1000 * 60 * 60 * 24 * 14 });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Quiz failed");
    } finally {
      setLoading(false);
    }
  }

  function pick(qid: string, idx: 0 | 1 | 2 | 3) {
    if (submitted) return;
    setAnswers((a) => ({ ...a, [qid]: idx }));
  }

  function submit() {
    if (!quiz) return;
    setSubmitted(true);

    const attempt: Attempt = {
      attemptId: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
      createdAt: Date.now(),
      topic: topic.trim(),
      difficulty,
      score: score.correct,
      total: score.total,
      answers: quiz.items.reduce((acc, q) => {
        acc[q.id] = answers[q.id] ?? null;
        return acc;
      }, {} as Attempt["answers"]),
    };

    const prev = getStoredJson<Attempt[]>(attemptsKey) || [];
    setStoredJson(attemptsKey, [attempt, ...prev].slice(0, 50));

    // Save mistakes
    const mistakes: QuizMistake[] = getStoredJson<QuizMistake[]>("quiz:mistakes") || [];
    for (const q of quiz.items) {
      const userAns = answers[q.id];
      if (userAns !== null && userAns !== q.correctIndex) {
        mistakes.push({
          question: q.question,
          yourAnswer: q.options[userAns],
          correctAnswer: q.options[q.correctIndex],
          timestamp: Date.now(),
          topic: q.topic,
        });
      }
    }
    setStoredJson("quiz:mistakes", mistakes.slice(-100));
  }

  return (
    <div className="grid gap-4 animate-fade-in">
      {/* Header */}
      <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 text-white">
              <SparkleIcon />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight gradient-text">AI Quiz Generator</h1>
              <p className="text-sm text-zinc-500">JEE-style MCQs with instant feedback</p>
            </div>
          </div>
        </div>
      </header>

      {/* Quiz Setup */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="grid gap-1.5 md:col-span-2">
            <div className="text-xs font-semibold text-zinc-700">Topic</div>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 placeholder:text-zinc-400 transition-all focus:border-blue-300 focus:bg-white focus:shadow-sm focus-ring"
              placeholder="Vectors / Kinematics / Mole Concept..."
            />
          </label>
          <label className="grid gap-1.5">
            <div className="text-xs font-semibold text-zinc-700">Questions</div>
            <input
              type="number"
              min={3}
              max={15}
              value={nQuestions}
              onChange={(e) => setNQuestions(Number(e.target.value))}
              className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 transition-all focus:border-blue-300 focus:bg-white focus:shadow-sm focus-ring"
            />
          </label>
          <label className="grid gap-1.5">
            <div className="text-xs font-semibold text-zinc-700">Difficulty</div>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="h-11 rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm text-zinc-900 transition-all focus:border-blue-300 focus:bg-white focus:shadow-sm focus-ring"
            >
              <option value="mixed">Mixed</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={generateQuiz}
            disabled={loading || !topic.trim()}
            className="h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg disabled:opacity-50 btn-interactive"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="animate-pulse-soft">Generating...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <SparkleIcon /> Generate Quiz
              </span>
            )}
          </button>
          {quiz && !submitted && (
            <button
              onClick={submit}
              className="h-11 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-6 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg btn-interactive"
            >
              Submit & See Results
            </button>
          )}
        </div>

        {err && (
          <div className="mt-4 animate-bounce-in rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {err}
          </div>
        )}
      </section>

      {/* Score Card (after submit) */}
      {quiz && submitted && (
        <section className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-6 shadow-lg animate-bounce-in">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-amber-500">
                <TrophyIcon />
              </div>
              <div>
                <div className="text-sm font-medium text-amber-700">Quiz Complete!</div>
                <div className="text-3xl font-bold text-amber-900 score-animate">
                  {score.correct}/{score.total}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-black ${
                score.percentage >= 80 ? "text-green-600" :
                score.percentage >= 50 ? "text-amber-600" :
                "text-red-600"
              } score-animate`}>
                {score.percentage}%
              </div>
              <div className="text-sm text-zinc-600">
                {score.percentage >= 80 ? "Excellent! 🎯" :
                 score.percentage >= 50 ? "Good effort! 💪" :
                 "Keep practicing! 📚"}
              </div>
            </div>
          </div>
          {score.correct < score.total && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-white/50 p-3 text-sm text-amber-800">
              💡 Wrong answers have been saved to your Mistake Notebook for review
            </div>
          )}
        </section>
      )}

      {/* Questions */}
      {quiz && (
        <section className="grid gap-4 stagger-children">
          {quiz.items.map((q, qi) => {
            const chosen = answers[q.id] ?? null;
            const isWrong = submitted && chosen !== null && chosen !== q.correctIndex;
            const isCorrectAnswer = submitted && chosen === q.correctIndex;

            return (
              <div 
                key={q.id} 
                className={`rounded-2xl border p-5 shadow-sm transition-all animate-slide-up ${
                  isCorrectAnswer ? "border-green-300 bg-green-50/50" :
                  isWrong ? "border-red-300 bg-red-50/50" :
                  "border-zinc-200 bg-white"
                }`}
              >
                {/* Question Header */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
                    {qi + 1}
                  </span>
                  <span className="text-xs font-medium text-zinc-500">{q.topic}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    q.difficulty === "easy" ? "bg-green-100 text-green-700" :
                    q.difficulty === "medium" ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>{q.difficulty}</span>
                  {submitted && (
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${
                      isCorrectAnswer ? "bg-green-500 text-white" : isWrong ? "bg-red-500 text-white" : "bg-zinc-200"
                    }`}>
                      {isCorrectAnswer ? "✓ Correct" : isWrong ? "✗ Wrong" : "Skipped"}
                    </span>
                  )}
                </div>

                {/* Question Text */}
                <div className="text-base font-semibold leading-relaxed mb-4 text-zinc-900">
                  {q.question}
                </div>

                {/* Options */}
                <div className="grid gap-2">
                  {q.options.map((op, oi) => {
                    const idx = oi as 0 | 1 | 2 | 3;
                    const isChosen = chosen === idx;
                    const isCorrect = q.correctIndex === idx;

                    return (
                      <button
                        key={op}
                        onClick={() => pick(q.id, idx)}
                        disabled={submitted}
                        className={`quiz-option rounded-xl border p-3 text-left text-sm transition-all ${
                          submitted
                            ? isCorrect
                              ? "correct"
                              : isChosen
                                ? "incorrect"
                                : ""
                            : isChosen
                              ? "selected"
                              : ""
                        }`}
                      >
                        <span className="mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-700">
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <span className="text-zinc-900">{op}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Explanation (after submit) */}
                {submitted && (
                  <div className="mt-4 grid gap-3 animate-fade-in">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-700 mb-2">
                        <SparkleIcon /> Explanation
                      </div>
                      <ul className="text-sm text-blue-900 space-y-1">
                        {q.explanationBullets.map((b, bi) => (
                          <li key={bi}>• {b}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-green-200 bg-green-50 p-3">
                        <div className="text-xs font-bold text-green-700 mb-1">⚡ Fast Tip</div>
                        <div className="text-sm text-green-900">{q.fastTip}</div>
                      </div>
                      <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                        <div className="text-xs font-bold text-orange-700 mb-1">⚠️ Common Mistakes</div>
                        <ul className="text-sm text-orange-900 space-y-0.5">
                          {q.commonMistakes.map((b, bi) => (
                            <li key={bi}>• {b}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* New Quiz Button */}
      {quiz && submitted && (
        <div className="text-center">
          <button
            onClick={generateQuiz}
            className="h-11 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 px-8 text-sm font-semibold text-white shadow-md transition-all hover:shadow-lg btn-interactive"
          >
            Generate New Quiz
          </button>
        </div>
      )}
    </div>
  );
}

