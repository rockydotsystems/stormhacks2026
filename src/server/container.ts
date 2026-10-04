import "server-only";
import { asClass, asFunction, createContainer, InjectionMode } from "awilix";
import { DashboardController } from "@/features/dashboard/server/dashboard.controller";
import { AuthController } from "@/features/auth/server/auth.controller";
import { AuthService } from "@/features/auth/server/auth.service";
import { DocsService } from "@/features/docs/server/docs.service";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { ProjectsService } from "@/features/projects/server/projects.service";
import { NotesController } from "@/features/notes/server/notes.controller";
import { NotesService } from "@/features/notes/server/notes.service";
import type { ModelPort } from "@/features/planning/server/model";
import { createModel } from "@/features/planning/server/model.factory";
import { PlanningController } from "@/features/planning/server/planning.controller";
import { PlanningSessionController } from "@/features/planning/server/planning-session.controller";
import { PlanningService } from "@/features/planning/server/planning.service";
import { DrizzlePlanningSessionStore } from "@/features/planning/server/planning-session.store";
import { PlanningSessionService } from "@/features/planning/server/planning-session.service";
import type { PlanningSessionStore } from "@/features/planning/server/planning-session.types";
import { WorkspaceContext } from "@/features/planning/server/workspace-context";
import type { SpeechPort } from "@/features/planning/server/speech";
import { createSpeech } from "@/features/planning/server/speech.factory";
import { createDatabase, type Database } from "@/server/db";

export type Dependencies = {
  dashboardController: DashboardController;
  db: Database;
  model: ModelPort;
  speech: SpeechPort;
  planningService: PlanningService;
  planningController: PlanningController;
  planningSessionStore: PlanningSessionStore;
  workspaceContext: WorkspaceContext;
  planningSessionService: PlanningSessionService;
  planningSessionController: PlanningSessionController;
  authService: AuthService;
  authController: AuthController;
  notesService: NotesService;
  notesController: NotesController;
  docsService: DocsService;
  organizationsService: OrganizationsService;
  projectsService: ProjectsService;
};

export const container = createContainer<Dependencies>({
  injectionMode: InjectionMode.PROXY,
  strict: true,
});

container.register({
  dashboardController: asClass(DashboardController).scoped(),
  db: asFunction(createDatabase)
    .scoped()
    .disposer((db) => db.$client.end({ timeout: 1 })),
  // Stateless provider adapters. They hold no request identity, so one instance serves all requests.
  model: asFunction(() => createModel()).singleton(),
  speech: asFunction(() => createSpeech()).singleton(),
  planningService: asClass(PlanningService).scoped(),
  planningController: asClass(PlanningController).scoped(),
  planningSessionStore: asClass(DrizzlePlanningSessionStore).scoped(),
  workspaceContext: asClass(WorkspaceContext).scoped(),
  planningSessionService: asClass(PlanningSessionService).scoped(),
  planningSessionController: asClass(PlanningSessionController).scoped(),
  authService: asClass(AuthService).scoped(),
  authController: asClass(AuthController).scoped(),
  notesService: asClass(NotesService).scoped(),
  notesController: asClass(NotesController).scoped(),
  docsService: asClass(DocsService).scoped(),
  organizationsService: asClass(OrganizationsService).scoped(),
  projectsService: asClass(ProjectsService).scoped(),
});
