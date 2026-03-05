import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session-user";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getSessionUser();

    return NextResponse.json(
      { userId: user?.id ?? null },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Failed to load codes session", error);
    return NextResponse.json(
      { userId: null },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } }
    );
  }
}
