import { NextResponse } from "next/server";
import admin from "firebase-admin";

export const dynamic = "force-dynamic";
export const preferredRegion = ["hnd1"];

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

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getValidAccessToken(uid: string): Promise<string> {
  const db = getDb();
  const tokenRef = db.doc(`users/${uid}/tokens/tanita`);
  const snap = await tokenRef.get();
  if (!snap.exists) throw new Error("未連携");

  const { accessToken, refreshToken, expiresAt } = snap.data()!;

  if (expiresAt && Date.now() < expiresAt - 5 * 60 * 1000) {
    return accessToken;
  }

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
    const db = getDb();

    const to = new Date();
    const from = new Date(to);
    from.setFullYear(from.getFullYear() - 1);
    const fmt = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}0000`;

    const params = new URLSearchParams({
      date: "1",
      from: fmt(from),
      to: fmt(to),
      tag: "6021,6022",
    });

    const dataRes = await fetch(
      `https://www.healthplanet.jp/status/innerscan.json?${params}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const rawText = await dataRes.text().catch(() => "");
    console.log("HP status:", dataRes.status, "ct:", dataRes.headers.get("content-type"));
    console.log("HP body:", rawText.slice(0, 300));

    if (!dataRes.ok || rawText.trimStart().startsWith("<")) {
      throw new Error(`HealthPlanet API error (${dataRes.status}): 再連携してください`);
    }

    const json = JSON.parse(rawText);
    const data = json.data;

    if (!data?.length) {
      return NextResponse.json({ synced: 0 }, { headers });
    }

    const weightsRef = db.collection(`users/${uid}/weights`);
    const existingSnap = await weightsRef.get();
    const existingDates = new Set(existingSnap.docs.map((d) => d.data().date));

    const batch = db.batch();
    let count = 0;

    for (const item of data) {
      const raw: string = item.date;
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
