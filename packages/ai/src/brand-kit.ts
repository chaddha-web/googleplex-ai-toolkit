export interface BrandKit {
  logoUrl: string;
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  banners: {
    twitter: string;
    discord: string;
  };
}

export async function generateBrandKit(_prompt: string): Promise<BrandKit> {
  // TODO: Wire up actual LLM and Image Gen APIs (e.g., Anthropic + DALL-E)
  throw new Error("LLM call not yet wired");
}
