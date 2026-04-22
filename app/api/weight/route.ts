import { NextResponse } from "next/server";
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

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json(
        { success: false, message: "userId is required" },
        { status: 400, headers }
      );
    }

    const db = getDb();
    const snapshot = await db
      .collection("users")
      .doc(userId)
      .collection("weights")
      .get();

    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return NextResponse.json(data, { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500, headers });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, weight, date } = body;

    if (!userId || !weight || !date) {
      return NextResponse.json(
        { success: false, message: "missing fields" },
        { status: 400, headers }
      );
    }

    const db = getDb();
    await db.collection("users").doc(userId).collection("weights").add({
      bw: weight,
      date: date,
      createdAt: new Date(),
    });

    return NextResponse.json({ success: true, body }, { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500, headers });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 200, headers });
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json();
    const { userId, id } = body;

    if (!userId || !id) {
      return NextResponse.json(
        { success: false, message: "userId and id required" },
        { status: 400, headers }
      );
    }

    const db = getDb();
    await db.collection("users").doc(userId).collection("weights").doc(id).delete();

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false }, { status: 500, headers });
  }
}
