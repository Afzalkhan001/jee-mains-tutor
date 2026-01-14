"use client";

import { useState } from "react";
import { getStoredJson, setStoredJson } from "@/lib/storage/local";

type StudyPlan = {
  examDate: string;
  dailyHours: number;
  createdAt: number;
  schedule: DayPlan[];
};

type DayPlan = {
  date: string;
  dayNumber: number;
  isRevision: boolean;
  isTest: boolean;
  chapters: ChapterTask[];
};

type ChapterTask = {
  subject: "math" | "physics" | "chemistry";
  chapter: string;
  status: "pending" | "done" | "skipped";
};

// Sample chapters for planning
const ALL_CHAPTERS = {
  math: [
    "Sets & Relations", "Functions", "Complex Numbers", "Quadratic Equations",
    "Permutations & Combinations", "Binomial Theorem", "Sequences & Series",
    "Limits & Continuity", "Differentiation", "Integration", "Differential Equations",
    "Coordinate Geometry", "Straight Lines", "Circles", "Parabola", "Ellipse", "Hyperbola",
    "Vectors", "3D Geometry", "Probability", "Statistics", "Matrices & Determinants",
  ],
  physics: [
    "Units & Dimensions", "Kinematics", "Laws of Motion", "Work Energy Power",
    "System of Particles", "Rotational Motion", "Gravitation", "Fluid Mechanics",
    "Thermal Properties", "Thermodynamics", "Kinetic Theory", "Oscillations", "Waves",
    "Electrostatics", "Current Electricity", "Magnetic Effects", "EMI", "AC Circuits",
    "Optics", "Dual Nature", "Atoms & Nuclei", "Semiconductors",
  ],
  chemistry: [
    "Mole Concept", "Atomic Structure", "Chemical Bonding", "States of Matter",
    "Thermodynamics", "Equilibrium", "Redox Reactions", "Electrochemistry",
    "Chemical Kinetics", "Surface Chemistry", "Periodic Table", "s-Block Elements",
    "p-Block Elements", "d & f Block Elements", "Coordination Compounds",
    "Organic Chemistry Basics", "Hydrocarbons", "Haloalkanes", "Alcohols Phenols Ethers",
    "Aldehydes Ketones", "Carboxylic Acids", "Amines", "Biomolecules", "Polymers",
  ],
};

// Icons
const CalendarIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const BookIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

export function PlannerClient() {
  const [examDate, setExamDate] = useState(() => {
    if (typeof window === "undefined") return "";
    const saved = getStoredJson<StudyPlan>("studyPlan:v1");
    return saved?.examDate || "";
  });
  const [dailyHours, setDailyHours] = useState(() => {
    if (typeof window === "undefined") return 6;
    const saved = getStoredJson<StudyPlan>("studyPlan:v1");
    return saved?.dailyHours || 6;
  });
  const [plan, setPlan] = useState<StudyPlan | null>(() => {
    if (typeof window === "undefined") return null;
    return getStoredJson<StudyPlan>("studyPlan:v1");
  });
  const [selectedDay, setSelectedDay] = useState<number>(0);

  function generatePlan() {
    if (!examDate) return;

    const today = new Date();
    const exam = new Date(examDate);
    const daysLeft = Math.max(1, Math.ceil((exam.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));

    // Combine all chapters
    const allChapters: ChapterTask[] = [];
    (["math", "physics", "chemistry"] as const).forEach((subj) => {
      ALL_CHAPTERS[subj].forEach((ch) => {
        allChapters.push({ subject: subj, chapter: ch, status: "pending" });
      });
    });

    // Chapters per day (based on hours available)
    const chaptersPerDay = Math.ceil(dailyHours / 1.5); // ~1.5 hours per chapter
    
    const schedule: DayPlan[] = [];
    let chapterIndex = 0;

    for (let d = 0; d < daysLeft; d++) {
      const date = new Date(today);
      date.setDate(today.getDate() + d);
      const dateStr = date.toISOString().split("T")[0];

      // Every 7th day is revision, every 14th is test
      const isRevision = (d + 1) % 7 === 0;
      const isTest = (d + 1) % 14 === 0;

      const dayChapters: ChapterTask[] = [];

      if (!isRevision && !isTest) {
        for (let c = 0; c < chaptersPerDay && chapterIndex < allChapters.length; c++) {
          dayChapters.push({ ...allChapters[chapterIndex] });
          chapterIndex++;
        }
      }

      schedule.push({
        date: dateStr,
        dayNumber: d + 1,
        isRevision,
        isTest,
        chapters: dayChapters,
      });
    }

    const newPlan: StudyPlan = {
      examDate,
      dailyHours,
      createdAt: Date.now(),
      schedule,
    };

    setPlan(newPlan);
    setStoredJson("studyPlan:v1", newPlan);
  }

  function toggleChapterStatus(dayIndex: number, chapterIndex: number) {
    if (!plan) return;
    const newSchedule = [...plan.schedule];
    const chapter = newSchedule[dayIndex].chapters[chapterIndex];
    chapter.status = chapter.status === "done" ? "pending" : "done";
    const newPlan = { ...plan, schedule: newSchedule };
    setPlan(newPlan);
    setStoredJson("studyPlan:v1", newPlan);
  }

  function clearPlan() {
    if (!confirm("Clear your study plan?")) return;
    setPlan(null);
    setStoredJson("studyPlan:v1", null);
  }

  // Stats
  const totalChapters = plan?.schedule.reduce((sum, d) => sum + d.chapters.length, 0) || 0;
  const doneChapters = plan?.schedule.reduce((sum, d) => sum + d.chapters.filter((c) => c.status === "done").length, 0) || 0;
  const progress = totalChapters > 0 ? Math.round((doneChapters / totalChapters) * 100) : 0;

  const currentDay = plan?.schedule[selectedDay];

  return (
    <div className="grid gap-4 animate-fade-in">
      {/* Header */}
      <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-green-500 to-teal-500 text-white">
              <CalendarIcon />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight gradient-text">Smart Study Planner</h1>
              <p className="text-sm text-zinc-500">AI-generated schedule for JEE MAINS</p>
            </div>
          </div>
          {plan && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-green-600">{progress}%</div>
                <div className="text-xs text-zinc-500">{doneChapters}/{totalChapters} done</div>
              </div>
              <button
                onClick={clearPlan}
                className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50 btn-interactive"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Setup Form */}
      {!plan && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm animate-slide-up">
          <h2 className="text-lg font-semibold mb-4">Create Your Study Plan</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Exam Date</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus-ring"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Daily Study Hours</label>
              <input
                type="number"
                value={dailyHours}
                onChange={(e) => setDailyHours(Math.max(1, Math.min(16, Number(e.target.value))))}
                min={1}
                max={16}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus-ring"
              />
            </div>
          </div>
          <button
            onClick={generatePlan}
            disabled={!examDate}
            className="mt-4 h-10 rounded-lg bg-gradient-to-r from-green-500 to-teal-500 px-6 text-sm font-medium text-white shadow-md disabled:opacity-40 btn-interactive"
          >
            Generate Plan
          </button>
        </div>
      )}

      {/* Plan View */}
      {plan && (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          {/* Calendar Sidebar */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm max-h-[70vh] overflow-auto smooth-scroll">
            <div className="text-sm font-semibold text-zinc-700 mb-3">Schedule Overview</div>
            <div className="grid gap-1">
              {plan.schedule.slice(0, 60).map((day, i) => {
                const dayDone = day.chapters.every((c) => c.status === "done") && day.chapters.length > 0;
                const hasProgress = day.chapters.some((c) => c.status === "done");
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(i)}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-all ${
                      selectedDay === i
                        ? "bg-green-100 border border-green-300"
                        : "hover:bg-zinc-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        day.isTest ? "bg-purple-500 text-white" :
                        day.isRevision ? "bg-amber-500 text-white" :
                        dayDone ? "bg-green-500 text-white" :
                        hasProgress ? "bg-green-200 text-green-800" :
                        "bg-zinc-100 text-zinc-600"
                      }`}>
                        {dayDone ? <CheckIcon /> : day.dayNumber}
                      </span>
                      <span className="text-zinc-700">{new Date(day.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    {day.isTest && <span className="text-[10px] font-bold text-purple-600">TEST</span>}
                    {day.isRevision && !day.isTest && <span className="text-[10px] font-bold text-amber-600">REV</span>}
                  </button>
                );
              })}
            </div>
            {plan.schedule.length > 60 && (
              <div className="mt-2 text-xs text-zinc-500 text-center">
                + {plan.schedule.length - 60} more days
              </div>
            )}
          </div>

          {/* Day Detail */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm animate-fade-in">
            {currentDay && (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-zinc-500">Day {currentDay.dayNumber}</div>
                    <div className="text-lg font-bold">
                      {new Date(currentDay.date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                    </div>
                  </div>
                  {currentDay.isTest && (
                    <span className="rounded-lg bg-purple-100 px-3 py-1.5 text-sm font-bold text-purple-700">📝 Test Day</span>
                  )}
                  {currentDay.isRevision && !currentDay.isTest && (
                    <span className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-700">🔄 Revision Day</span>
                  )}
                </div>

                {currentDay.isTest && (
                  <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 mb-4">
                    <div className="font-semibold text-purple-800 mb-2">Full Mock Test</div>
                    <ul className="text-sm text-purple-700 space-y-1">
                      <li>• Take a complete 3-hour mock test</li>
                      <li>• Cover all 3 subjects (Math + Physics + Chemistry)</li>
                      <li>• Analyze results and note weak areas</li>
                    </ul>
                  </div>
                )}

                {currentDay.isRevision && !currentDay.isTest && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4">
                    <div className="font-semibold text-amber-800 mb-2">Revision Day</div>
                    <ul className="text-sm text-amber-700 space-y-1">
                      <li>• Revise all chapters from last 6 days</li>
                      <li>• Focus on formulas and tricky concepts</li>
                      <li>• Solve 20-30 practice problems</li>
                    </ul>
                  </div>
                )}

                {currentDay.chapters.length > 0 && (
                  <div className="grid gap-2">
                    <div className="text-sm font-semibold text-zinc-700 mb-1">Today&apos;s Chapters</div>
                    {currentDay.chapters.map((ch, ci) => (
                      <button
                        key={ci}
                        onClick={() => toggleChapterStatus(selectedDay, ci)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-all ${
                          ch.status === "done"
                            ? "border-green-300 bg-green-50"
                            : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          ch.status === "done" ? "bg-green-500 text-white" : "bg-zinc-100"
                        }`}>
                          {ch.status === "done" ? <CheckIcon /> : <BookIcon />}
                        </div>
                        <div className="flex-1">
                          <div className={`font-medium ${ch.status === "done" ? "text-green-800 line-through" : "text-zinc-800"}`}>
                            {ch.chapter}
                          </div>
                          <div className="text-xs capitalize text-zinc-500">{ch.subject}</div>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          ch.subject === "math" ? "bg-blue-100 text-blue-700" :
                          ch.subject === "physics" ? "bg-orange-100 text-orange-700" :
                          "bg-purple-100 text-purple-700"
                        }`}>{ch.subject.slice(0, 3)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {!currentDay.isTest && !currentDay.isRevision && currentDay.chapters.length === 0 && (
                  <div className="text-center text-zinc-500 py-8">
                    All chapters have been scheduled! 🎉
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {plan && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-700">Overall Progress</span>
            <span className="text-sm font-bold text-green-600">{progress}%</span>
          </div>
          <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-green-500 to-teal-500 progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>{doneChapters} chapters completed</span>
            <span>{totalChapters - doneChapters} remaining</span>
          </div>
        </div>
      )}
    </div>
  );
}
