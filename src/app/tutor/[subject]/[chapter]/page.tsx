import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getChapter } from "@/lib/content/server";
import { isSubjectId } from "@/lib/content/subject";
import { TutorClient } from "./tutor-client";

export default async function TutorChapterPage({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = await params;
  if (!isSubjectId(subject)) notFound();

  const doc = await getChapter(subject, chapter).catch(() => null);
  if (!doc) notFound();

  return (
    <AppShell>
      <TutorClient chapter={doc} />
    </AppShell>
  );
}

