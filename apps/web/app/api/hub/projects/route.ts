import { NextResponse } from 'next/server';

export async function GET() {
  // Mock project directory data
  return NextResponse.json([
    { id: '1', name: 'Pixel Art DAO', type: 'Creative', bountiesPaid: '$5,000', sentiment: 85 },
    { id: '2', name: 'Open Finance Labs', type: 'DeFi', bountiesPaid: '$12,500', sentiment: 92 }
  ]);
}
