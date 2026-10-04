ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "title" text;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_doc_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Doc identity, organization, and project are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
