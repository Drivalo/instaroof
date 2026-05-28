import { cookies } from "next/headers";

const COOKIE_NAME = "instaroof_admin";

export async function isAdminAuthenticated() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  return token && token === process.env.ADMIN_PASSWORD;
}

export async function setAdminCookie(value: string) {
  const store = await cookies();
  store.set(COOKIE_NAME, value, { httpOnly: true, sameSite: "lax", secure: false, path: "/" });
}

export async function clearAdminCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
