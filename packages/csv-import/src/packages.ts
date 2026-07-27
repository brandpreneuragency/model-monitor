/**
 * Compound Package splitting.
 *
 * Most Package cells that contain " / " list several access routes and must be
 * split into an ordered list. A few product names embed a slash as branding and
 * must stay whole — those live in KNOWN_COMPOUND_PACKAGES.
 */

/**
 * Package values that contain " / " but name a single product / access route.
 *
 * Why each entry is here (do not split blindly):
 * - "ChatGPT Plus / Codex" — OpenAI's one Plus subscription that includes Codex;
 *   the slash is product branding, not a separator between two plans.
 */
export const KNOWN_COMPOUND_PACKAGES = ["ChatGPT Plus / Codex"] as const;

const KNOWN_COMPOUND_SET = new Set<string>(KNOWN_COMPOUND_PACKAGES);

/**
 * Split a Package cell into ordered access-route names.
 * Known compounds return a one-element list with the original string.
 */
export function splitPackageRoutes(packageName: string): string[] {
  const name = packageName.trim();
  if (name === "") return [];
  if (KNOWN_COMPOUND_SET.has(name)) {
    return [name];
  }
  if (!name.includes(" / ")) {
    return [name];
  }
  return name
    .split(" / ")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
