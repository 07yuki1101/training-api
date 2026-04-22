import { NextResponse } from "next/server";
import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const uid = searchParams.get("state");
  const appUrl = process.env.TANITA_APP_URL!;

  if (!code || !uid) {
    return NextResponse.redirect(`${appUrl}?tanita=error`);
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
      return NextResponse.redirect(`${appUrl}?tanita=error`);
    }

    await db.doc(`users/${uid}/tokens/tanita`).set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return NextResponse.redirect(`${appUrl}?tanita=connected`);
  } catch (err) {
    console.error("tanita callback error:", err);
    return NextResponse.redirect(`${appUrl}?tanita=error`);
  }
}
