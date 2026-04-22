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

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getValidAccessToken(uid: string): Promise<string> {
  const tokenRef = db.doc(`users/${uid}/tokens/tanita`);
  const snap = await tokenRef.get();
  if (!snap.exists) throw new Error("未連携");

  const { accessToken, refreshToken, expiresAt } = snap.data()!;

  // 期限まで5分以上あればそのまま使う
  if (expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) {
    return accessToken;
  }

  // トークンリフレッシュ
  const res = await fetch("https://www.healthplanet.jp/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.TANITA_CLIENT_ID!,
      client_secret: process.env.TANITA_CLIENT_SECRET!,
      redirect_uri: process.env.TANITA_REDIRECT_URI!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("トークンリフレッシュ失敗");

  await tokenRef.update({
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get("uid");

  if (!uid) {
    return NextResponse.json({ error: "uid が必要です" }, { status: 400, headers });
  }

  try {
    const accessToken = await getValidAccessToken(uid);

    // 過去1年分を取得
    const to = new Date();
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 1);
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}0000`;

    const apiUrl = new URL("https://www.healthplanet.jp/status/innerscan.json");
    apiUrl.searchParams.set("access_token", accessToken);
    apiUrl.searchParams.set("date", "1"); // 測定日基準
    apiUrl.searchParams.set("from", fmt(from));
    apiUrl.searchParams.set("to", fmt(to));
    apiUrl.searchParams.set("tag", "6021"); // 体重

    const dataRes = await fetch(apiUrl.toString());
    const { data } = await dataRes.json();

    if (!data?.length) {
      return NextResponse.json({ synced: 0 }, { headers });
    }

    // 既存日付を取得して重複スキップ
    const weightsRef = db.collection(`users/${uid}/weights`);
    const existingSnap = await weightsRef.get();
    const existingDates = new Set(existingSnap.docs.map((d) => d.data().date));

    const batch = db.batch();
    let count = 0;

    for (const item of data) {
      // "20240101120000" → "2024-01-01"
      const raw = item.date as string;
      const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
      const bw = parseFloat(item.keydata);

      if (!existingDates.has(date) && !isNaN(bw)) {
        batch.set(weightsRef.doc(), {
          date,
          bw,
          source: "tanita",
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;
      }
    }

    if (count > 0) await batch.commit();
    return NextResponse.json({ synced: count }, { headers });
  } catch (err) {
    console.error("tanita sync error:", err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500, headers });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers });
}
