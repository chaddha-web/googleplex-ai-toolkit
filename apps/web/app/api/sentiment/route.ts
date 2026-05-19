import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ upvotes: 120, downvotes: 5 });
}
