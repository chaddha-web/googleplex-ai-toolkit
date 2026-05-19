import { NextResponse } from 'next/server';

export async function GET() {
  // Mock treasury data
  return NextResponse.json([
    { chain: 'Ethereum', address: '0x123...abc', balance: '1,200 ETH' },
    { chain: 'Tron', address: 'TAbc...123', balance: '4,500,000 GGX' }
  ]);
}
