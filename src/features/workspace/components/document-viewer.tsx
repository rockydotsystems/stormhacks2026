"use client";

import { ArrowSquareOutIcon, FileTextIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { WorkspaceDocument } from "@/features/workspace/preview-data";

export function DocumentViewer({
  document,
  onClose,
}: {
  document: WorkspaceDocument;
  onClose: () => void;
}) {
  function download() {
    const content = [
      `# ${document.title}`,
      document.summary,
      ...document.sections.flatMap((section) => [
        `## ${section.title}`,
        section.body,
        ...(section.bullets ?? []).map((bullet) => `- ${bullet}`),
      ]),
    ].join("\n\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/markdown" }),
    );
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.id}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="Document viewer"
    >
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-5">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <FileTextIcon className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{document.eyebrow}</span>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={download}
            aria-label="Download document"
          >
            <ArrowSquareOutIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label="Close document"
          >
            <XIcon />
          </Button>
        </div>
      </header>
      <article className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 py-10 sm:px-9">
        <div className="mb-7 flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
          <FileTextIcon className="size-6" aria-hidden="true" />
        </div>
        <p className="mb-3 text-xs font-medium text-muted-foreground">
          {document.eyebrow}
        </p>
        <h2 className="text-3xl font-semibold leading-tight tracking-tight">
          {document.title}
        </h2>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">
          {document.summary}
        </p>
        <div className="my-7 flex items-center gap-2 border-y py-3 text-xs text-muted-foreground">
          <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">
            S
          </span>{" "}
          Workspace sample <span className="ml-auto">Read only</span>
        </div>
        <div className="space-y-8">
          {document.sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-3 text-base font-semibold tracking-tight">
                {section.title}
              </h3>
              <p className="text-sm leading-7 text-foreground/80">
                {section.body}
              </p>
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-foreground/80 marker:text-muted-foreground">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <p className="mt-12 border-t pt-4 text-xs text-muted-foreground">
          A little context, always within reach.
        </p>
      </article>
    </section>
  );
}
