import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { listChapters } from "@/lib/content/server";
import { isSubjectId } from "@/lib/content/subject";

export default async function SubjectPage({
  params,
}: {
  params: Promise<{ subject: string }>;
}) {
  const { subject } = await params;
  if (!isSubjectId(subject)) notFound();

  const chapters = await listChapters(subject);

  const subjectName =
    subject === "math" ? "Mathematics" : subject === "physics" ? "Physics" : "Chemistry";

  return (
    <AppShell>
      <div className="grid gap-4">
        <header className="rounded-xl border border-zinc-200 bg-white p-5">
          <h1 className="text-xl font-semibold tracking-tight">{subjectName}</h1>
          <p className="mt-1 text-sm text-zinc-700">
            Chapters are loaded from static JSON in <code className="font-mono">/content</code>.
          </p>
        </header>

        <section className="grid gap-3">
          {chapters.map((c) => (
            <div
              key={c.chapterId}
              className="rounded-xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold tracking-tight">{c.chapterName}</div>
                  <div className="mt-1 text-xs text-zinc-600">
                    Difficulty: {c.difficulty} · Weightage: {c.weightage}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                    href={`/tutor/${subject}/${c.chapterId}`}
                  >
                    Tutor
                  </Link>
                  <Link
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:bg-zinc-50"
                    href={`/formulas/${subject}/${c.chapterId}`}
                  >
                    Formula Vault
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </AppShell>
  );
}

