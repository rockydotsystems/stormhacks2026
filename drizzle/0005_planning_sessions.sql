CREATE TABLE "personal_workspaces" (
	"user_id" text PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "personal_workspaces_organization_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "planning_change_sources" (
	"doc_id" uuid NOT NULL,
	"change_id" bigint NOT NULL,
	"conversation_id" uuid NOT NULL,
	"trigger_message_id" bigint NOT NULL,
	"result_message_id" bigint NOT NULL,
	"range_start_message_id" bigint NOT NULL,
	"range_end_message_id" bigint NOT NULL,
	"mode" text NOT NULL,
	"reverted_to_change_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_change_sources_doc_change_unique" UNIQUE("doc_id","change_id"),
	CONSTRAINT "planning_change_sources_mode_check" CHECK ("planning_change_sources"."mode" in ('generated', 'edited', 'reverted')),
	CONSTRAINT "planning_change_sources_revert_check" CHECK (("planning_change_sources"."mode" = 'reverted') = ("planning_change_sources"."reverted_to_change_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "planning_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"doc_id" uuid,
	"title" text NOT NULL,
	"phase" text DEFAULT 'grilling' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_version" text,
	"turn_locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_conversations_doc_unique" UNIQUE("doc_id"),
	CONSTRAINT "planning_conversations_id_doc_unique" UNIQUE("id","doc_id"),
	CONSTRAINT "planning_conversations_phase_check" CHECK ("planning_conversations"."phase" in ('grilling', 'awaiting-confirmation', 'generated'))
);
--> statement-breakpoint
CREATE TABLE "planning_messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "planning_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"via" text DEFAULT 'text' NOT NULL,
	"questions" jsonb,
	"client_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_messages_client_message_unique" UNIQUE("conversation_id","client_message_id"),
	CONSTRAINT "planning_messages_role_check" CHECK ("planning_messages"."role" in ('user', 'assistant')),
	CONSTRAINT "planning_messages_via_check" CHECK ("planning_messages"."via" in ('text', 'voice'))
);
--> statement-breakpoint
ALTER TABLE "personal_workspaces" ADD CONSTRAINT "personal_workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_workspaces" ADD CONSTRAINT "personal_workspaces_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_change_fk" FOREIGN KEY ("doc_id","change_id") REFERENCES "public"."doc_changes"("doc_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_conversation_fk" FOREIGN KEY ("conversation_id","doc_id") REFERENCES "public"."planning_conversations"("id","doc_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_trigger_fk" FOREIGN KEY ("trigger_message_id") REFERENCES "public"."planning_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_result_fk" FOREIGN KEY ("result_message_id") REFERENCES "public"."planning_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_range_start_fk" FOREIGN KEY ("range_start_message_id") REFERENCES "public"."planning_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_change_sources" ADD CONSTRAINT "planning_change_sources_range_end_fk" FOREIGN KEY ("range_end_message_id") REFERENCES "public"."planning_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD CONSTRAINT "planning_conversations_member_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_members"("organization_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_conversations" ADD CONSTRAINT "planning_conversations_doc_fk" FOREIGN KEY ("organization_id","doc_id") REFERENCES "public"."docs"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_messages" ADD CONSTRAINT "planning_messages_conversation_id_planning_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."planning_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_change_sources_conversation_idx" ON "planning_change_sources" USING btree ("conversation_id","change_id");--> statement-breakpoint
CREATE INDEX "planning_conversations_user_updated_idx" ON "planning_conversations" USING btree ("user_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "planning_messages_conversation_idx" ON "planning_messages" USING btree ("conversation_id","id");