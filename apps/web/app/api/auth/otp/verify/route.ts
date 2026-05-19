import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email, otp } = await req.json();
  
  // Verify OTP (mocked)
  if (otp === '123456') {
    return NextResponse.json({ success: true, sessionToken: 'mock-session-token' });
  }
  
  return NextResponse.json({ success: false, message: 'Invalid OTP' }, { status: 401 });
}
