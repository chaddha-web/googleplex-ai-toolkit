import { NextResponse } from 'next/server';

export async function GET() {
  // Mock protocol parameters
  return NextResponse.json([
    { key: 'governance.voting_period', value: '259200', description: 'Duration of voting in seconds (default 3d)' },
    { key: 'treasury.max_single_transfer', value: '5000000000000000000', description: 'Max GGX per single proposal (default 5)' }
  ]);
}
