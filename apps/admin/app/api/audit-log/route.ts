import { NextResponse } from 'next/server';

export async function GET() {
  // Mock audit log data
  return NextResponse.json([
    { event: 'proposal.created', id: 'p-1', user: '0x123...abc', timestamp: Date.now() - 3600000 },
    { event: 'vote.cast', id: 'p-1', user: '0xabc...123', timestamp: Date.now() - 1800000 }
  ]);
}
