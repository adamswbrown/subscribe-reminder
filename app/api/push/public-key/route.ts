import { NextResponse } from "next/server";

export function GET() {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "push not configured" },
      { status: 503 }
    );
  }
  return NextResponse.json({ key });
}
