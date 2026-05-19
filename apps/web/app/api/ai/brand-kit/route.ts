import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { prompt } = await req.json();
  
  // Mock generation logic
  return NextResponse.json({
    logo: "https://via.placeholder.com/150",
    palette: ["#1e1e2e", "#fab387", "#89b4fa", "#a6e3a1"],
    typography: { heading: "Inter", body: "Geist" },
    banners: ["Twitter Header", "Discord Banner"],
    prompt
  });
}
