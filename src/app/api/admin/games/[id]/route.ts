import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

function authOK(req: NextRequest) {
  const token = req.headers.get("x-admin-token");
  return token && token === process.env.ADMIN_TOKEN;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string }}) {
  if (!authOK(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json();
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("games").update(body).eq("id", params.id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
