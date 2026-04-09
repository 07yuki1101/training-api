import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "API OK" });
}

export async function POST(req: Request) {
    try {
      const body = await req.json();
  
      console.log("受け取った:", body);
  
      return NextResponse.json({
        success: true,
        body,
      });
    } catch (error) {
      console.error(error);
  
      return NextResponse.json(
        { success: false },
        { status: 500 }
      );
    }
  }