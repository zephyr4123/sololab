import { HeroBanner } from '@/components/home/HeroBanner';
import { ModuleAtelier } from '@/components/home/ModuleAtelier';
import { RecentWork } from '@/components/home/RecentWork';

/**
 * Home — SoloLab's lab-dashboard landing surface.
 *
 * Composition (top to bottom):
 *   1. HeroBanner    · "Day N in the lab." + live status sub-line
 *   2. ModuleAtelier · 3 modules (the most-recently active becomes
 *                      the hero card; the other two ride as chips)
 *   3. RecentWork    · cross-module activity timeline
 *
 * Each section enters with a staggered fade-in-up. A warm orb pins
 * atmosphere to the upper-left of the hero. The whole composition
 * lives inside a centered narrow column so the typography reads
 * like an editorial dashboard — focused, calm, data-forward.
 *
 * The visual brief is "research lab", not "artisan workshop" — copy
 * is function-forward, imagery is workstation-themed, and the page
 * leans on data + status rather than poetic prose.
 */
export default function AtelierPage() {
  return (
    <div className="relative h-full overflow-y-auto">
      {/* Subtle vertical edge glow on the right — adds depth without a border */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-px"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, color-mix(in oklab, var(--color-border) 30%, transparent) 25%, color-mix(in oklab, var(--color-border) 30%, transparent) 75%, transparent 100%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-[920px] px-4 pb-20">
        <HeroBanner />
        <ModuleAtelier />
        <RecentWork />
      </div>
    </div>
  );
}
