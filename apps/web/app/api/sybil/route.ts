import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ risk: 'Low', sybilScore: 0.95 });
}
