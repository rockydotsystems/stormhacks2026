import "server-only";
import { asClass, asFunction, createContainer, InjectionMode } from "awilix";
import { AuthController } from "@/features/auth/server/auth.controller";
import { AuthService } from "@/features/auth/server/auth.service";
import { DocsService } from "@/features/docs/server/docs.service";
import { OrganizationsService } from "@/features/organizations/server/organizations.service";
import { ProjectsService } from "@/features/projects/server/projects.service";
import { NotesController } from "@/features/notes/server/notes.controller";
import { NotesService } from "@/features/notes/server/notes.service";
import { createDatabase, type Database } from "@/server/db";

export type Dependencies = {
  db: Database;
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
  db: asFunction(createDatabase)
    .scoped()
    .disposer((db) => db.$client.end({ timeout: 1 })),
  authService: asClass(AuthService).scoped(),
  authController: asClass(AuthController).scoped(),
  notesService: asClass(NotesService).scoped(),
  notesController: asClass(NotesController).scoped(),
  docsService: asClass(DocsService).scoped(),
  organizationsService: asClass(OrganizationsService).scoped(),
  projectsService: asClass(ProjectsService).scoped(),
});
