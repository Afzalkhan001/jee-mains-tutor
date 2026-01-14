import { AppShell } from "@/components/AppShell";
import { PlannerClient } from "./planner-client";

export default function PlannerPage() {
  return (
    <AppShell>
      <PlannerClient />
    </AppShell>
  );
}
