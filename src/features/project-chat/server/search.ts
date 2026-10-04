import "server-only";
import { sql } from "drizzle-orm";
import type { OrganizationActor } from "@/features/organizations/contracts";
import type { Database } from "@/server/db";
import type { SearchEvidence } from "./answer";

type SearchRow = {
  documentId: string;
  changeId: string;
  title: string;
  content: string;
  previousContent: string | null;
  rationale: string | null;
  version: number | null;
  createdAt: Date;
  isCurrent: boolean;
};

// Scope before ranking: other projects, deleted documents, and private chats never enter retrieval.
export async function searchProjectHistory(
  db: Database,
  actor: OrganizationActor,
  projectId: string,
  terms: string[],
): Promise<SearchEvidence[]> {
  const query = terms
    .map((term) => `"${term.replaceAll('"', " ")}"`)
    .join(" OR ");
  const rows = await db.execute<SearchRow>(sql`
    with history as (
      select d.id as "documentId", c.id::text as "changeId", c.title,
        c.content, lag(c.content) over (partition by d.id order by c.id) as "previousContent",
        row_number() over (partition by d.id order by c.id desc) = 1 as "isCurrent",
        c.created_at as "createdAt", v.number as version,
        (select string_agg(m.role || ': ' || m.content, E'\n' order by m.id)
          from planning_change_sources s
          join planning_messages m on m.conversation_id = s.conversation_id
            and m.id between s.range_start_message_id and s.range_end_message_id
          where s.doc_id = d.id and s.change_id = c.id) as rationale
      from docs d join doc_changes c on c.doc_id = d.id
      left join doc_versions v on v.doc_id = d.id and v.change_id = c.id
      where d.organization_id = ${actor.organizationId} and d.project_id = ${projectId}
        and d.deleted_at is null
    ), ranked as (
      select *, to_tsvector('english', title || ' ' || content || ' ' || coalesce(rationale, '')) as vector
      from history
    ), matches as (
      select * from ranked
      where (${query} = '' and "isCurrent")
        or (${query} <> '' and vector @@ websearch_to_tsquery('english', ${query}))
      order by ts_rank_cd(vector, websearch_to_tsquery('english', ${query})) desc, "createdAt" desc
      limit 6
    ), selected as (
      select * from matches
      union
      select * from ranked where "isCurrent" and "documentId" in (select "documentId" from matches)
    )
    select "documentId", "changeId", title,
      case when ${query} = '' then left(content, 6000) else
        ts_headline('english', content, websearch_to_tsquery('english', ${query}),
          'StartSel=, StopSel=, MaxFragments=3, MaxWords=150, MinWords=40') end as content,
      case when ${query} = '' then left("previousContent", 6000) else
        ts_headline('english', "previousContent", websearch_to_tsquery('english', ${query}),
          'StartSel=, StopSel=, MaxFragments=3, MaxWords=150, MinWords=40') end as "previousContent",
      case when ${query} = '' then left(rationale, 6000) else
        ts_headline('english', rationale, websearch_to_tsquery('english', ${query}),
          'StartSel=, StopSel=, MaxFragments=3, MaxWords=150, MinWords=40') end as rationale,
      version, "createdAt", "isCurrent"
    from selected
    order by "createdAt" desc, "changeId"::bigint desc
  `);
  return rows.map((row, index) => ({
    ...row,
    id: String(index + 1),
    createdAt: new Date(row.createdAt).toISOString(),
    href: `/documents/${row.documentId}?change=${row.changeId}`,
  }));
}
