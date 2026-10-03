import "server-only";
import { asClass, asFunction, createContainer, InjectionMode } from "awilix";
import { AuthController } from "@/features/auth/server/auth.controller";
import { AuthService } from "@/features/auth/server/auth.service";
import { NotesController } from "@/features/notes/server/notes.controller";
import { NotesService } from "@/features/notes/server/notes.service";
import { createDatabase, type Database } from "@/server/db";

export type Dependencies = {
  db: Database;
  authService: AuthService;
  authController: AuthController;
  notesService: NotesService;
  notesController: NotesController;
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
});
