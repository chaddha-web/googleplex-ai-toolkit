import { LandingShell } from "@/components/landing-shell";
import { Hero } from "@/components/sections/hero";
import { AboutSection } from "@/components/sections/about";
import { FeaturedVideoSection } from "@/components/sections/featured";
import { PhilosophySection } from "@/components/sections/philosophy";
import { TrustSection } from "@/components/sections/trust";
import { ServicesSection } from "@/components/sections/services";
import { BenefitSection } from "@/components/sections/benefit";
import { TestimonialsSection } from "@/components/sections/testimonials";
import { FAQSection } from "@/components/sections/faq";
import { Footer } from "@/components/sections/footer";

export default function Page() {
  return (
    <LandingShell>
      <main className="bg-black text-base">
        <Hero />
        <AboutSection />
        <FeaturedVideoSection />
        <PhilosophySection />
        <TrustSection />
        <ServicesSection />
        <BenefitSection />
        <TestimonialsSection />
        <FAQSection />
        <Footer />
      </main>
    </LandingShell>
  );
}
