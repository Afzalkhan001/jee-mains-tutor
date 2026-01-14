import { AppShell } from "@/components/AppShell";
import { ChatClient } from "./chat-client";

export default function ChatPage() {
  return (
    <AppShell>
      <ChatClient />
    </AppShell>
  );
}

