import { NextResponse } from "next/server";

// 共通ヘッダー
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// GET
export async function GET() {
  return NextResponse.json(
    { message: "API OK" },
    { headers }
  );
}

// POST
export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("受け取った:", body);

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