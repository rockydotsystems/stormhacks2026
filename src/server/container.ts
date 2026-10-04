import "server-only";
import { ProjectChatService } from "@/features/project-chat/server/project-chat.service";
import { ProjectChatController } from "@/features/project-chat/server/project-chat.controller";
import { asClass, asFunction, createContainer, InjectionMode } from "awilix";
import { DashboardController } from "@/features/dashboard/server/dashboard.controller";
import { AuthController } from "@/features/auth/server/auth.controller";
import { AuthService } from "@/features/auth/server/auth.service";
import { GitHubService } from "@/features/github/server/github.service";
import { GitHubController } from "@/features/github/server/github.controller";
import { DocsService } from "@/features/docs/server/docs.service";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { TeamService } from "@stormhacks/data/organizations/team.service";
import { TeamController } from "@/features/organizations/server/team.controller";
import { ProjectsService } from "@/features/projects/server/projects.service";
import { NotesController } from "@/features/notes/server/notes.controller";
import { NotesService } from "@/features/notes/server/notes.service";
import { createJev } from "@/features/planning/server/jev";
import type { JevPort } from "@/features/planning/server/jev";
import type { ModelPort } from "@/features/planning/server/model";
import { createModel } from "@/features/planning/server/model.factory";
import { PlanningController } from "@/features/planning/server/planning.controller";
import { PlanningSessionController } from "@/features/planning/server/planning-session.controller";
import { PlanningService } from "@/features/planning/server/planning.service";
import { DrizzlePlanningSessionStore } from "@/features/planning/server/planning-session.store";
import { PlanningSessionService } from "@/features/planning/server/planning-session.service";
import type { PlanningSessionStore } from "@/features/planning/server/planning-session.types";
import { WorkspaceContext } from "@/features/planning/server/workspace-context";
import {
  WorkOsUserDirectory,
  type UserDirectory,
} from "@/features/planning/server/user-directory";
import {
  DurableObjectRealtime,
  type RealtimePort,
} from "@/features/planning/server/realtime";
import type { SpeechPort } from "@/features/planning/server/speech";
import { createSpeech } from "@/features/planning/server/speech.factory";
import { createDatabase, type Database } from "@/server/db";

export type Dependencies = {
  projectChatService: ProjectChatService;
  projectChatController: ProjectChatController;
  githubService: GitHubService;
  githubController: GitHubController;
  dashboardController: DashboardController;
  db: Database;
  model: ModelPort;
  speech: SpeechPort;
  jev: JevPort;
  planningService: PlanningService;
  planningController: PlanningController;
  planningSessionStore: PlanningSessionStore;
  workspaceContext: WorkspaceContext;
  userDirectory: UserDirectory;
  realtime: RealtimePort;
  planningSessionService: PlanningSessionService;
  planningSessionController: PlanningSessionController;
  authService: AuthService;
  authController: AuthController;
  notesService: NotesService;
  notesController: NotesController;
  docsService: DocsService;
  organizationsService: OrganizationsService;
  teamService: TeamService;
  teamController: TeamController;
  projectsService: ProjectsService;
};

export const container = createContainer<Dependencies>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

container.register({
  projectChatService: asClass(ProjectChatService).scoped(),
  projectChatController: asClass(ProjectChatController).scoped(),
  githubService: asClass(GitHubService).scoped(),
  githubController: asClass(GitHubController).scoped(),
  dashboardController: asClass(DashboardController).scoped(),
  db: asFunction(createDatabase)
    .scoped()
    .disposer((db) => db.$client.end({ timeout: 1 })),
  // Stateless provider adapters. They hold no request identity, so one instance serves all requests.
  model: asFunction(() => createModel()).singleton(),
  speech: asFunction(() => createSpeech()).singleton(),
  jev: asFunction(() => createJev()).singleton(),
  planningService: asClass(PlanningService).scoped(),
  planningController: asClass(PlanningController).scoped(),
  planningSessionStore: asClass(DrizzlePlanningSessionStore).scoped(),
  workspaceContext: asClass(WorkspaceContext).scoped(),
  userDirectory: asClass(WorkOsUserDirectory).scoped(),
  realtime: asClass(DurableObjectRealtime).scoped(),
  planningSessionService: asClass(PlanningSessionService).scoped(),
  planningSessionController: asClass(PlanningSessionController).scoped(),
  authService: asClass(AuthService).scoped(),
  authController: asClass(AuthController).scoped(),
  notesService: asClass(NotesService).scoped(),
  notesController: asClass(NotesController).scoped(),
  docsService: asClass(DocsService).scoped(),
  organizationsService: asClass(OrganizationsService).scoped(),
  teamService: asClass(TeamService).scoped(),
  teamController: asClass(TeamController).scoped(),
  projectsService: asClass(ProjectsService).scoped(),
});
