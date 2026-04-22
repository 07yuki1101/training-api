import { NextRequest, NextResponse } from "next/server";
import admin from "firebase-admin";

export const dynamic = "force-dynamic";

function getDb() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return admin.firestore();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const uid = req.cookies.get("tanita_uid")?.value;
  const appUrl = process.env.TANITA_APP_URL!;

  if (!code || !uid) {
    console.error("missing_params: code=", code, "uid=", uid);
    return NextResponse.redirect(`${appUrl}?tanita=error&reason=missing_params`);
  }

  try {
    const tokenRes = await fetch("https://www.healthplanet.jp/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.TANITA_CLIENT_ID!,
        client_secret: process.env.TANITA_CLIENT_SECRET!,
        redirect_uri: process.env.TANITA_REDIRECT_URI!,
        code,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error("token exchange failed:", JSON.stringify(tokenData));
      const reason = encodeURIComponent(tokenData.error_description ?? tokenData.error ?? "token_failed");
      return NextResponse.redirect(`${appUrl}?tanita=error&reason=${reason}`);
    }

    const db = getDb();
    await db.doc(`users/${uid}/tokens/tanita`).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const response = NextResponse.redirect(`${appUrl}?tanita=connected`);
    response.cookies.delete("tanita_uid");
    return response;
  } catch (err) {
    console.error("tanita callback error:", err);
    const reason = encodeURIComponent((err as Error).message ?? "unknown");
    return NextResponse.redirect(`${appUrl}?tanita=error&reason=${reason}`);
  }
}
