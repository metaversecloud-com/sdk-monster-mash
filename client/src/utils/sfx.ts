/**
 * Tiny lazy-load SFX manager. One HTMLAudioElement per clip, cached on
 * first play — subsequent plays reset `currentTime` so rapid retriggers
 * replay from the start instead of layering copies on top of each other.
 *
 * No preload at mount — files load the first time each sound fires. Total
 * payload across the catalog is ~215 KB, so cold-first-play latency is
 * dominated by network RTT for a < 15 KB file (fine for UI feedback).
 *
 * No mute toggle yet — the browser's own tab mute is the only off switch.
 * Every play is wrapped in a try/catch and uses `.play().catch(() => {})`
 * so an autoplay-policy rejection on page load never bubbles.
 */

const cache: Record<string, HTMLAudioElement> = {};

const CLIPS = {
  BUILDER_PICK_1: "mm-builder-pick-01-v001",
  BUILDER_PICK_2: "mm-builder-pick-02-v001",
  BUILDER_PICK_3: "mm-builder-pick-03-v001",
  BUILDER_NONE: "mm-builder-none-v001",
  VOTE_SUBMIT: "mm-vote-submit-v001",
  SECTION_SUBMIT: "mm-section-submit-v001",
  MONSTER_COMPLETE: "mm-monster-complete-v001",
  WIN_CHEER: "mm-win-cheer-a-v003",
  SECTION_REVEAL: "mm-section-reveal-v001",
  JOIN_SECTION: "mm-join-section-v001",
  CLAIM_TAKEN: "mm-claim-taken-v001",
  TAB_SWITCH: "mm-tab-switch-v001",
  MATCHUP_NEXT: "mm-matchup-next-v001",
  DELETE_POOF: "mm-delete-poof-v001",
} as const;

export type SfxName = keyof typeof CLIPS;

const BUILDER_PICK_SET = [CLIPS.BUILDER_PICK_1, CLIPS.BUILDER_PICK_2, CLIPS.BUILDER_PICK_3] as const;

const playFile = (filename: string) => {
  try {
    let audio = cache[filename];
    if (!audio) {
      audio = new Audio(`/sfx/${filename}.mp3`);
      audio.preload = "auto";
      cache[filename] = audio;
    }
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    // Silently swallow — SFX are never user-facing failures.
  }
};

export const playSfx = (name: SfxName) => {
  playFile(CLIPS[name]);
};

/** Play one of the three Builder pick variants at random (per spec). */
export const playBuilderPick = () => {
  const pick = BUILDER_PICK_SET[Math.floor(Math.random() * BUILDER_PICK_SET.length)];
  playFile(pick);
};
