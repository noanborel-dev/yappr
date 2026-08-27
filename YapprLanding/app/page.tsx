import { Nav } from "@/components/Nav";
import { Hero } from "@/components/Hero";
import { BuiltForBuilders } from "@/components/BuiltForBuilders";
import { TheNotch } from "@/components/TheNotch";
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

        {/* Prompt shaping now follows the hero directly. The hero ends on a
            rambled sentence landing as a structured prompt; this section is
            that same move, slowed down and explained. Anything between them
            was making the reader wait for the payoff of what they had just
            watched.

            The pinned "You have four terminals open" sequence used to sit
            here. It is gone — see BuiltForBuilders.tsx. */}
        <PromptShaping />

        {/* What the app actually is, after the feature that sells it */}
        <TheNotch />

        {/* One real-world frame among the CSS-drawn app chrome. Moved down
            with the section it used to introduce. */}
        <PhotoBand photo={PHOTOS.buildBench} expand priority />
        <BuiltForBuilders />
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
