"use client";

import { useEffect, useRef, useState } from "react";

export function DocumentDivider({ documentId }: { documentId: string }) {
  const divider = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [size, setSize] = useState({ width: 300, max: 300 });

  useEffect(() => {
    const body = divider.current!.parentElement!;
    const chat = body.firstElementChild!;
    const observer = new ResizeObserver(() => {
      const available = body.getBoundingClientRect().width - 1;
      setSize({
        width: Math.round(chat.getBoundingClientRect().width),
        max: Math.round(Math.min(available * 0.65, available - 360)),
      });
    });
    observer.observe(body);
    observer.observe(chat);
    return () => observer.disconnect();
  }, []);

  function resize(width: number) {
    const body = divider.current!.parentElement!;
    const available = body.getBoundingClientRect().width - 1;
    const max = Math.min(available * 0.65, available - 360);
    body.style.setProperty(
      "--document-chat-width",
      `${Math.max(300, Math.min(max, width))}px`,
    );
  }

  function reset() {
    divider.current!.parentElement!.style.removeProperty(
      "--document-chat-width",
    );
  }

  return (
    <div
      ref={divider}
      className="document-divider"
      role="separator"
      tabIndex={0}
      aria-label="Resize chat and document"
      aria-orientation="vertical"
      aria-controls={documentId}
      aria-valuemin={300}
      aria-valuemax={Math.max(300, size.max)}
      aria-valuenow={size.width}
      aria-valuetext={`${size.width} pixels for chat`}
      title="Drag to resize. Use arrow keys to adjust, or double-click to reset."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        drag.current = { x: event.clientX, width: size.width };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (drag.current) {
          resize(drag.current.width + event.clientX - drag.current.x);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={reset}
      onKeyDown={(event) => {
        switch (event.key) {
          case "ArrowLeft":
            resize(size.width - (event.shiftKey ? 64 : 16));
            break;
          case "ArrowRight":
            resize(size.width + (event.shiftKey ? 64 : 16));
            break;
          case "Home":
            resize(300);
            break;
          case "End":
            resize(size.max);
            break;
          case "Enter":
            reset();
            break;
          default:
            return;
        }
        event.preventDefault();
      }}
    />
  );
}
