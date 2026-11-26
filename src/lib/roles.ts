/** Fixed role ↔ email binding (server-enforced). */
export const ROLE_EMAILS: Record<"A" | "B", string> = {
  A: "dadamirzayev@gmail.com",
  B: "nanokam2121@gmail.com",
};

export function emailForRole(role: "A" | "B"): string {
  return ROLE_EMAILS[role];
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function emailMatchesRole(role: "A" | "B", email: string): boolean {
  return normalizeEmail(email) === ROLE_EMAILS[role];
}

export function emailHint(role: "A" | "B"): string {
  const e = ROLE_EMAILS[role];
  const [user, domain] = e.split("@");
  if (!user || !domain) return "***";
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}***@${domain}`;
}
