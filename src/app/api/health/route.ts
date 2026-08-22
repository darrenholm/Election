import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check for the platform.
 *
 * Deliberately touches the database: a container that is up but cannot reach
 * Postgres is not healthy, and reporting it as such just moves the failure to
 * the first person who tries to sign in.
 */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "database unreachable" }, { status: 503 });
  }
}
