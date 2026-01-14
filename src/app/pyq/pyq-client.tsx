"use client";

import { useState } from "react";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type PYQ = {
  id: string;
  year: number;
  subject: "math" | "physics" | "chemistry";
  chapter: string;
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  solution: string;
  whyOthersWrong?: string[];
  source?: "official" | "ai";
};

type AttemptRecord = {
  pyqId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timestamp: number;
};

// Sample PYQs - in production, fetch from /content/pyq/*.json
const SAMPLE_PYQS: PYQ[] = [
  {
    id: "pyq_vec_2024_1",
    year: 2024,
    subject: "math",
    chapter: "Vectors",
    difficulty: "medium",
    question: "If ā = 2î + 3ĵ + k̂ and b̄ = î − 2ĵ + 2k̂, then ā · b̄ equals:",
    options: ["-2", "2", "-6", "6"],
    correctIndex: 0,
    solution: "ā·b̄ = (2)(1) + (3)(-2) + (1)(2) = 2 - 6 + 2 = -2.",
    whyOthersWrong: [
      "2 happens if you ignore the middle term 3·(-2).",
      "-6 happens if you forget the +2 from k components.",
      "6 happens if you take absolute values/sign error."
    ],
  },
  {
    id: "pyq_vec_2023_1",
    year: 2023,
    subject: "math",
    chapter: "Vectors",
    difficulty: "easy",
    question: "The position vectors of points A and B are ā and b̄ respectively. The position vector of point P dividing AB in ratio 2:1 internally is:",
    options: ["(2b̄ + ā)/3", "(2ā + b̄)/3", "(ā + 2b̄)/3", "(ā + b̄)/2"],
    correctIndex: 0,
    solution: "Section formula: P = (m·b̄ + n·ā)/(m+n) where m:n = 2:1. So P = (2b̄ + 1·ā)/(2+1) = (2b̄ + ā)/3",
    whyOthersWrong: ["Swapped m and n", "Used external division", "Used midpoint formula"],
  },
  {
    id: "pyq_phy_2024_1",
    year: 2024,
    subject: "physics",
    chapter: "Units and Dimensions",
    difficulty: "easy",
    question: "The dimensional formula of Planck's constant is:",
    options: ["[ML²T⁻¹]", "[MLT⁻²]", "[ML²T⁻²]", "[M⁻¹L²T]"],
    correctIndex: 0,
    solution: "E = hν ⇒ h = E/ν. [h] = [ML²T⁻²]/[T⁻¹] = [ML²T⁻¹]",
    whyOthersWrong: ["Confused with momentum", "Confused with energy", "Inverted time dimension"],
  },
  {
    id: "pyq_chem_2024_1",
    year: 2024,
    subject: "chemistry",
    chapter: "Mole Concept",
    difficulty: "medium",
    question: "The number of moles of oxygen atoms in 36g of water is:",
    options: ["2", "1", "0.5", "4"],
    correctIndex: 0,
    solution: "Molar mass of H₂O = 18 g/mol. Moles of H₂O = 36/18 = 2 mol. Each H₂O has 1 oxygen atom. So moles of O atoms = 2.",
  },
  {
    id: "pyq_phy_2023_1",
    year: 2023,
    subject: "physics",
    chapter: "Kinematics",
    difficulty: "hard",
    question: "A particle is projected with velocity u at angle θ. The radius of curvature at the highest point is:",
    options: ["u²cos²θ/g", "u²/g", "u²sin²θ/g", "u²cosθ/g"],
    correctIndex: 0,
    solution: "At highest point, velocity = ucosθ (horizontal). Centripetal acceleration = g. Using a = v²/R, we get R = v²/a = (ucosθ)²/g = u²cos²θ/g",
  },
];

const YEARS = [2025, 2024, 2023, 2022, 2021, 2020, 2019];
type SubjectFilter = "all" | "math" | "physics" | "chemistry";
type DifficultyFilter = "all" | "easy" | "medium" | "hard";
type SourceFilter = "all" | "official" | "ai";

export function PYQClient() {
  const [yearFilter, setYearFilter] = useState<number | "all">("all");
  const [subjectFilter, setSubjectFilter] = useState<SubjectFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [aiPyqs, setAiPyqs] = useState<PYQ[]>(() => {
    if (typeof window === "undefined") return [];
    return getStoredJson<PYQ[]>("pyq:ai:v1") || [];
  });
  const [generating, setGenerating] = useState(false);
  const [genErr, setGenErr] = useState<string>("");
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showSolution, setShowSolution] = useState(false);
  const [attempts, setAttempts] = useState<AttemptRecord[]>(() => {
    if (typeof window === "undefined") return [];
    return getStoredJson<AttemptRecord[]>("pyq:attempts") || [];
  });

  const allPyqs: PYQ[] = [
    ...SAMPLE_PYQS.map((p) => ({ ...p, source: "official" as const })),
    ...aiPyqs.map((p) => ({ ...p, source: "ai" as const })),
  ];

  const filteredPYQs = allPyqs.filter((p) => {
    if (yearFilter !== "all" && p.year !== yearFilter) return false;
    if (subjectFilter !== "all" && p.subject !== subjectFilter) return false;
    if (difficultyFilter !== "all" && p.difficulty !== difficultyFilter) return false;
    if (sourceFilter !== "all" && (p.source || "official") !== sourceFilter) return false;
    return true;
  });

  const currentPYQ = filteredPYQs[currentIndex];

  async function generateAiPyqs() {
    setGenErr("");
    setGenerating(true);
    try {
      const res = await fetch("/api/pyq-generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: subjectFilter === "all" ? undefined : subjectFilter,
          topic:
            subjectFilter === "math"
              ? "JEE MAINS Mathematics"
              : subjectFilter === "physics"
                ? "JEE MAINS Physics"
                : subjectFilter === "chemistry"
                  ? "JEE MAINS Chemistry"
                  : "JEE MAINS",
          difficulty: difficultyFilter === "all" ? "mixed" : difficultyFilter,
          nQuestions: 5,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "PYQ generation failed");
      const items = (data.items as PYQ[]) || [];
      const normalized = items.map((x) => ({ ...x, source: "ai" as const }));
      const updated = [...normalized, ...aiPyqs].slice(0, 100);
      setAiPyqs(updated);
      setStoredJson("pyq:ai:v1", updated, { ttlMs: 1000 * 60 * 60 * 24 * 30 });
      setSourceFilter("ai");
      setCurrentIndex(0);
      setSelectedOption(null);
      setShowSolution(false);
    } catch (e) {
      setGenErr(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleOptionClick(index: number) {
    if (showSolution) return;
    setSelectedOption(index);
  }

  function handleSubmit() {
    if (selectedOption === null || !currentPYQ) return;
    setShowSolution(true);
    
    // Use callback to avoid calling Date.now() during render
    setAttempts((prevAttempts) => {
      const record: AttemptRecord = {
        pyqId: currentPYQ.id,
        selectedIndex: selectedOption,
        isCorrect: selectedOption === currentPYQ.correctIndex,
        timestamp: Date.now(),
      };
      const newAttempts = [...prevAttempts, record];
      setStoredJson("pyq:attempts", newAttempts);

      // Save mistake if wrong
      if (!record.isCorrect) {
        const mistakes = getStoredJson<AttemptRecord[]>("mistakes:v1") || [];
        mistakes.push(record);
        setStoredJson("mistakes:v1", mistakes);
      }
      return newAttempts;
    });
  }

  function handleNext() {
    if (currentIndex < filteredPYQs.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedOption(null);
      setShowSolution(false);
    }
  }

  function handlePrev() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedOption(null);
      setShowSolution(false);
    }
  }

  const stats = {
    total: attempts.length,
    correct: attempts.filter((a) => a.isCorrect).length,
    accuracy: attempts.length > 0 ? Math.round((attempts.filter((a) => a.isCorrect).length / attempts.length) * 100) : 0,
  };

  return (
    <div className="grid gap-4 animate-fade-in">
      {/* Header */}
      <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight gradient-text">PYQ Practice</h1>
            <p className="text-sm text-zinc-500">Previous Year Questions (2019-2024)</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <div className="rounded-lg bg-green-100 px-3 py-1.5 font-medium text-green-700">
              ✓ {stats.correct}/{stats.total}
            </div>
            <div className="rounded-lg bg-blue-100 px-3 py-1.5 font-medium text-blue-700">
              {stats.accuracy}% accuracy
            </div>
          </div>
        </div>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-ring"
          value={yearFilter}
          onChange={(e) => { setYearFilter(e.target.value === "all" ? "all" : Number(e.target.value)); setCurrentIndex(0); setShowSolution(false); setSelectedOption(null); }}
        >
          <option value="all">All Years</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-ring"
          value={subjectFilter}
          onChange={(e) => { setSubjectFilter(e.target.value as SubjectFilter); setCurrentIndex(0); setShowSolution(false); setSelectedOption(null); }}
        >
          <option value="all">All Subjects</option>
          <option value="math">Mathematics</option>
          <option value="physics">Physics</option>
          <option value="chemistry">Chemistry</option>
        </select>
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-ring"
          value={difficultyFilter}
          onChange={(e) => { setDifficultyFilter(e.target.value as DifficultyFilter); setCurrentIndex(0); setShowSolution(false); setSelectedOption(null); }}
        >
          <option value="all">All Difficulty</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
        <select
          className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus-ring"
          value={sourceFilter}
          onChange={(e) => { setSourceFilter(e.target.value as SourceFilter); setCurrentIndex(0); setShowSolution(false); setSelectedOption(null); }}
        >
          <option value="all">All Sources</option>
          <option value="official">Official (local)</option>
          <option value="ai">AI-generated (PYQ-style)</option>
        </select>

        <button
          onClick={generateAiPyqs}
          disabled={generating}
          className="h-9 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-4 text-sm font-medium text-white shadow-sm disabled:opacity-60 btn-interactive"
          title="Generates fresh PYQ-style questions (not official PYQs) and stores locally."
        >
          {generating ? "Generating..." : "Generate AI PYQ-style"}
        </button>
      </div>
      {genErr ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {genErr}
        </div>
      ) : null}

      {/* Question Card */}
      {currentPYQ ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm card-hover animate-slide-up">
          {/* Meta */}
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">{currentPYQ.year}</span>
            <span className="rounded-full bg-blue-100 px-2 py-1 font-medium capitalize text-blue-700">{currentPYQ.subject}</span>
            <span className="rounded-full bg-purple-100 px-2 py-1 font-medium text-purple-700">{currentPYQ.chapter}</span>
            <span className={`rounded-full px-2 py-1 font-medium ${
              currentPYQ.difficulty === "easy" ? "bg-green-100 text-green-700" :
              currentPYQ.difficulty === "medium" ? "bg-yellow-100 text-yellow-700" :
              "bg-red-100 text-red-700"
            }`}>{currentPYQ.difficulty}</span>
            <span className="ml-auto text-zinc-500">{currentIndex + 1} / {filteredPYQs.length}</span>
          </div>

          {/* Question */}
          <div className="mb-5 text-base font-semibold leading-relaxed text-zinc-900">
            {currentPYQ.question}
          </div>

          {/* Options */}
          <div className="grid gap-2">
            {currentPYQ.options.map((opt, idx) => {
              let optClass = "quiz-option rounded-xl border border-zinc-200 p-3 text-sm text-zinc-900";
              if (showSolution) {
                if (idx === currentPYQ.correctIndex) optClass += " correct";
                else if (idx === selectedOption) optClass += " incorrect";
              } else if (selectedOption === idx) {
                optClass += " selected";
              }
              return (
                <button
                  key={idx}
                  onClick={() => handleOptionClick(idx)}
                  className={optClass}
                  disabled={showSolution}
                >
                  <span className="mr-2 font-bold text-zinc-400">{String.fromCharCode(65 + idx)}.</span>
                  {opt}
                </button>
              );
            })}
          </div>

          {/* Solution */}
          {showSolution && (
            <div className="mt-5 animate-slide-up rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="mb-2 font-semibold text-green-800">Solution</div>
              <div className="text-sm text-green-900 leading-relaxed">{currentPYQ.solution}</div>
              {currentPYQ.whyOthersWrong && (
                <div className="mt-3 border-t border-green-200 pt-3">
                  <div className="mb-1 text-xs font-semibold text-green-700">Why other options are wrong:</div>
                  <ul className="text-xs text-green-800 space-y-1">
                    {currentPYQ.whyOthersWrong.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="mt-5 flex items-center justify-between gap-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium disabled:opacity-40 btn-interactive"
            >
              ← Prev
            </button>
            {!showSolution ? (
              <button
                onClick={handleSubmit}
                disabled={selectedOption === null}
                className="h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-6 text-sm font-medium text-white shadow-md disabled:opacity-40 btn-interactive"
              >
                Submit
              </button>
            ) : (
              <button
                onClick={handleNext}
                disabled={currentIndex >= filteredPYQs.length - 1}
                className="h-10 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 px-6 text-sm font-medium text-white shadow-md disabled:opacity-40 btn-interactive"
              >
                Next →
              </button>
            )}
            <button
              onClick={handleNext}
              disabled={currentIndex >= filteredPYQs.length - 1}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium disabled:opacity-40 btn-interactive"
            >
              Skip →
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center">
          <div className="text-zinc-500">No questions match your filters.</div>
        </div>
      )}
    </div>
  );
}
