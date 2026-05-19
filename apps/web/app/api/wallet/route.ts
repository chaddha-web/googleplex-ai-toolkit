import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ address: '0x1234567890abcdef1234567890abcdef12345678', chainId: '1' });
}
