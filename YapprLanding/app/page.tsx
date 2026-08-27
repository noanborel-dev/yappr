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

        {/* "Made for people who build things" — straight after the hero.
            The hero now closes on a dark demo running off the bottom of the
            screen; this photograph is the one real-world frame on a page of
            CSS-drawn app chrome, and it lands better as the thing you scroll
            into than buried four sections down. */}
        <PhotoBand photo={PHOTOS.buildBench} expand priority />
        <BuiltForBuilders />

        {/* The three features, in the order that sells them. TheNotch used
            to sit above these, headlined "what the app actually is" — the
            hero is now that demo, at full width and in motion, so the
            section was answering a question the reader had already had
            answered. Removed rather than moved. */}
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
