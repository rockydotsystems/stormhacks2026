import "server-only";
import { NextResponse } from "next/server";
import type { AuthService } from "@/features/auth/server/auth.service";
import { createNoteSchema } from "@/features/notes/contracts";
import type { NotesService } from "@/features/notes/server/notes.service";
import { ApiError } from "@/server/errors";

export class NotesController {
  constructor(
    private readonly dependencies: {
      authService: AuthService;
      notesService: NotesService;
    },
  ) {}

  async list() {
    const user = await this.dependencies.authService.requireUser();
    return NextResponse.json(
      await this.dependencies.notesService.list(user.id),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  async create(request: Request) {
    const user = await this.dependencies.authService.requireUser();
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    ) {
      throw new ApiError(415, "Content-Type must be application/json.");
    }
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "Request body must be valid JSON.");
    }
    const input = createNoteSchema.safeParse(body);
    if (!input.success) {
      throw new ApiError(400, "Note content must contain 1–2000 characters.");
    }
    const note = await this.dependencies.notesService.create(
      user.id,
      input.data,
    );
    return NextResponse.json(note, { status: 201 });
  }
}
