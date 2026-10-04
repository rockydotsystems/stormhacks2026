"use client";

import { useEffect, useRef, useState } from "react";
import { CaretRightIcon } from "@phosphor-icons/react";

// One, two, then three dots, over and over. The width is fixed so the label does not shift.
function Ellipsis() {
  const [dots, setDots] = useState(1);
  useEffect(() => {
    const timer = setInterval(() => setDots((n) => (n % 3) + 1), 400);
    return () => clearInterval(timer);
  }, []);
  return (
    <span aria-hidden="true" className="inline-block w-[1.5em] text-left">
      {".".repeat(dots)}
    </span>
  );
}

/**
 * What the model reasoned before it answered. Open while the model is still thinking, then it
 * folds away and the user can open it again. Reasoning is a preview of the model's work, so it
 * is shown as plain text and never saved.
 */
export function ReasoningBlock({
  text,
  live,
}: {
  text: string;
  live: boolean;
}) {
  const [chosen, setChosen] = useState<boolean | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const open = chosen ?? live;

  useEffect(() => {
    if (live && open)
      body.current?.scrollTo({ top: body.current.scrollHeight });
  }, [text, live, open]);

  if (!text && !live) return null;
  return (
    <div className="planning-reasoning" data-live={live || undefined}>
      <button
        type="button"
        className="planning-reasoning-toggle"
        aria-expanded={open}
        onClick={() => setChosen(!open)}
      >
        <CaretRightIcon
          aria-hidden="true"
          weight="bold"
          data-open={open || undefined}
        />
        {live ? (
          <>
            Thinking
            <Ellipsis />
          </>
        ) : (
          "Thought process"
        )}
      </button>
      {open ? (
        <div ref={body} className="planning-reasoning-body">
          {text || "Reading the conversation…"}
        </div>
      ) : null}
    </div>
  );
}
