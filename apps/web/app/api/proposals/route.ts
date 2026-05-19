import { NextResponse } from 'next/server';
import { createGovernanceClient } from '@googolplex/dao-actions';

export async function GET() {
  // Return mock proposal data for MVP preview
  return NextResponse.json([
    { id: '1', title: 'Expand Governance to Tron', lane: 'governance', status: 'active', snapshotBlock: 123456 },
    { id: '2', title: 'Increase Bounty Pool', lane: 'treasury', status: 'pending', snapshotBlock: 123500 },
  ]);
}
