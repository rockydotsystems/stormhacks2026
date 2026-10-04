import { z } from "zod";

const itemKey = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  .max(60);
const text = (max: number) => z.string().trim().min(1).max(max);

export const planChildSchema = z.object({
  key: itemKey,
  title: text(200),
  description: z.string().trim().max(8000),
});

export const planItemSchema = planChildSchema.extend({
  kind: z.enum(["decision", "requirement"]),
  children: z.array(planChildSchema).max(25),
});

/** What the model extracts from a published document. Persisted so a retry never re-extracts. */
export const syncPlanSchema = z
  .object({
    summary: z.string().trim().max(2000),
    items: z.array(planItemSchema).min(1).max(60),
  })
  .superRefine((plan, context) => {
    const seen = new Set<string>();
    for (const item of plan.items)
      for (const { key } of [item, ...item.children]) {
        if (seen.has(key))
          context.addIssue({
            code: "custom",
            message: `Duplicate key ${key}.`,
          });
        seen.add(key);
      }
  });

export type SyncPlan = z.infer<typeof syncPlanSchema>;

export const syncStatuses = ["running", "failed", "completed"] as const;
export type SyncStatus = (typeof syncStatuses)[number];

export const linearSyncRequestSchema = z.object({
  /** Required the first time a project syncs, to choose its Linear team. */
  teamId: z.string().trim().min(1).max(100).optional(),
});
