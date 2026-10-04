import { z } from "zod";
export const organizationIdSchema = z
  .string()
  .regex(/^org_[A-Za-z0-9]+$/, "Use a valid WorkOS organization ID.");
export type { OrganizationActor } from "@stormhacks/data";
