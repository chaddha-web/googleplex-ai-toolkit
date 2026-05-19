import { NextResponse } from 'next/server';

export async function GET() {
  // Mock data for bounties
  return NextResponse.json([
    { id: '1', title: 'Implement SIWE logic', amount: '500 GGX', project: 'Auth Layer', tag: 'Backend' },
    { id: '2', title: 'Design Landing Hero', amount: '250 GGX', project: 'G-Plex Web', tag: 'Design' }
  ]);
}
