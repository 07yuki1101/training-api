import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "uid が必要です" }, { status: 400 });
  }

  const authUrl = new URL("https://www.healthplanet.jp/oauth/auth");
  authUrl.searchParams.set("client_id", process.env.TANITA_CLIENT_ID!);
  authUrl.searchParams.set("redirect_uri", process.env.TANITA_REDIRECT_URI!);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "innerscan");
  authUrl.searchParams.set("state", uid);

  return NextResponse.redirect(authUrl.toString());
}
