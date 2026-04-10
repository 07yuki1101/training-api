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
// 共通ヘッダー
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET
export async function GET(req: Request) {
    try{
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get("userId");

        if (!userId) {
            return NextResponse.json(
              { success: false, message: "userId is required" },
              { status: 400, headers }
            );
          }
        const snapshot = await db
        .collection("users")
        .doc(userId)
        .collection("weights")
        .get();

        const data = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        return NextResponse.json(data,{headers});
    } catch (error) {
        console.error(error);
        return NextResponse.json(
            { success:false },
            { status: 500, headers }
        );
    }
}

// POST
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

    console.log("受け取った:", body);

    await db
    .collection("users")
    .doc(body.userId)
    .collection("weights")  
    .add({
        bw: body.weight,
        date: body.date,
        createdAt: new Date(),
    });

    return NextResponse.json(
      {
        success: true,
        body,
      },
      { headers } // ← ここが超重要🔥
    );

  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { success: false },
      { status: 500, headers }
    );
  }
}

// OPTIONS
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers,
  });
}

// DELETE
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
    await db
    .collection("users")
    .doc(body.userId)
    .collection("weights")
    .doc(body.id)
    .delete();
  
    return NextResponse.json(
      { success: true },
      { headers }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false },
      { status: 500, headers }
    );
  }
}