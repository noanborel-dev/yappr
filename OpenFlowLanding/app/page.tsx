import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { BuiltForBuilders } from "@/components/BuiltForBuilders";
import { PromptShaping } from "@/components/PromptShaping";
import { SelectRewrite } from "@/components/SelectRewrite";
import { PersistentContext } from "@/components/PersistentContext";
import { PerAppPolish } from "@/components/PerAppPolish";
import { LiveDemo } from "@/components/LiveDemo";
import { Statement } from "@/components/Statement";
import { Pricing } from "@/components/Pricing";
import { FAQ } from "@/components/FAQ";
import { FinalCTA } from "@/components/FinalCTA";
import { Footer } from "@/components/Footer";
import { FloatingPill } from "@/components/FloatingPill";
import { PhotoBand } from "@/components/PhotoBand";
import { PHOTOS } from "@/components/photos";

// Page rhythm follows the shape that works on comparable sites:
//   hero → "will it fit my day" → features → proof → try it → price → CTA
//
// Two deliberate omissions vs that shape: no "Nx faster than typing" stat
// block (the pitch isn't speed, and we don't publish latency claims — the
// live demo carries it), and no testimonial wall until we have real quotes.
export default function Home() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        {/* One real-world frame between the hero mockup and the dark identity
            section — the page is otherwise all CSS-drawn app chrome. */}
        <PhotoBand photo={PHOTOS.buildBench} />
        <BuiltForBuilders />
        {/* The three features, in order of what actually sells the product */}
        <PromptShaping />
        <SelectRewrite />
        <PersistentContext />
        {/* Proof, not pitch */}
        <PerAppPolish />
        <PhotoBand photo={PHOTOS.lateDesk} />
        {/* Chapter break — gives the page a breath after four feature
            movements, and hands off into the demo */}
        {/* Names the key in the headline. The earlier version ("Enough
            reading. Hold a key.") depended on its own sub-line to say WHICH
            key, and read as scolding. */}
        {/* No sub-line. "Hold Control. Say anything." + the glowing key
            below it said the same thing three times over. */}
        <Statement>
          Hold <em>Control</em>. Say anything.
        </Statement>
        {/* Try it, then price it */}
        <LiveDemo />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <FloatingPill />
    </>
  );
}
