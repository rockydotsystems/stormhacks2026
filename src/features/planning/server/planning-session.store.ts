import "server-only";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  max,
  min,
  or,
  sql,
} from "drizzle-orm";
import {
  normalizeQuestions,
  type ChecklistEntry,
  type Phase,
} from "@/features/planning/contracts";
import { DocsService } from "@/features/docs/server/docs.service";
import { projects } from "@/features/projects/server/schema";
import type {
  AppliedChange,
  ChangeSourceRow,
  CommitRevertInput,
  CommitRevertResult,
  CommitTurnInput,
  CommitTurnResult,
  ConversationRow,
  MessageRow,
  PlanningSessionStore,
} from "@/features/planning/server/planning-session.types";
import {
  planningChangeSources,
  planningConversations,
  planningMessages,
} from "@/features/planning/server/schema";
import type { Database } from "@/server/db";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

function toConversation(
  row: typeof planningConversations.$inferSelect,
): ConversationRow {
  return {
    id: row.id,
    userId: row.userId,
    organizationId: row.organizationId,
    docId: row.docId,
    title: row.title,
    phase: row.phase,
    checklist: row.checklist as ChecklistEntry[],
    skillVersion: row.skillVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: typeof planningMessages.$inferSelect): MessageRow {
  return {
    id: row.id.toString(),
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    via: row.via,
    questions: row.questions ? normalizeQuestions(row.questions) : null,
    clientMessageId: row.clientMessageId,
    createdAt: row.createdAt,
  };
}

function toSource(
  row: typeof planningChangeSources.$inferSelect,
): ChangeSourceRow {
  return {
    docId: row.docId,
    changeId: row.changeId.toString(),
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId.toString(),
    resultMessageId: row.resultMessageId.toString(),
    rangeStartMessageId: row.rangeStartMessageId.toString(),
    rangeEndMessageId: row.rangeEndMessageId.toString(),
    mode: row.mode,
    revertedToChangeId: row.revertedToChangeId?.toString() ?? null,
    createdAt: row.createdAt,
  };
}

// Document writes run through a DocsService bound to the open transaction. Drizzle turns the
// service's own db.transaction call into a savepoint, so main's locking and triggers still apply
// and the whole commit stays atomic.
function docsOn(tx: Transaction): DocsService {
  return new DocsService({ db: tx as unknown as Database });
}

export class DrizzlePlanningSessionStore implements PlanningSessionStore {
  constructor(private readonly dependencies: { db: Database }) {}

  async createConversation(input: {
    userId: string;
    organizationId: string;
    title: string;
    docId?: string | null;
    phase?: Phase;
  }) {
    const [row] = await this.dependencies.db
      .insert(planningConversations)
      .values(input)
      .returning();
    return toConversation(row);
  }

  async findOwnedConversation(userId: string, id: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningConversations)
      .where(
        and(
          eq(planningConversations.id, id),
          eq(planningConversations.userId, userId),
        ),
      );
    return row ? toConversation(row) : null;
  }

  async findConversationByDoc(userId: string, docId: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningConversations)
      .where(
        and(
          eq(planningConversations.docId, docId),
          eq(planningConversations.userId, userId),
        ),
      );
    return row ? toConversation(row) : null;
  }

  async findConversation(userId: string, organizationId: string, id: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningConversations)
      .where(
        and(
          eq(planningConversations.id, id),
          eq(planningConversations.userId, userId),
          eq(planningConversations.organizationId, organizationId),
        ),
      );
    return row ? toConversation(row) : null;
  }

  async listConversations(userId: string, organizationId: string) {
    const rows = await this.dependencies.db
      .select()
      .from(planningConversations)
      .where(
        and(
          eq(planningConversations.userId, userId),
          eq(planningConversations.organizationId, organizationId),
        ),
      )
      .orderBy(desc(planningConversations.updatedAt))
      .limit(100);
    return rows.map(toConversation);
  }

  async claimTurn(conversationId: string, leaseSeconds: number) {
    const rows = await this.dependencies.db
      .update(planningConversations)
      .set({ turnLockedAt: sql`now()` })
      .where(
        and(
          eq(planningConversations.id, conversationId),
          or(
            isNull(planningConversations.turnLockedAt),
            lt(
              planningConversations.turnLockedAt,
              sql`now() - make_interval(secs => ${leaseSeconds}::double precision)`,
            ),
          ),
        ),
      )
      .returning({ id: planningConversations.id });
    return rows.length > 0;
  }

  async releaseTurn(conversationId: string) {
    await this.dependencies.db
      .update(planningConversations)
      .set({ turnLockedAt: null })
      .where(eq(planningConversations.id, conversationId));
  }

  async findMessageByClientId(conversationId: string, clientMessageId: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningMessages)
      .where(
        and(
          eq(planningMessages.conversationId, conversationId),
          eq(planningMessages.clientMessageId, clientMessageId),
        ),
      );
    return row ? toMessage(row) : null;
  }

  async insertUserMessage(
    conversationId: string,
    input: {
      content: string;
      via: "text" | "voice";
      clientMessageId: string | null;
    },
  ) {
    const [row] = await this.dependencies.db
      .insert(planningMessages)
      .values({ conversationId, role: "user", ...input })
      .onConflictDoNothing({
        target: [
          planningMessages.conversationId,
          planningMessages.clientMessageId,
        ],
      })
      .returning();
    if (row) return { message: toMessage(row), created: true };
    const existing = input.clientMessageId
      ? await this.findMessageByClientId(conversationId, input.clientMessageId)
      : null;
    if (!existing)
      throw new Error("User message was neither stored nor found.");
    return { message: existing, created: false };
  }

  async findAssistantAfter(conversationId: string, messageId: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningMessages)
      .where(
        and(
          eq(planningMessages.conversationId, conversationId),
          eq(planningMessages.role, "assistant"),
          gt(planningMessages.id, BigInt(messageId)),
        ),
      )
      .orderBy(asc(planningMessages.id))
      .limit(1);
    return row ? toMessage(row) : null;
  }

  async listMessages(conversationId: string, options?: { limit?: number }) {
    const base = this.dependencies.db
      .select()
      .from(planningMessages)
      .where(eq(planningMessages.conversationId, conversationId));
    if (options?.limit) {
      const rows = await base
        .orderBy(desc(planningMessages.id))
        .limit(options.limit);
      return rows.reverse().map(toMessage);
    }
    return (await base.orderBy(asc(planningMessages.id))).map(toMessage);
  }

  async listMessageRange(
    conversationId: string,
    startMessageId: string,
    endMessageId: string,
  ) {
    const rows = await this.dependencies.db
      .select()
      .from(planningMessages)
      .where(
        and(
          eq(planningMessages.conversationId, conversationId),
          gte(planningMessages.id, BigInt(startMessageId)),
          lte(planningMessages.id, BigInt(endMessageId)),
        ),
      )
      .orderBy(asc(planningMessages.id));
    return rows.map(toMessage);
  }

  async commitTurn(input: CommitTurnInput): Promise<CommitTurnResult> {
    return this.dependencies.db.transaction(async (tx) => {
      if (input.applyDocument && input.mode === "generated") {
        const [conversation] = await tx
          .select()
          .from(planningConversations)
          .where(eq(planningConversations.id, input.conversationId));
        await tx.insert(projects).values({
          id: conversation.id,
          organizationId: conversation.organizationId,
          name: conversation.title,
        });
      }
      const change = input.applyDocument
        ? await input.applyDocument(docsOn(tx))
        : null;
      // The conversation takes its doc before the change source is written,
      // because the source row references the pair (conversation, doc).
      const [conversation] = await tx
        .update(planningConversations)
        .set({
          phase: input.phase,
          checklist: input.checklist,
          skillVersion: input.skillVersion,
          updatedAt: sql`now()`,
          ...(change
            ? {
                docId: sql`coalesce(${planningConversations.docId}, ${change.docId}::uuid)`,
              }
            : {}),
        })
        .where(eq(planningConversations.id, input.conversationId))
        .returning();
      const [assistant] = await tx
        .insert(planningMessages)
        .values({
          conversationId: input.conversationId,
          role: "assistant",
          content: input.reply,
          questions: input.questions,
        })
        .returning();
      if (change) {
        await this.insertSource(tx, {
          conversationId: input.conversationId,
          change,
          triggerMessageId: input.triggerMessageId,
          resultMessageId: assistant.id,
          mode: input.mode,
          revertedToChangeId: input.revertedToChangeId,
        });
      }
      return {
        assistant: toMessage(assistant),
        conversation: toConversation(conversation),
        change,
      };
    });
  }

  async commitRevert(input: CommitRevertInput): Promise<CommitRevertResult> {
    return this.dependencies.db.transaction(async (tx) => {
      const [user] = await tx
        .insert(planningMessages)
        .values({
          conversationId: input.conversationId,
          role: "user",
          content: input.requestText,
          via: "text",
        })
        .returning();
      const change = await input.applyDocument(docsOn(tx));
      const [conversation] = await tx
        .update(planningConversations)
        .set({ updatedAt: sql`now()` })
        .where(eq(planningConversations.id, input.conversationId))
        .returning();
      const [assistant] = await tx
        .insert(planningMessages)
        .values({
          conversationId: input.conversationId,
          role: "assistant",
          content: input.replyText,
          questions: [],
        })
        .returning();
      await this.insertSource(tx, {
        conversationId: input.conversationId,
        change,
        triggerMessageId: user.id,
        resultMessageId: assistant.id,
        mode: "reverted",
        revertedToChangeId: input.revertedToChangeId,
      });
      return {
        userMessage: toMessage(user),
        assistant: toMessage(assistant),
        change,
        conversation: toConversation(conversation),
      };
    });
  }

  async listChangeSources(conversationId: string) {
    const rows = await this.dependencies.db
      .select()
      .from(planningChangeSources)
      .where(eq(planningChangeSources.conversationId, conversationId))
      .orderBy(asc(planningChangeSources.changeId));
    return rows.map(toSource);
  }

  async findChangeSource(conversationId: string, changeId: string) {
    const [row] = await this.dependencies.db
      .select()
      .from(planningChangeSources)
      .where(
        and(
          eq(planningChangeSources.conversationId, conversationId),
          eq(planningChangeSources.changeId, BigInt(changeId)),
        ),
      );
    return row ? toSource(row) : null;
  }

  // The range starts after the previous surviving linked change and ends at the result message,
  // so one link covers the whole conversation segment that led to the change.
  private async insertSource(
    tx: Transaction,
    input: {
      conversationId: string;
      change: AppliedChange;
      triggerMessageId: string | bigint;
      resultMessageId: bigint;
      mode: "generated" | "edited" | "reverted";
      revertedToChangeId: string | null;
    },
  ) {
    const [previous] = await tx
      .select({ end: max(planningChangeSources.rangeEndMessageId) })
      .from(planningChangeSources)
      .where(eq(planningChangeSources.conversationId, input.conversationId));
    const previousEnd =
      previous?.end === null || previous?.end === undefined
        ? null
        : BigInt(String(previous.end));
    const [first] = await tx
      .select({ id: min(planningMessages.id) })
      .from(planningMessages)
      .where(
        and(
          eq(planningMessages.conversationId, input.conversationId),
          previousEnd === null
            ? undefined
            : gt(planningMessages.id, previousEnd),
        ),
      );
    const start =
      first?.id === null || first?.id === undefined
        ? input.resultMessageId
        : BigInt(String(first.id));
    await tx.insert(planningChangeSources).values({
      docId: input.change.docId,
      changeId: BigInt(input.change.changeId),
      conversationId: input.conversationId,
      triggerMessageId: BigInt(input.triggerMessageId),
      resultMessageId: input.resultMessageId,
      rangeStartMessageId: start,
      rangeEndMessageId: input.resultMessageId,
      mode: input.mode,
      revertedToChangeId: input.revertedToChangeId
        ? BigInt(input.revertedToChangeId)
        : null,
    });
  }
}
