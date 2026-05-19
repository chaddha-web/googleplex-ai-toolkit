import { NextResponse } from 'next/server';

export async function GET() {
  // Mock activity feed data
  return NextResponse.json([
    { id: '1', action: 'New Proposal', details: 'Expand Governance to Tron', timestamp: Date.now() - 3600000 },
    { id: '2', action: 'Deploy', details: 'New site: pixel-art-dao.googolplex.app', timestamp: Date.now() - 7200000 }
  ]);
}
