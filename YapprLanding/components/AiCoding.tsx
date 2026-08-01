"use client";

import Image from "next/image";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ClaudeCodeShell } from "./shells/ClaudeCodeShell";
import { CursorShell } from "./shells/CursorShell";
import { ChatGPTShell } from "./shells/ChatGPTShell";
import { TerminalShell } from "./shells/TerminalShell";
import { Pill } from "./Pill";

type Target = "claude" | "cursor" | "chatgpt" | "terminal";
type Phase = "listening" | "polishing" | "pasted";

const TARGETS: Array<{
  id: Target;
  name: string;
  logoSrc?: string;
  glyph?: string;
}> = [
  { id: "claude", name: "Claude Code", logoSrc: "/logos/claudecode.png" },
  { id: "cursor", name: "Cursor", logoSrc: "/logos/cursor.png" },
  { id: "chatgpt", name: "ChatGPT", logoSrc: "/logos/chatgpt.png" },
  { id: "terminal", name: "Terminal", glyph: "›_" },
];

const POLISHED: Record<Target, string> = {
  claude:
    "Refactor the polish pipeline to stream chunks instead of waiting for the full transcript, and add a fallback to local whisper.cpp if Groq returns 429.",
  cursor:
    "Could you make it easier to switch certificates in the transport listeners?",
  chatgpt:
    "Walk me through how a Vercel edge function actually runs versus a regular serverless function.",
  terminal:
    'gh pr create --title "feat: per-app polish defaults" --body "polish defaults for slack imessage gmail"',
};

export function AiCoding() {
  const [active, setActive] = useState<Target>("claude");
  const [phase, setPhase] = useState<Phase>("listening");
  const [flashing, setFlashing] = useState(false);

  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const cleanup = useCallback(() => {
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
  }, []);

  const schedule = useCallback((fn: () => void, delay: number) => {
    const t = setTimeout(fn, delay);
    timeoutsRef.current.push(t);
  }, []);

  const runFlow = useCallback(
    (target: Target) => {
      cleanup();
      setActive(target);
      setPhase("listening");
      setFlashing(false);

      // 1. Listening — 2.2s
      schedule(() => setPhase("polishing"), 2200);
      // 2. Polishing — 0.9s
      schedule(() => {
        setPhase("pasted");
        setFlashing(true);
      }, 3100);
      // 3. Drop flash after 0.6s so the animation can replay next loop
      schedule(() => setFlashing(false), 3700);

      // 4. Hold ~3s, then advance
      schedule(() => {
        const order: Target[] = ["claude", "cursor", "chatgpt", "terminal"];
        const next = order[(order.indexOf(target) + 1) % order.length];
        runFlow(next);
      }, 6100);
    },
    [cleanup, schedule],
  );

  useEffect(() => {
    runFlow("claude");
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const text = phase === "pasted" ? POLISHED[active] : "";

  return (
    <section id="ai-coding" className="max-w-[1240px] mx-auto px-8 py-16">
      <h2 className="font-serif font-normal text-[clamp(56px,8vw,72px)] leading-[0.95] tracking-[-0.02em] m-0 mb-4 max-w-[880px]">
        Talk to your <em>tools</em>.
      </h2>
      <p className="text-[17px] text-ink-2 max-w-[640px] mb-10 leading-[1.5]">
        Dictate prompts, rewrite selections, fire slash commands — all in your
        voice, anywhere on your Mac.
      </p>

      <div className="ai-stage">
        <div className="ai-side">
          <p className="font-serif italic text-[24px] m-0 mb-5 leading-[1.1]">
            Talk to →
          </p>

          {TARGETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ai-row ${active === t.id ? "on" : ""}`}
              onClick={() => runFlow(t.id)}
              aria-pressed={active === t.id}
            >
              <span className="ai-row__logo">
                {t.logoSrc ? (
                  <Image src={t.logoSrc} alt={t.name} width={24} height={24} />
                ) : (
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      color: "#9efba8",
                      background: "#1d1f21",
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {t.glyph}
                  </span>
                )}
              </span>
              <span className="ai-row__name">{t.name}</span>
            </button>
          ))}
        </div>

        <div className="ai-canvas">
          {TARGETS.map((t) => {
            const isActive = t.id === active;
            const props = {
              text: isActive ? text : "",
              flashing: isActive && flashing,
            };
            return (
              <div
                key={t.id}
                className={`ai-app ${isActive ? "active" : ""}`}
                aria-hidden={!isActive}
              >
                {t.id === "claude" && <ClaudeCodeShell {...props} />}
                {t.id === "cursor" && <CursorShell {...props} />}
                {t.id === "chatgpt" && <ChatGPTShell {...props} />}
                {t.id === "terminal" && <TerminalShell {...props} />}
              </div>
            );
          })}

          <div className="ai-pill-wrap">
            <Pill state={phase === "pasted" ? "done" : phase} label={
              phase === "pasted" ? "pasted" : undefined
            } />
          </div>
        </div>
      </div>

      <RewriteStage />

      <ul className="ai-features" aria-label="Yappr capabilities">
        {/* 1. Voice prompts — Claude-style chat surface with reply bubble + recording pill + input */}
        <li>
          <div className="feat-anim feat-anim--chat" aria-hidden="true">
            <span className="feat-chrome-tag">
              <Image src="/logos/claude.png" alt="" width={14} height={14} />
              Claude
            </span>

            <span className="vp-stack">
              <span className="vp-reply">
                <span className="vp-reply-bar vp-reply-bar-1" />
                <span className="vp-reply-bar vp-reply-bar-2" />
                <span className="vp-reply-bar vp-reply-bar-3" />
              </span>

              <span className="vp-recpill" aria-hidden="true">
                <span className="vp-recpill-dot" />
                <span className="vp-recpill-bars">
                  <span /><span /><span /><span /><span />
                </span>
              </span>

              <span className="feat-chat-input">
                <span className="feat-inner">
                  <span className="vp-raw">hey um can you uh write…</span>
                  <span className="vp-clean">Write a function that handles negatives.</span>
                </span>
                <span className="feat-chat-send" aria-hidden="true">↑</span>
              </span>
            </span>
          </div>
          <div className="ai-feat-meta">
            <p className="ai-feat-name">Voice prompts</p>
            <p className="ai-feat-desc">Clean prompts, not transcripts.</p>
          </div>
        </li>

        {/* 2. Dev dictionary — chips fan above a typing input that adds a new term */}
        <li>
          <div className="feat-anim feat-anim--dict" aria-hidden="true">
            <span className="feat-chrome-tag">
              <span className="feat-dict-glyph" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
                  <path d="M7 17h11" />
                </svg>
              </span>
              Dictionary
            </span>

            <span className="dict-stack">
              <span className="dict-chips">
                <span className="dict-chip dict-chip-1"><code>useEffect</code></span>
                <span className="dict-chip dict-chip-2"><code>kubectl</code></span>
                <span className="dict-chip dict-chip-3"><code>OAuth</code></span>
                <span className="dict-chip dict-chip-4"><code>your term</code></span>
              </span>

              <span className="dict-input">
                <span className="dict-input-label">+</span>
                <span className="dict-input-text">
                  <span className="dict-typing">tRPC</span>
                  <span className="dict-caret" />
                </span>
                <span className="dict-input-btn">Add</span>
              </span>
            </span>
          </div>
          <div className="ai-feat-meta">
            <p className="ai-feat-name">Dev dictionary</p>
            <p className="ai-feat-desc">Add the words Whisper keeps fumbling.</p>
          </div>
        </li>
      </ul>
    </section>
  );
}

// ─── Highlight → speak → rewrite motion stage ──────────────────────
// Cycles through 3 surfaces (Cursor / Notion / iMessage). Each one
// follows the same beat:
//   0–15%   surface at rest
//   15–35%  cursor drags across the target text, native-blue selection grows
//   35–55%  pill enters listening, instruction bubble pops in, "before" fades
//   55–80%  "after" text fades in, pill flips to polished, paste flash
//   80–100% hold and exit

type RewriteScene = {
  id: "cursor" | "notion" | "imsg";
  surfaceLabel: string;
  instruction: string;
  before: ReactNode;
  after: ReactNode;
};

const REWRITE_SCENES: RewriteScene[] = [
  {
    id: "cursor",
    surfaceLabel: "Cursor",
    instruction: "make this async/await",
    before: (
      <pre className="rw-code rw-before">
        <span className="rw-kw">function</span> <span className="rw-fn">fetchUser</span>(id) {"{"}
        {"\n  "}<span className="rw-kw">return</span> api.get(`/u/${"${id}"}`).then(r {"=>"} r.json());
        {"\n}"}
      </pre>
    ),
    after: (
      <pre className="rw-code rw-after">
        <span className="rw-kw">async function</span> <span className="rw-fn">fetchUser</span>(id) {"{"}
        {"\n  "}<span className="rw-kw">const</span> r = <span className="rw-kw">await</span> api.get(`/u/${"${id}"}`);
        {"\n  "}<span className="rw-kw">return</span> r.json();
        {"\n}"}
      </pre>
    ),
  },
  {
    id: "notion",
    surfaceLabel: "Notion",
    instruction: "make it more professional",
    before: (
      <p className="rw-doc rw-before">
        hey team — just a heads up, the launch is gonna slip by like a week 'cause
        the auth flow is still kinda flaky and we don't wanna ship it half-baked.
      </p>
    ),
    after: (
      <p className="rw-doc rw-after">
        Team — a quick update: we're pushing the launch back by approximately a
        week. The auth flow needs additional hardening before we ship.
      </p>
    ),
  },
  {
    id: "imsg",
    surfaceLabel: "iMessage",
    instruction: "casual",
    before: (
      <span className="rw-bubble rw-before">
        I regret to inform you that I will be unable to attend tonight.
      </span>
    ),
    after: (
      <span className="rw-bubble rw-after">
        yo can't make it tonight — rain check? 🙏
      </span>
    ),
  },
];

function RewriteStage() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setIdx((i) => (i + 1) % REWRITE_SCENES.length),
      6400,
    );
    return () => window.clearInterval(id);
  }, []);
  const scene = REWRITE_SCENES[idx];

  return (
    <div className="rw-stage">
      <div className="rw-header">
        <p className="rw-eyb">Highlight · speak · rewrite</p>
        <h3 className="rw-title">
          Select anything. Say what to change. <em>Watch it update.</em>
        </h3>
        <p className="rw-lede">
          Same gesture, every app — your editor, your docs, your chats. Yappr
          rewrites the selection in place.
        </p>
      </div>

      <div className="rw-surface" data-surface={scene.id} key={scene.id}>
        <div className="rw-chrome">
          <span className="rw-tl rw-tl-r" />
          <span className="rw-tl rw-tl-y" />
          <span className="rw-tl rw-tl-g" />
          <span className="rw-chrome-title">{scene.surfaceLabel}</span>
        </div>

        <div className="rw-body">
          <div className="rw-target">
            <span className="rw-selection" aria-hidden="true" />
            <span className="rw-before-layer">{scene.before}</span>
            <span className="rw-after-layer">{scene.after}</span>
          </div>

          <div className="rw-instr" aria-hidden="true">
            “{scene.instruction}”
          </div>

          <div className="rw-pill" aria-hidden="true">
            <span className="pill-dot" />
            <span className="pill-bars">
              <span /><span /><span /><span /><span /><span />
            </span>
            <span className="rw-pill-label">listening</span>
          </div>
        </div>
      </div>
    </div>
  );
}
