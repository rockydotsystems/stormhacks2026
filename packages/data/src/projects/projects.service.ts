import { and, asc, eq } from "drizzle-orm";
import type { OrganizationActor } from "../organizations/contracts";
import { requireOrganizationMember } from "../organizations/membership";
import {
  githubRepositorySchema,
  projectSchema,
  type CreateProject,
  type GithubRepositoryInput,
  type Project,
} from "./contracts";
import { requireProject } from "./access";
import { githubRepositories, projectRepositories, projects } from "./schema";
import type { Database, Page } from "../db";
import { ApiError } from "../errors";
import { githubInstallations, githubRepositoryAccess } from "../github/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export class ProjectsService {
  constructor(private readonly dependencies: { db: Database | Transaction }) {}

  async create(
    actor: OrganizationActor,
    input: CreateProject,
  ): Promise<Project> {
    const project = projectSchema.parse(input);
    await requireOrganizationMember(this.dependencies.db, actor);
    const [row] = await this.dependencies.db
      .insert(projects)
      .values({ organizationId: actor.organizationId, ...project })
      .returning();
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async list(actor: OrganizationActor, page?: Page): Promise<Project[]> {
    await requireOrganizationMember(this.dependencies.db, actor);
    const query = this.dependencies.db
      .select()
      .from(projects)
      .where(eq(projects.organizationId, actor.organizationId))
      .orderBy(asc(projects.createdAt), asc(projects.id));
    const rows = await (page
      ? query.limit(page.limit).offset(page.offset)
      : query);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async get(actor: OrganizationActor, projectId: string): Promise<Project> {
    const row = await requireProject(this.dependencies.db, actor, projectId);
    return { ...row, createdAt: row.createdAt.toISOString() };
  }

  async connectRepository(
    actor: OrganizationActor,
    input: GithubRepositoryInput,
  ) {
    const repository = githubRepositorySchema.parse(input);
    return this.dependencies.db.transaction(async (tx) => {
      await requireOrganizationMember(tx, actor);
      await tx
        .insert(githubRepositories)
        .values({ organizationId: actor.organizationId, ...repository })
        .onConflictDoNothing();
      const [row] = await tx
        .select()
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositories.organizationId, actor.organizationId),
            eq(githubRepositories.owner, repository.owner),
            eq(githubRepositories.name, repository.name),
          ),
        );
      return row;
    });
  }

  async listRepositories(actor: OrganizationActor) {
    await requireOrganizationMember(this.dependencies.db, actor);
    return this.dependencies.db
      .select()
      .from(githubRepositories)
      .where(eq(githubRepositories.organizationId, actor.organizationId))
      .orderBy(asc(githubRepositories.owner), asc(githubRepositories.name));
  }

  async listConnectedRepositories(actor: OrganizationActor) {
    await requireOrganizationMember(this.dependencies.db, actor);
    return this.dependencies.db
      .select({
        id: githubRepositories.id,
        owner: githubRepositories.owner,
        name: githubRepositories.name,
      })
      .from(githubRepositories)
      .innerJoin(
        githubRepositoryAccess,
        eq(githubRepositoryAccess.repositoryId, githubRepositories.id),
      )
      .innerJoin(
        githubInstallations,
        eq(githubInstallations.id, githubRepositoryAccess.installationId),
      )
      .where(
        and(
          eq(githubRepositories.organizationId, actor.organizationId),
          eq(githubRepositoryAccess.authorized, true),
          eq(githubRepositoryAccess.available, true),
          eq(githubInstallations.active, true),
        ),
      )
      .orderBy(asc(githubRepositories.owner), asc(githubRepositories.name));
  }

  async linkRepository(
    actor: OrganizationActor,
    projectId: string,
    repositoryId: string,
  ) {
    return this.dependencies.db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, true);
      const [repository] = await tx
        .select()
        .from(githubRepositories)
        .where(
          and(
            eq(githubRepositories.id, repositoryId),
            eq(githubRepositories.organizationId, actor.organizationId),
          ),
        );
      if (!repository) throw new ApiError(404, "Repository not found.");
      await tx
        .insert(projectRepositories)
        .values({
          organizationId: actor.organizationId,
          projectId,
          repositoryId,
        })
        .onConflictDoNothing();
    });
  }

  async unlinkRepository(
    actor: OrganizationActor,
    projectId: string,
    repositoryId: string,
  ) {
    return this.dependencies.db.transaction(async (tx) => {
      await requireProject(tx, actor, projectId, true);
      await tx
        .delete(projectRepositories)
        .where(
          and(
            eq(projectRepositories.projectId, projectId),
            eq(projectRepositories.repositoryId, repositoryId),
          ),
        );
    });
  }

  async listProjectRepositories(
    actor: OrganizationActor,
    projectId: string,
    page?: Page,
  ) {
    await requireProject(this.dependencies.db, actor, projectId);
    const query = this.dependencies.db
      .select({
        id: githubRepositories.id,
        organizationId: githubRepositories.organizationId,
        owner: githubRepositories.owner,
        name: githubRepositories.name,
      })
      .from(projectRepositories)
      .innerJoin(
        githubRepositories,
        eq(githubRepositories.id, projectRepositories.repositoryId),
      )
      .where(eq(projectRepositories.projectId, projectId))
      .orderBy(asc(githubRepositories.owner), asc(githubRepositories.name));
    return page ? query.limit(page.limit).offset(page.offset) : query;
  }
}
