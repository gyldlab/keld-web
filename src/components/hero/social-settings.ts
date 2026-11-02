import type { SocialId, SocialTuning } from "@/components/hero/_types/scene-preset";

export const SOCIAL_IDS: SocialId[] = ["github", "x", "linkedin"];

/** Authored coordinates stay relative to the slab's original placement. */
export function createDefaultSocialTuning(): SocialTuning {
  return Object.fromEntries(
    SOCIAL_IDS.map((id, index) => [
      id,
      {
        desktop: true,
        enabled: true,
        mobile: true,
        position: [3.1 + index * 0.8, 1.519, 2.5],
        reveal: {
          enabled: true,
          end: 0.55 + 0.4 * (0.82 + index * 0.09),
          lift: 0.18,
          start: 0.55 + 0.4 * index * 0.09,
          tilt: (-0.12 * 180) / Math.PI,
        },
        rotation: [(-0.25 * 180) / Math.PI, 0, 0],
        scale: 1,
      },
    ]),
  ) as SocialTuning;
}
