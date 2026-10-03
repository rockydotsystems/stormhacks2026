"use client";

import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChatCircleIcon,
  CheckIcon,
  FileTextIcon,
  FolderIcon,
  LightningIcon,
  ListIcon,
  PlusIcon,
  PlugsConnectedIcon,
  SidebarSimpleIcon,
  SparkleIcon,
  SquareIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AgentActivity } from "@/features/workspace/components/agent-activity";
import { ConnectionsDialog } from "@/features/workspace/components/connections-dialog";
import { DocumentViewer } from "@/features/workspace/components/document-viewer";
import {
  documents,
  initialConversations,
  previewReply,
  type Conversation,
  type DocumentId,
} from "@/features/workspace/preview-data";
import { cn } from "@/lib/utils";

export function Workspace() {
  const [conversations, setConversations] =
    useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState("welcome");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [documentId, setDocumentId] = useState<DocumentId | null>("brief");
  const [documentFocused, setDocumentFocused] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageEnd = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const active = conversations.find(
    (conversation) => conversation.id === activeId,
  )!;
  const selectedDocument = documents.find(
    (document) => document.id === documentId,
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: "end" });
  }, [active.messages.length, running]);

  function stop() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setRunning(false);
    setStopped(true);
  }

  function selectConversation(id: string) {
    stop();
    setStopped(false);
    setActiveId(id);
    setDraft("");
    setNavigationOpen(false);
    setDocumentFocused(false);
  }

  function newConversation() {
    const id = crypto.randomUUID();
    setConversations((items) => [
      { id, title: "New conversation", messages: [] },
      ...items,
    ]);
    selectConversation(id);
    setSearch("");
    composer.current?.focus();
  }

  function openDocument(id: DocumentId) {
    setDocumentId(id);
    setDocumentFocused(window.matchMedia("(max-width: 1023px)").matches);
    setDocumentsOpen(false);
    setNavigationOpen(false);
  }

  function closeDocument() {
    setDocumentId(null);
    setDocumentFocused(false);
    composer.current?.focus();
  }

  function send() {
    const prompt = draft.trim();
    if (!prompt || running) return;
    setDraft("");
    setStopped(false);
    setRunning(true);
    setConversations((items) =>
      items.map((conversation) =>
        conversation.id === activeId
          ? {
              ...conversation,
              title:
                conversation.messages.length === 0
                  ? prompt.slice(0, 42)
                  : conversation.title,
              messages: [
                ...conversation.messages,
                { id: crypto.randomUUID(), role: "user", text: prompt },
              ],
            }
          : conversation,
      ),
    );
    timer.current = setTimeout(() => {
      setConversations((items) =>
        items.map((conversation) =>
          conversation.id === activeId
            ? {
                ...conversation,
                messages: [
                  ...conversation.messages,
                  {
                    id: crypto.randomUUID(),
                    role: "assistant",
                    ...previewReply(prompt),
                  },
                ],
              }
            : conversation,
        ),
      );
      setRunning(false);
      timer.current = null;
    }, 1600);
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col px-3 py-4">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <LightningIcon weight="fill" className="size-4" aria-hidden="true" />
        </span>
        <span className="text-sm font-semibold tracking-tight">
          StormHacks
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            workspace
          </span>
        </span>
      </div>
      <Button
        variant="outline"
        className="mb-5 w-full justify-start bg-background/70"
        onClick={newConversation}
      >
        <PlusIcon /> New conversation
      </Button>
      <nav aria-label="Workspace" className="space-y-1">
        <Button
          variant="ghost"
          className="w-full justify-start bg-accent text-foreground"
          onClick={() => {
            setNavigationOpen(false);
            setDocumentFocused(false);
          }}
        >
          <ChatCircleIcon /> Conversations
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setDocumentsOpen(true)}
        >
          <FileTextIcon /> Documents{" "}
          <span className="ml-auto text-xs">{documents.length}</span>
        </Button>
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setConnectionsOpen(true)}
        >
          <PlugsConnectedIcon /> Connections
          <span className="ml-auto rounded-md bg-muted px-1.5 text-[10px]">
            MCP
          </span>
        </Button>
      </nav>
      <div className="mt-7 flex min-h-0 flex-1 flex-col">
        <div className="mb-3 flex items-center justify-between px-2">
          <h2 className="text-[11px] font-medium text-muted-foreground">
            Recent conversations
          </h2>
          <ChatCircleIcon
            className="size-3.5 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <Input
          aria-label="Search conversations"
          type="search"
          placeholder="Find a conversation…"
          className="mb-3 h-8 border-transparent bg-background/50 text-xs shadow-none"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {conversations
            .filter((conversation) =>
              conversation.title.toLowerCase().includes(search.toLowerCase()),
            )
            .map((conversation) => (
              <Button
                key={conversation.id}
                variant="ghost"
                onClick={() => selectConversation(conversation.id)}
                aria-current={activeId === conversation.id ? "page" : undefined}
                className={cn(
                  "w-full justify-start truncate px-2.5 text-xs font-normal text-muted-foreground",
                  activeId === conversation.id &&
                    "bg-background font-medium text-foreground shadow-xs",
                )}
              >
                <span className="truncate">{conversation.title}</span>
              </Button>
            ))}
          {conversations.every(
            (conversation) =>
              !conversation.title.toLowerCase().includes(search.toLowerCase()),
          ) && (
            <div className="p-2 text-xs leading-5 text-muted-foreground">
              No matching conversations.
              <Button variant="link" size="xs" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-5 rounded-xl border border-primary/10 bg-primary/4 p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <SparkleIcon className="size-3.5 text-primary" aria-hidden="true" /> A
          little less tab-switching.
        </div>
        <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
          Your ideas, tools, and documents.
          <br />
          All in the same conversation.
        </p>
      </div>
      <Button
        render={<Link href="/starter" />}
        variant="ghost"
        className="mt-3 h-auto justify-start px-2 py-2"
      >
        <span className="flex size-7 items-center justify-center rounded-full border bg-background text-xs">
          S
        </span>
        <span className="text-left">
          <span className="block text-xs font-medium">Personal workspace</span>
          <span className="block text-[10px] font-normal text-muted-foreground">
            Account & starter demo
          </span>
        </span>
      </Button>
    </div>
  );

  return (
    <div className="workspace-shell flex h-dvh min-h-0 gap-1 bg-muted/70 p-2 sm:p-3">
      <a
        href="#chat-composer"
        className="sr-only z-50 rounded-lg bg-background p-3 focus:not-sr-only focus:absolute"
      >
        Skip to message composer
      </a>
      {sidebarVisible && (
        <aside className="hidden w-57 shrink-0 md:block">{sidebar}</aside>
      )}
      <main className="relative flex min-w-0 flex-1 overflow-hidden rounded-2xl border bg-background shadow-xs">
        <section
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            documentFocused && "max-lg:hidden",
          )}
          aria-label="Chat"
        >
          <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden md:inline-flex"
              aria-label={sidebarVisible ? "Hide sidebar" : "Show sidebar"}
              onClick={() => setSidebarVisible((value) => !value)}
            >
              <SidebarSimpleIcon />
            </Button>
            <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
              <DialogTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="md:hidden"
                    aria-label="Open navigation"
                  />
                }
              >
                <ListIcon />
              </DialogTrigger>
              <DialogPopup className="h-[min(650px,85dvh)] max-w-sm">
                <DialogHeader className="sr-only">
                  <DialogTitle>Workspace navigation</DialogTitle>
                  <DialogDescription>
                    Open conversations, documents, or connections.
                  </DialogDescription>
                </DialogHeader>
                <DialogPanel className="flex-1 p-2 pt-4">{sidebar}</DialogPanel>
              </DialogPopup>
            </Dialog>
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <FolderIcon
                className="hidden size-4 text-muted-foreground sm:block"
                aria-hidden="true"
              />
              <span className="hidden text-muted-foreground xl:block">
                Workspace
              </span>
              <span className="hidden text-muted-foreground/50 xl:block">
                /
              </span>
              <h1 className="truncate font-medium">{active.title}</h1>
            </div>
            <span className="ml-auto shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              Preview
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open documents"
              onClick={() => setDocumentsOpen(true)}
            >
              <FileTextIcon />
            </Button>
          </header>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
          >
            <div className="mx-auto max-w-2xl py-10 sm:py-12">
              {active.messages.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center text-center">
                  <span className="mb-5 flex size-12 items-center justify-center rounded-2xl border bg-primary/5 text-primary">
                    <SparkleIcon className="size-6" aria-hidden="true" />
                  </span>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    What’s on your mind?
                  </h2>
                  <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                    Start with an idea. Give it a little context.
                    <br />
                    Make something worth keeping.
                  </p>
                  <div className="mt-7 flex flex-wrap justify-center gap-2">
                    {["Explore the design", "Make a launch plan"].map(
                      (prompt) => (
                        <Button
                          key={prompt}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setDraft(prompt);
                            composer.current?.focus();
                          }}
                        >
                          {prompt} <ArrowUpIcon className="rotate-45" />
                        </Button>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                active.messages.map((message, index) => (
                  <article
                    key={message.id}
                    className={cn(
                      "mb-9",
                      message.role === "user" && "flex justify-end",
                    )}
                    aria-label={
                      message.role === "user"
                        ? "Your message"
                        : "Assistant message"
                    }
                  >
                    {message.role === "user" ? (
                      <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-muted/80 px-5 py-3.5 text-sm leading-7">
                        {message.text}
                      </p>
                    ) : (
                      <div className="w-full">
                        <div className="mb-4 flex items-center gap-2.5">
                          <span className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <SparkleIcon
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="text-xs font-semibold">
                            Workspace
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Sample response
                          </span>
                        </div>
                        {index === 1 && active.id === "welcome" && (
                          <AgentActivity />
                        )}
                        <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">
                          {message.text}
                        </p>
                        {message.documentId && (
                          <button
                            type="button"
                            className="mt-6 flex w-full max-w-sm items-center gap-3 rounded-xl border p-3.5 text-left shadow-xs transition-colors hover:bg-accent"
                            onClick={() => openDocument(message.documentId!)}
                          >
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/50">
                              <FileTextIcon
                                className="size-5 text-primary"
                                aria-hidden="true"
                              />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {
                                  documents.find(
                                    (document) =>
                                      document.id === message.documentId,
                                  )?.title
                                }
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                Document · Open alongside chat
                              </span>
                            </span>
                            <ArrowUpIcon
                              className="size-4 rotate-45 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                ))
              )}
              {(running || stopped) && (
                <AgentActivity running={running} stopped={stopped} />
              )}
              <div ref={messageEnd} />
            </div>
          </div>
          <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-5">
            <form
              className="mx-auto max-w-2xl rounded-2xl border bg-background p-3 shadow-[0_2px_12px_rgb(0_0_0/3%)] focus-within:border-ring/40"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <label
                htmlFor="chat-composer"
                className="mb-1 block px-2 text-[11px] font-medium text-muted-foreground"
              >
                Message workspace
              </label>
              <Textarea
                unstyled
                ref={composer}
                id="chat-composer"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask a question, or give an idea some room…"
                className="min-h-16 max-h-40 border-0 bg-transparent shadow-none focus-within:ring-0"
                rows={2}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <div className="mt-2 flex items-center justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDocumentsOpen(true)}
                  className="text-xs text-muted-foreground"
                >
                  <PlusIcon /> Add context
                </Button>
                <div className="flex items-center gap-3">
                  <span className="hidden text-[10px] text-muted-foreground sm:block">
                    Demo assistant
                  </span>
                  {running ? (
                    <Button
                      size="icon"
                      variant="secondary"
                      aria-label="Stop response"
                      onClick={stop}
                    >
                      <SquareIcon weight="fill" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      aria-label="Send message"
                      disabled={!draft.trim()}
                    >
                      <ArrowUpIcon weight="bold" />
                    </Button>
                  )}
                </div>
              </div>
            </form>
            <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
              UI preview · Sample replies · Nothing is sent to an AI provider
            </p>
          </div>
        </section>
        {selectedDocument && (
          <aside
            className={cn(
              "min-h-0 w-[min(36%,440px)] min-w-80 shrink-0 border-l bg-card/60",
              documentFocused
                ? "max-lg:w-full max-lg:min-w-0 max-lg:border-l-0"
                : "max-lg:hidden",
            )}
          >
            <DocumentViewer
              document={selectedDocument}
              onClose={closeDocument}
            />
          </aside>
        )}
      </main>
      <Dialog open={documentsOpen} onOpenChange={setDocumentsOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Workspace documents</DialogTitle>
            <DialogDescription>
              Keep the context close. Open a sample document beside your
              conversation.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-2">
            {documents.map((document) => (
              <button
                key={document.id}
                type="button"
                className="flex w-full items-center gap-3 rounded-xl border p-4 text-left hover:bg-accent"
                onClick={() => openDocument(document.id)}
              >
                <FileTextIcon
                  className="size-5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {document.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {document.eyebrow}
                  </span>
                </span>
                {documentId === document.id ? (
                  <CheckIcon className="size-4 text-primary" />
                ) : (
                  <ArrowDownIcon className="size-4 -rotate-45 text-muted-foreground" />
                )}
              </button>
            ))}
            <DialogClose
              render={<Button variant="ghost" className="mt-3 w-full" />}
            >
              Back to conversation
            </DialogClose>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <ConnectionsDialog
        open={connectionsOpen}
        onOpenChange={setConnectionsOpen}
      />
    </div>
  );
}
