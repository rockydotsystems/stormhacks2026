CREATE TABLE "planning_summaries" (
	"conversation_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "planning_summaries_conversation_id_scope_pk" PRIMARY KEY("conversation_id","scope")
);
--> statement-breakpoint
ALTER TABLE "planning_summaries" ADD CONSTRAINT "planning_summaries_conversation_id_planning_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."planning_conversations"("id") ON DELETE cascade ON UPDATE no action;