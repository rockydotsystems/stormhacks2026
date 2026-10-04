import { WorkOS } from "@workos-inc/node";

export function getWorkOS() {
  return new WorkOS(process.env.WORKOS_API_KEY);
}
