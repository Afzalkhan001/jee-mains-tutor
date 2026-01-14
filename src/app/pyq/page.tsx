import { AppShell } from "@/components/AppShell";
import { PYQClient } from "./pyq-client";

export default function PYQPage() {
  return (
    <AppShell>
      <PYQClient />
    </AppShell>
  );
}
