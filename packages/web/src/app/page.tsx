import { Footer } from "@/components/Footer";
import { CtaFinal } from "@/components/landing/CtaFinal";
import { Faq } from "@/components/landing/Faq";
import { Features } from "@/components/landing/Features";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { JsonLd } from "@/components/landing/JsonLd";
import { Nav } from "@/components/landing/Nav";
import { Stats } from "@/components/landing/Stats";
import { TOKENS } from "@/lib/tokens";

export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: TOKENS.bg,
        color: TOKENS.text,
        fontFamily: TOKENS.font,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <JsonLd />
      <Nav />
      <Hero />
      <Stats />
      <Features />
      <HowItWorks />
      <Faq />
      <CtaFinal />
      <Footer />
    </main>
  );
}
