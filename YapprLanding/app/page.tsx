import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { LiveDemo } from "@/components/LiveDemo";
import { ThreeBehaviors } from "@/components/ThreeBehaviors";
import { AiCoding } from "@/components/AiCoding";
import { PerAppPolish } from "@/components/PerAppPolish";
import { Dictionary } from "@/components/Dictionary";
import { LocalMode } from "@/components/LocalMode";
import { Privacy } from "@/components/Privacy";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { FloatingPill } from "@/components/FloatingPill";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <LiveDemo />
        <ThreeBehaviors />
        <PerAppPolish />
        <AiCoding />
        <Dictionary />
        <LocalMode />
        <Privacy />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <FloatingPill />
    </>
  );
}
