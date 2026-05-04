export const SESSION_MAX_AGE_SECONDS = Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS || "") > 0
  ? Number(process.env.AUTH_SESSION_MAX_AGE_SECONDS)
  : 60 * 60 * 24 * 7;

export const SESSION_UPDATE_AGE_SECONDS = Number(process.env.AUTH_SESSION_UPDATE_AGE_SECONDS || "") > 0
  ? Number(process.env.AUTH_SESSION_UPDATE_AGE_SECONDS)
  : 60 * 60 * 12;

export const USE_SECURE_AUTH_COOKIES = (process.env.NEXTAUTH_URL || "").startsWith("https://");
export const SESSION_COOKIE_NAME = `${USE_SECURE_AUTH_COOKIES ? "__Secure-" : ""}next-auth.session-token`;
export const ALTERNATE_SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export function getSessionExpires() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
}

export function readSessionTokenFromCookieStore(
  cookies: { get(name: string): { value: string } | undefined },
) {
  return (
    cookies.get(SESSION_COOKIE_NAME)?.value ||
    ALTERNATE_SESSION_COOKIE_NAMES.map((name) => cookies.get(name)?.value).find(Boolean) ||
    ""
  );
}
