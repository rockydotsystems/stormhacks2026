import { z } from "zod";
export const organizationIdSchema = z
  .string()
  .regex(/^org_[A-Za-z0-9]+$/, "Use a valid WorkOS organization ID.");
export type { OrganizationActor } from "@stormhacks/data";
export type {
  TeamAction,
  TeamData,
} from "@stormhacks/data/organizations/contracts";

const membershipId = z.string().regex(/^om_[A-Za-z0-9]+$/);
const invitationId = z.string().regex(/^invitation_[A-Za-z0-9]+$/);
export const teamActionSchema = z.intersection(
  z.object({ organizationId: organizationIdSchema }),
  z.discriminatedUnion("action", [
    z.object({
      action: z.literal("invite"),
      email: z.string().trim().pipe(z.email().max(254)),
    }),
    z.object({
      action: z.literal("role"),
      membershipId,
      role: z.enum(["admin", "member"]),
    }),
    z.object({ action: z.literal("remove"), membershipId }),
    z.object({ action: z.literal("resend"), invitationId }),
    z.object({ action: z.literal("revoke"), invitationId }),
  ]),
);
