import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([
    { id: '1', author: 'User A', text: 'Great proposal!' },
    { id: '2', author: 'User B', text: 'Needs more detail on treasury.' },
  ]);
}
