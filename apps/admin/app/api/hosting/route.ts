import { NextResponse } from 'next/server';

export async function GET() {
  // Mock hosting deployments
  return NextResponse.json([
    { name: 'pixel-art-dao', url: 'pixel-art-dao.googolplex.app', status: 'active' },
    { name: 'illegal-gambling', url: 'bet-now.googolplex.app', status: 'quarantined' }
  ]);
}
