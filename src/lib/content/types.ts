export type SubjectId = "math" | "physics" | "chemistry";

export type Difficulty = "easy" | "medium" | "hard";
export type Weightage = "low" | "medium" | "high";

export type ChapterSubtopic = {
  id: string;
  name: string;
  difficulty: Difficulty;
  weightage: Weightage;
  tags: string[];
};

export type ChapterFormulaTag =
  | "must-memorize"
  | "frequently-asked"
  | "rare-but-dangerous"
  | "dangerous-if-forgot"
  | "nta-trap";

export type ChapterFormula = {
  id: string;
  expression: string;
  tags: ChapterFormulaTag[];
};

export type ChapterDocV1 = {
  schemaVersion: 1;
  subject: SubjectId;
  chapterId: string;
  chapterName: string;
  weightage: Weightage;
  difficulty: Difficulty;
  subtopics: ChapterSubtopic[];
  formulas: ChapterFormula[];
  shortcuts: string[];
  traps: string[];
  pyqReference: Array<{ year: number; note: string }>;
};

export type PyqItemV1 = {
  id: string;
  year: number; // 2019-2025 for now
  difficulty: Difficulty;
  question: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  shortSolution: string;
  whyOthersWrong: [string, string, string];
};

export type PyqDocV1 = {
  schemaVersion: 1;
  subject: SubjectId;
  chapterId: string;
  items: PyqItemV1[];
};

