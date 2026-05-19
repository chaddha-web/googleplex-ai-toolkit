import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { email, turnstileToken } = await req.json();
  
  // Verify Turnstile token (mocked for now)
  // Logic: call Turnstile verification API
  
  console.log(`Sending OTP to ${email}`);
  
  return NextResponse.json({ success: true });
}
