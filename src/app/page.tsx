import Link from "next/link";
import { AppShell } from "@/components/AppShell";

export default function Home() {
  return (
    <AppShell>
      <div className="grid gap-6 animate-fade-in">
        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 p-6 md:p-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-3xl">🎯</span>
              <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                JEE MAINS 2026
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-2">
              Your AI Tutor for 200+ Score
          </h1>
            <p className="text-blue-100 text-sm md:text-base max-w-lg mb-5">
              Allen/FIITJEE-level coaching in your pocket. Bullet-only explanations, formula-first approach, and instant doubt solving.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-purple-700 shadow-lg transition-all hover:shadow-xl hover:scale-105 btn-interactive"
              >
                💬 Start Chat Tutor
              </Link>
              <Link
                href="/quiz"
                className="inline-flex items-center gap-2 rounded-xl bg-white/20 backdrop-blur-sm px-5 py-3 text-sm font-semibold text-white border border-white/30 transition-all hover:bg-white/30 btn-interactive"
            >
                📝 Take Quiz
              </Link>
            </div>
          </div>
        </section>

        {/* Quick Actions */}
        <section className="grid gap-4 md:grid-cols-4">
          {[
            { title: "Chat Tutor", href: "/chat", icon: "💬", desc: "Ask any doubt", gradient: "from-blue-500 to-cyan-500" },
            { title: "AI Quiz", href: "/quiz", icon: "📝", desc: "Test yourself", gradient: "from-amber-500 to-orange-500" },
            { title: "PYQ Practice", href: "/pyq", icon: "📚", desc: "Past papers", gradient: "from-green-500 to-emerald-500" },
            { title: "Study Planner", href: "/planner", icon: "📅", desc: "Daily schedule", gradient: "from-purple-500 to-pink-500" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-lg hover:-translate-y-1 card-hover"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.gradient} text-2xl mb-3 shadow-md group-hover:scale-110 transition-transform`}>
                {item.icon}
        </div>
              <div className="font-semibold text-zinc-900">{item.title}</div>
              <div className="text-sm text-zinc-500">{item.desc}</div>
            </Link>
          ))}
        </section>

        {/* Subject Cards */}
        <section>
          <h2 className="text-lg font-bold text-zinc-800 mb-3">Browse by Subject</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { title: "Mathematics", href: "/subject/math", icon: "📐", color: "blue", chapters: "22 chapters", topics: "Algebra, Calculus, Coordinate, Vectors" },
              { title: "Physics", href: "/subject/physics", icon: "⚛️", color: "orange", chapters: "22 chapters", topics: "Mechanics, Electro, Optics, Modern" },
              { title: "Chemistry", href: "/subject/chemistry", icon: "🧪", color: "purple", chapters: "24 chapters", topics: "Physical, Organic, Inorganic" },
            ].map((subj) => (
              <Link
                key={subj.href}
                href={subj.href}
                className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition-all hover:shadow-lg card-hover"
          >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl">{subj.icon}</span>
                  <div>
                    <div className="font-bold text-zinc-900">{subj.title}</div>
                    <div className="text-xs text-zinc-500">{subj.chapters}</div>
                  </div>
                </div>
                <div className="text-sm text-zinc-600">{subj.topics}</div>
                <div className="mt-3 flex items-center gap-1 text-xs font-medium text-blue-600 group-hover:gap-2 transition-all">
                  Explore chapters →
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-zinc-800 mb-4">Why This App?</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { icon: "⚡", title: "Bullet-Only", desc: "No fluff. Formula → Steps → Answer." },
              { icon: "🎯", title: "NTA Traps", desc: "Learn common mistakes NTA exploits." },
              { icon: "📸", title: "Image Solve", desc: "Upload question photo, get solution." },
              { icon: "🧠", title: "Mistake Analysis", desc: "AI explains why you went wrong." },
              { icon: "📊", title: "Score Tracking", desc: "See improvement over time." },
              { icon: "📱", title: "Mobile First", desc: "Study anywhere, anytime." },
            ].map((f, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-2xl">{f.icon}</span>
                <div>
                  <div className="font-semibold text-zinc-800">{f.title}</div>
                  <div className="text-sm text-zinc-600">{f.desc}</div>
                </div>
              </div>
            ))}
        </div>
        </section>

        {/* Motivation Quote */}
        <section className="rounded-2xl bg-gradient-to-r from-zinc-900 to-zinc-800 p-6 text-center text-white shadow-lg">
          <div className="text-2xl mb-2">&ldquo;Discipline is choosing between what you want now and what you want most.&rdquo;</div>
          <div className="text-zinc-400 text-sm">— Focus on your 200+ score goal 🎯</div>
        </section>
    </div>
    </AppShell>
  );
}
