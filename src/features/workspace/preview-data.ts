export type DocumentId = "brief" | "research" | "checklist";

export type WorkspaceDocument = {
  id: DocumentId;
  title: string;
  eyebrow: string;
  summary: string;
  sections: { title: string; body: string; bullets?: string[] }[];
};

export const documents: WorkspaceDocument[] = [
  {
    id: "brief",
    title: "A calmer place to work",
    eyebrow: "Project brief",
    summary:
      "Bring your conversations, project decisions, and working documents into one thoughtful workspace.",
    sections: [
      {
        title: "The idea",
        body: "Good work happens when context stays close. Instead of switching between tabs, ask a question, follow the agent’s progress, and build on the answer right here.",
      },
      {
        title: "What we’re building",
        body: "A workspace that feels familiar from the first conversation.",
        bullets: [
          "A focused chat, with project context a message away",
          "Living documents alongside the conversation",
          "Clear activity updates, not a wall of reasoning",
          "AI client access to your project decisions",
        ],
      },
      {
        title: "A few guiding principles",
        body: "Keep the interface quiet. Make the next step obvious. Show what the agent is doing, and ask before taking actions that change your work.",
      },
      {
        title: "Next up",
        body: "Explore your project context and turn the conversation into something worth keeping.",
      },
    ],
  },
  {
    id: "research",
    title: "Workspace research",
    eyebrow: "Research notes",
    summary:
      "Three familiar patterns, brought together without the extra noise.",
    sections: [
      {
        title: "Linear · a sense of place",
        body: "A compact sidebar and a rounded main surface establish a clear boundary between navigation and work.",
      },
      {
        title: "ChatGPT · a natural conversation",
        body: "A readable message column, generous spacing, and an anchored composer keep the conversation moving.",
      },
      {
        title: "Notion · room for ideas",
        body: "Documents use simple blocks, strong headings, and comfortable line lengths. The viewer stays beside the chat, so context never disappears.",
      },
    ],
  },
  {
    id: "checklist",
    title: "Launch checklist",
    eyebrow: "Planning",
    summary: "A small, deliberate first release.",
    sections: [
      {
        title: "Workspace",
        body: "Make the everyday flow feel effortless.",
        bullets: [
          "Navigate between conversations",
          "Read a document beside the chat",
          "Inspect and stop agent activity",
        ],
      },
      {
        title: "AI clients",
        body: "Connect a client to your project decisions.",
        bullets: [
          "Configure the app’s MCP endpoint",
          "Sign in through the client’s browser flow",
          "Review tool requests before approving them",
        ],
      },
    ],
  },
];

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  documentId?: DocumentId;
};
export type Conversation = {
  id: string;
  title: string;
  messages: Message[];
  // Planning conversations are driven by the planning agent in `features/planning`.
  kind?: "planning";
  // Set once a planning conversation is saved on the server.
  serverId?: string;
};

export const initialConversations: Conversation[] = [
  {
    id: "welcome",
    title: "A calmer place to work",
    messages: [
      {
        id: "welcome-user",
        role: "user",
        text: "Help me shape the idea for our workspace. I want chat, connected tools, and docs to feel like one place.",
      },
      {
        id: "welcome-assistant",
        role: "assistant",
        text: "Let’s keep the conversation at the center, with everything you need within reach.\n\nI put together a short project brief: a focused chat, documents that open alongside it, and connected tools with clear permissions.\n\nThe guiding idea is simple: less switching, more making.",
        documentId: "brief",
      },
    ],
  },
  {
    id: "research",
    title: "Exploring the interface",
    messages: [
      {
        id: "research-assistant",
        role: "assistant",
        text: "The strongest starting point is a familiar layout with a quiet visual language. Here are the patterns behind this workspace.",
        documentId: "research",
      },
    ],
  },
  {
    id: "launch",
    title: "Getting ready to launch",
    messages: [
      {
        id: "launch-assistant",
        role: "assistant",
        text: "Start with the core loop: ask, follow progress, and keep the useful output. This checklist outlines what comes next.",
        documentId: "checklist",
      },
    ],
  },
];

export function previewReply(
  prompt: string,
): Pick<Message, "text" | "documentId"> {
  if (/research|interface|design/i.test(prompt)) {
    return {
      text: "Here are the interface research notes. They bring together a compact workspace shell, a focused conversation, and documents that stay close to the work. This is a sample response, not a live model output.",
      documentId: "research",
    };
  }
  if (/launch|checklist|plan/i.test(prompt)) {
    return {
      text: "Here’s a starting checklist for the first release. Focus on the conversation and document flow, then wire up real tool authorization. This is a sample response, not a live model output.",
      documentId: "checklist",
    };
  }
  return {
    text: "In this preview, we can explore the layout and interaction flow together. Open the project brief alongside this chat, or try asking about the design or launch plan. Live AI and connected tools haven’t been wired up yet.",
    documentId: "brief",
  };
}
