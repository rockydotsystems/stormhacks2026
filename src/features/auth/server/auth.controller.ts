import "server-only";
import { NextResponse } from "next/server";
import type { AuthService } from "@/features/auth/server/auth.service";

export class AuthController {
  constructor(private readonly dependencies: { authService: AuthService }) {}

  async session() {
    return NextResponse.json(await this.dependencies.authService.getSession(), {
      headers: { "Cache-Control": "no-store" },
    });
  }
}
