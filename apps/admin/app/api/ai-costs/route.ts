import { NextResponse } from 'next/server';

export async function GET() {
  // Mock model cost metrics
  return NextResponse.json([
    { model: 'Claude 3.5 Sonnet', dailySpend: '$12.50', cap: '$50.00' },
    { model: 'GPT-4o', dailySpend: '$8.20', cap: '$40.00' }
  ]);
}
