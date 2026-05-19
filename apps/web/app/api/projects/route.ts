import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json([
    { id: '1', name: 'DeFi Swap App', status: 'In Progress' },
    { id: '2', name: 'DAO Dashboard', status: 'Planning' },
  ]);
}
