import "server-only";

import fs from "node:fs/promises";
import path from "node:path";
import { ChapterDocV1, PyqDocV1, SubjectId } from "./types";

const CONTENT_ROOT = path.join(process.cwd(), "content");

function subjectDir(subject: SubjectId) {
  return path.join(CONTENT_ROOT, subject);
}

export async function listChapters(subject: SubjectId) {
  const dir = subjectDir(subject);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name);

  const chapters: Array<Pick<ChapterDocV1, "chapterId" | "chapterName" | "difficulty" | "weightage">> =
    [];

  for (const file of jsonFiles) {
    const raw = await fs.readFile(path.join(dir, file), "utf8");
    const doc = JSON.parse(raw) as ChapterDocV1;
    chapters.push({
      chapterId: doc.chapterId,
      chapterName: doc.chapterName,
      difficulty: doc.difficulty,
      weightage: doc.weightage,
    });
  }

  chapters.sort((a, b) => a.chapterName.localeCompare(b.chapterName));
  return chapters;
}

export async function getChapter(subject: SubjectId, chapterId: string): Promise<ChapterDocV1> {
  const filePath = path.join(subjectDir(subject), `${chapterId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as ChapterDocV1;
}

export async function getPyqs(subject: SubjectId, chapterId: string): Promise<PyqDocV1> {
  const filePath = path.join(CONTENT_ROOT, "pyq", subject, `${chapterId}.json`);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as PyqDocV1;
}

