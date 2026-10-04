import "server-only";
import { NextResponse } from "next/server";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  dashboardActionSchema,
  documentActionSchema,
  type DashboardData,
} from "../contracts";
import { organizationIdSchema } from "@/features/organizations/contracts";
import { requireOrganizationMember } from "@/features/organizations/server/membership";
import {
  projectRepositories,
  githubRepositories,
} from "@/features/projects/server/schema";
import { docs, docChanges, docVersions } from "@/features/docs/server/schema";
import { ProjectsService } from "@/features/projects/server/projects.service";
import type { Dependencies } from "@/server/container";
import { ApiError } from "@/server/errors";

async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    throw new ApiError(415, "Content-Type must be application/json.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON.");
  }
  const input = schema.safeParse(body);
  if (!input.success)
    throw new ApiError(400, input.error.issues[0]?.message || "Invalid input.");
  return input.data;
}
function uuid(value: string | null) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success)
    throw new ApiError(400, "Use a valid organization or document ID.");
  return parsed.data;
}
function workosOrganizationId(value: string | null) {
  const parsed = organizationIdSchema.safeParse(value);
  if (!parsed.success)
    throw new ApiError(400, "Use a valid WorkOS organization ID.");
  return parsed.data;
}
const json = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export class DashboardController {
  constructor(
    private readonly dependencies: Pick<
      Dependencies,
      | "authService"
      | "organizationsService"
      | "db"
      | "projectsService"
      | "docsService"
    >,
  ) {}

  async list(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const { organizationsService, db, projectsService } = this.dependencies;
    const organizations = await organizationsService.list(user.id);
    const requested = new URL(request.url).searchParams.get("organizationId");
    const organizationId = requested ? workosOrganizationId(requested) : null;
    const result: DashboardData = {
      organizations,
      organizationId,
      projects: [],
      documents: [],
      repositories: [],
      people: {},
    };
    if (!organizationId) return json(result);
    const actor = { userId: user.id, organizationId };
    await requireOrganizationMember(db, actor);
    const [projectRows, repositoryRows, links, latest, first, versions] =
      await Promise.all([
        projectsService.list(actor),
        projectsService.listRepositories(actor),
        db
          .select({
            projectId: projectRepositories.projectId,
            owner: githubRepositories.owner,
            name: githubRepositories.name,
          })
          .from(projectRepositories)
          .innerJoin(
            githubRepositories,
            eq(projectRepositories.repositoryId, githubRepositories.id),
          )
          .where(eq(projectRepositories.organizationId, organizationId)),
        db
          .selectDistinctOn([docs.id], {
            id: docs.id,
            projectId: docs.projectId,
            title: sql<string>`coalesce(${docChanges.title}, 'Untitled document')`,
            description: sql<string>`coalesce(left(${docChanges.content}, 300), '')`,
            changeId: sql<string>`${docChanges.id}::text`,
            updated:
              sql`coalesce(${docChanges.createdAt}, ${docs.createdAt})`.mapWith(
                docs.createdAt,
              ),
          })
          .from(docs)
          .leftJoin(docChanges, eq(docs.id, docChanges.docId))
          .where(eq(docs.organizationId, organizationId))
          .orderBy(asc(docs.id), desc(docChanges.id)),
        db
          .selectDistinctOn([docs.id], {
            id: docs.id,
            creator: docChanges.createdBy,
          })
          .from(docs)
          .leftJoin(docChanges, eq(docs.id, docChanges.docId))
          .where(eq(docs.organizationId, organizationId))
          .orderBy(asc(docs.id), asc(docChanges.id)),
        db
          .selectDistinctOn([docs.id], {
            id: docs.id,
            changeId: sql<string>`${docVersions.changeId}::text`,
          })
          .from(docs)
          .innerJoin(docVersions, eq(docs.id, docVersions.docId))
          .where(eq(docs.organizationId, organizationId))
          .orderBy(asc(docs.id), desc(docVersions.number)),
      ]);
    result.projects = projectRows.map((project) => ({
      ...project,
      organization: organizationId,
      repositories: links
        .filter((link) => link.projectId === project.id)
        .map((link) => `${link.owner}/${link.name}`),
    }));
    result.repositories = repositoryRows;
    const creators = new Map(first.map((row) => [row.id, row.creator]));
    const boundaries = new Map(versions.map((row) => [row.id, row.changeId]));
    result.documents = latest.map((row) => ({
      id: row.id,
      project: row.projectId,
      title: row.title,
      description: row.description,
      creator: creators.get(row.id) || "unknown",
      reviewers: [],
      status: boundaries.get(row.id) === row.changeId ? "Bound" : "Draft",
      updated: row.updated.toISOString(),
      organization: organizationId,
    }));
    result.people.unknown = {
      name: "Team member",
      initials: "?",
      picture: null,
    };
    // Provider identities are resolved only for creators in this authorized organization.
    await Promise.all(
      [
        ...new Set(
          first
            .map((row) => row.creator)
            .filter((id): id is string => Boolean(id)),
        ),
      ].map(async (id) => {
        let identity = id === user.id ? user : null;
        if (!identity) {
          try {
            identity = await getWorkOS().userManagement.getUser(id);
          } catch {
            console.warn("Could not resolve a document creator.");
          }
        }
        const name = identity
          ? [identity.firstName, identity.lastName].filter(Boolean).join(" ") ||
            identity.email
          : "Team member";
        result.people[id] = {
          name,
          initials: name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join(""),
          picture: identity?.profilePictureUrl || null,
        };
      }),
    );
    return json(result);
  }

  async create(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    const input = await readBody(request, dashboardActionSchema);
    const { organizationsService, projectsService, docsService, db } =
      this.dependencies;
    if (input.action === "createOrganization")
      return json(await organizationsService.create(user.id, input.name), 201);
    const actor = { userId: user.id, organizationId: input.organizationId };
    if (input.action === "connectRepository")
      return json(await projectsService.connectRepository(actor, input), 201);
    if (input.action === "createDocument")
      return json(await docsService.create(actor, input.projectId, input), 201);
    // Project creation and all repository links either succeed together or roll back.
    const project = await db.transaction(async (tx) => {
      const service = new ProjectsService({ db: tx });
      const project = await service.create(actor, input);
      for (const id of new Set(input.repositoryIds))
        await service.linkRepository(actor, project.id, id);
      return project;
    });
    return json(project, 201);
  }

  async document(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    const docId = uuid(id);
    const actor = {
      userId: user.id,
      organizationId: workosOrganizationId(
        new URL(request.url).searchParams.get("organizationId"),
      ),
    };
    const { docsService } = this.dependencies;
    const [changes, versions] = await Promise.all([
      docsService.listChanges(actor, docId),
      docsService.listVersions(actor, docId),
    ]);
    return json({ changes, versions });
  }

  async updateDocument(request: Request, id: string) {
    const user = await this.dependencies.authService.requireUser();
    const docId = uuid(id);
    const input = await readBody(request, documentActionSchema);
    const actor = { userId: user.id, organizationId: input.organizationId };
    const service = this.dependencies.docsService;
    return json(
      input.action === "save"
        ? await service.addChange(actor, docId, input)
        : await service.publish(actor, docId, input.changeId),
      201,
    );
  }
}
