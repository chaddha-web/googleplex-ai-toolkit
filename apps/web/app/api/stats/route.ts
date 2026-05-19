import { NextResponse } from 'next/server';

export async function GET() {
  // Mock platform stats
  return NextResponse.json({
    tvl: '$2.5M',
    activeProjects: '42',
    proposalsVoted: '128'
  });
}
