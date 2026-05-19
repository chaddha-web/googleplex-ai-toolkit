import { NextResponse } from 'next/server';

export async function GET() {
  // Mock sybil detection metrics
  return NextResponse.json({
    totalFlagged: 12,
    recentAnomalies: [
      { id: '1', proposal: 'Prop #42', spike: 'High', timestamp: '2026-05-18T10:00:00Z' },
      { id: '2', proposal: 'Prop #45', spike: 'Medium', timestamp: '2026-05-18T09:30:00Z' }
    ]
  });
}
