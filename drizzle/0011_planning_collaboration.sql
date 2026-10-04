CREATE TABLE "planning_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD COLUMN "mode" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD COLUMN "standby_since_message_id" bigint;--> statement-breakpoint
ALTER TABLE "planning_messages" ADD COLUMN "author_user_id" text;--> statement-breakpoint
ALTER TABLE "planning_messages" ADD COLUMN "kind" text DEFAULT 'chat' NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_conversation_id_planning_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."planning_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_participants" ADD CONSTRAINT "planning_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_participants_user_idx" ON "planning_participants" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Existing user messages were written by the conversation owner. The owner is always a participant.
-- The empty display name is a placeholder the service replaces the next time the owner opens the conversation.
UPDATE "planning_messages" AS m SET "author_user_id" = c."user_id" FROM "planning_conversations" AS c WHERE m."conversation_id" = c."id" AND m."role" = 'user' AND m."author_user_id" IS NULL;--> statement-breakpoint
INSERT INTO "planning_participants" ("conversation_id", "user_id", "display_name") SELECT "id", "user_id", '' FROM "planning_conversations" ON CONFLICT DO NOTHING;--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD CONSTRAINT "planning_conversations_mode_check" CHECK ("planning_conversations"."mode" in ('active', 'standby'));--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD CONSTRAINT "planning_conversations_standby_check" CHECK (("planning_conversations"."mode" = 'standby') = ("planning_conversations"."standby_since_message_id" is not null));--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_author_check" CHECK (("planning_messages"."role" = 'assistant') = ("planning_messages"."author_user_id" is null));--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_kind_check" CHECK ("planning_messages"."kind" in ('chat', 'standby-start', 'standby-end'));