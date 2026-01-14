"use client";

import { useState, useEffect } from "react";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type MistakeRecord = {
  pyqId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timestamp: number;
  aiAnalysis?: string;
};

type QuizMistake = {
  question: string;
  yourAnswer: string;
  correctAnswer: string;
  timestamp: number;
  topic?: string;
  aiExplanation?: string;
};

function simplifyLatexToPlain(text: string) {
  let s = String(text);
  s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, "");
  s = s.replace(/\\hat\{([^}]+)\}/g, "$1_hat");
  s = s.replace(/\\sqrt\{([^}]+)\}/g, "sqrt($1)");
  s = s.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1)/($2)");
  s = s.replace(/\\/g, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/\s{2,}/g, " ").trim();
  return s;
}

// Icons
const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const SparkleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0L14.59 8.41L23 11L14.59 13.59L12 22L9.41 13.59L1 11L9.41 8.41L12 0Z" />
  </svg>
);

const BrainIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-1.54" />
    <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-1.54" />
  </svg>
);

export function MistakesClient() {
  const [pyqMistakes, setPyqMistakes] = useState<MistakeRecord[]>([]);
  const [quizMistakes, setQuizMistakes] = useState<QuizMistake[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pyq" | "quiz">("quiz");

  useEffect(() => {
    const savedPyq = getStoredJson<MistakeRecord[]>("mistakes:v1") || [];
    const savedQuiz = getStoredJson<QuizMistake[]>("quiz:mistakes") || [];
    setPyqMistakes(savedPyq);
    setQuizMistakes(savedQuiz);
  }, []);

  function clearAllMistakes() {
    if (!confirm("Clear all mistakes? This cannot be undone.")) return;
    setPyqMistakes([]);
    setQuizMistakes([]);
    setStoredJson("mistakes:v1", []);
    setStoredJson("quiz:mistakes", []);
  }

  async function analyzeQuizMistake(index: number) {
    const mistake = quizMistakes[index];
    if (mistake.aiExplanation) return;
    
    setAnalyzing(`quiz_${index}`);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "Revision",
          question: `I answered "${mistake.yourAnswer}" but correct answer was "${mistake.correctAnswer}" for this question: "${mistake.question}". Explain why my answer was wrong and the correct thinking pattern. Keep it brief, bullet points only.`,
        }),
      });
      const data = await res.json();
      if (data.output) {
        const updated = [...quizMistakes];
        updated[index] = { ...mistake, aiExplanation: data.output };
        setQuizMistakes(updated);
        setStoredJson("quiz:mistakes", updated);
      }
    } catch {
      // Silent fail
    } finally {
      setAnalyzing(null);
    }
  }

  function removeMistake(type: "pyq" | "quiz", index: number) {
    if (type === "pyq") {
      const updated = pyqMistakes.filter((_, i) => i !== index);
      setPyqMistakes(updated);
      setStoredJson("mistakes:v1", updated);
    } else {
      const updated = quizMistakes.filter((_, i) => i !== index);
      setQuizMistakes(updated);
      setStoredJson("quiz:mistakes", updated);
    }
  }

  const totalMistakes = pyqMistakes.length + quizMistakes.length;

  return (
    <div className="grid gap-4 animate-fade-in">
      {/* Header */}
      <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-orange-500 text-white">
              <BrainIcon />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight gradient-text">Mistake Notebook</h1>
              <p className="text-sm text-zinc-500">Learn from your errors</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-red-100 px-3 py-1.5 text-sm font-medium text-red-700">
              {totalMistakes} mistakes
            </div>
            {totalMistakes > 0 && (
              <button
                onClick={clearAllMistakes}
                className="h-9 rounded-lg border border-red-200 bg-white px-3 text-sm font-medium text-red-600 hover:bg-red-50 btn-interactive"
              >
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-zinc-100 p-1">
        <button
          onClick={() => setActiveTab("quiz")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "quiz" ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          Quiz Mistakes ({quizMistakes.length})
        </button>
        <button
          onClick={() => setActiveTab("pyq")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "pyq" ? "bg-white shadow-sm" : "text-zinc-600 hover:text-zinc-900"
          }`}
        >
          PYQ Mistakes ({pyqMistakes.length})
        </button>
      </div>

      {/* Content */}
      <div className="grid gap-3 stagger-children">
        {activeTab === "quiz" && quizMistakes.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <div className="text-4xl mb-3">🎯</div>
            <div className="font-medium text-zinc-700">No quiz mistakes yet!</div>
            <div className="text-sm text-zinc-500 mt-1">Take some quizzes to track your errors</div>
          </div>
        )}

        {activeTab === "pyq" && pyqMistakes.length === 0 && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
            <div className="text-4xl mb-3">✨</div>
            <div className="font-medium text-zinc-700">No PYQ mistakes yet!</div>
            <div className="text-sm text-zinc-500 mt-1">Practice some PYQs to track your errors</div>
          </div>
        )}

        {activeTab === "quiz" && quizMistakes.map((m, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm card-hover animate-slide-up">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="mb-2 text-xs text-zinc-500">
                  {new Date(m.timestamp).toLocaleDateString()} {m.topic && `• ${m.topic}`}
                </div>
                <div className="font-medium text-zinc-900 mb-3">{m.question}</div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      ✗ Your answer
                    </span>
                    <span className="text-zinc-700">{m.yourAnswer}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      ✓ Correct
                    </span>
                    <span className="text-zinc-700">{m.correctAnswer}</span>
                  </div>
                </div>

                {m.aiExplanation && (
                  <div className="mt-4 rounded-xl border border-purple-200 bg-purple-50 p-3">
                    <div className="mb-1 flex items-center gap-1 text-xs font-semibold text-purple-700">
                      <SparkleIcon /> AI Analysis
                    </div>
                    <div className="text-sm text-purple-900 whitespace-pre-wrap">
                      {simplifyLatexToPlain(m.aiExplanation)}
                    </div>
                  </div>
                )}

                {!m.aiExplanation && (
                  <button
                    onClick={() => analyzeQuizMistake(i)}
                    disabled={analyzing === `quiz_${i}`}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-purple-100 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-200 disabled:opacity-50 btn-interactive"
                  >
                    <SparkleIcon />
                    {analyzing === `quiz_${i}` ? "Analyzing..." : "AI Explain Why"}
                  </button>
                )}
              </div>
              <button
                onClick={() => removeMistake("quiz", i)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                title="Remove"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}

        {activeTab === "pyq" && pyqMistakes.map((m, i) => (
          <div key={i} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm card-hover animate-slide-up">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="mb-2 text-xs text-zinc-500">
                  {new Date(m.timestamp).toLocaleDateString()} • PYQ ID: {m.pyqId}
                </div>
                <div className="text-sm">
                  <span className="text-red-600 font-medium">Selected option {m.selectedIndex + 1}</span>
                  {" — "}
                  <span className="text-zinc-600">Wrong answer recorded</span>
                </div>
                {m.aiAnalysis && (
                  <div className="mt-3 rounded-xl border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
                    {m.aiAnalysis}
                  </div>
                )}
              </div>
              <button
                onClick={() => removeMistake("pyq", i)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                title="Remove"
              >
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Tips Section */}
      {totalMistakes > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-800 mb-2">
            💡 Improvement Tips
          </div>
          <ul className="text-sm text-amber-900 space-y-1">
            <li>• Review each mistake before your next study session</li>
            <li>• Click &quot;AI Explain Why&quot; to understand the correct thinking pattern</li>
            <li>• Focus on topics where you make repeated mistakes</li>
            <li>• Re-attempt questions after 2-3 days for better retention</li>
          </ul>
        </div>
      )}
    </div>
  );
}
