import { useContext, useEffect, useMemo, useRef, useState } from "react";

// components
import {
  BuildingPill,
  LayeredPreview,
  Logo,
  NameTokenPicker,
  NoFeetModal,
  PageContainer,
  PartGrid,
  RaceDialog,
  SectionAccordion,
  SectionSubmitted,
  SubmitConfirm,
} from "@/components";

// context
import { useBusy } from "@/context/BusyContext";
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { MonsterIndexEntry, Section, SECTIONS } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage, useContent } from "@/utils";

interface MonsterBuilderProps {
  isLoading: boolean;
  monsterId: string;
  section: Section;
}

type Phase = "picking" | "confirming" | "submitted" | "raced";

const NONE_ID = "NONE";

/**
 * Monster Builder drawer.
 *
 * Flow:
 *   1. Load caller's activeDraft picks (from GlobalContext) as initial state.
 *   2. Render preview + accordion pickers + name-token dropdown + Submit.
 *   3. Enforce legs-no-feet incompatibility client-side (NoFeetModal).
 *   4. Submit → confirm modal → POST /monsters/:id/section.
 *      - 200 → SectionSubmitted (either "section submitted" or Epic-3-placeholder "IT'S ALIVE!" for third-section).
 *      - 409 → RaceDialog (someone claimed / lock stale).
 */
export const MonsterBuilder = ({ isLoading, monsterId, section }: MonsterBuilderProps) => {
  const dispatch = useContext(GlobalDispatchContext);
  const { mainApp } = useContext(GlobalStateContext);

  // Locate the monster in the roster so we can render peer-done placeholders.
  const monster: MonsterIndexEntry | undefined = useMemo(() => {
    return mainApp?.monsters?.find((m) => m.monsterId === monsterId);
  }, [mainApp?.monsters, monsterId]);

  const draft = mainApp?.activeDraft && mainApp.activeDraft.monsterId === monsterId ? mainApp.activeDraft : null;
  const { categoriesBySection, partById } = useContent();
  const categories = categoriesBySection[section];

  const [phase, setPhase] = useState<Phase>("picking");
  const [picks, setPicks] = useState<{ [k: string]: string }>({});
  const [nameToken, setNameToken] = useState<string>("");
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [pendingLegsSwap, setPendingLegsSwap] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    isComplete: boolean;
    composedName: string | null;
    imageUrl: string | null;
    contributorNames: string[];
  } | null>(null);
  const { isBusy, run } = useBusy();

  // Hydrate from server-side draft the first time it arrives. `hasHydrated`
  // gates the auto-save effect below so we don't POST the draft right back
  // to the server on mount.
  const hasHydrated = useRef(false);
  useEffect(() => {
    if (!draft) return;
    setPicks((prev) => (Object.keys(prev).length ? prev : { ...draft.picks }));
    setNameToken((prev) => prev || (draft.nameToken ?? ""));
    hasHydrated.current = true;
  }, [draft]);

  // Auto-save every pick / name-token change to `activeDraft` on the caller's
  // visitor dataObject so a closed drawer can Resume with everything intact.
  // Debounced 500ms so a rapid-fire click sequence collapses to one write.
  // Fire-and-forget — never routes through `run()` (which would disable UI)
  // and never surfaces errors (the caller retries on their next change).
  useEffect(() => {
    if (!hasHydrated.current) return;
    if (phase !== "picking" && phase !== "confirming") return;
    const timeout = setTimeout(() => {
      backendAPI.post(`/monsters/${monsterId}/draft`, { section, picks, nameToken }).catch(() => {});
    }, 500);
    return () => clearTimeout(timeout);
  }, [picks, nameToken, monsterId, section, phase]);

  // Open the first not-yet-chosen accordion on mount (best-guess UX).
  useEffect(() => {
    if (openAccordion) return;
    const first = categories.find((c) => !picks[c.id]);
    if (first) setOpenAccordion(first.id);
  }, [categories, picks, openAccordion]);

  const chosenCount = categories.reduce((n, c) => (picks[c.id] ? n + 1 : n), 0);
  const allChosen = chosenCount === categories.length && !!nameToken;
  const stepIndex = useMemo(() => {
    if (!monster) return 1;
    const doneCount = SECTIONS.filter((s) => monster.sections?.[s]?.status === "done").length;
    return doneCount + 1;
  }, [monster]);

  // Peer-done sections — only contributor names surface here; the placeholder
  // stays until the composed final image lands after third-section submit.
  const peerDoneSections = useMemo(() => {
    const map: Partial<Record<Section, { contributorDisplayName?: string }>> = {};
    if (!monster) return map;
    for (const s of SECTIONS) {
      if (s === section) continue;
      const slot = monster.sections?.[s];
      if (slot?.status !== "done") continue;
      map[s] = { contributorDisplayName: slot.contributorDisplayName };
    }
    return map;
  }, [monster, section]);

  const handleCategoryChange = (categoryId: string, partId: string) => {
    // Legs sub-rule: picking a `legs.legs` with supportsFeet=false while a real
    // feet is present → open the NoFeetModal to force a choice.
    if (categoryId === "legs" && partId !== NONE_ID) {
      const legPart = partById[partId];
      const currentFeet = picks["feet"];
      if (legPart?.supportsFeet === false && currentFeet && currentFeet !== NONE_ID) {
        setPendingLegsSwap(partId);
        return;
      }
    }
    setPicks((prev) => ({ ...prev, [categoryId]: partId }));
  };

  const closeNoFeet = () => setPendingLegsSwap(null);
  const applyNewLegs = () => {
    if (!pendingLegsSwap) return;
    setPicks((prev) => ({ ...prev, legs: pendingLegsSwap, feet: NONE_ID }));
    setPendingLegsSwap(null);
  };

  const submitSection = () => {
    return run(async () => {
      try {
        const response = await backendAPI.post(`/monsters/${monsterId}/section`, {
          section,
          picks,
          nameToken,
        });
        if (response?.data?.success) {
          const data = response.data.data;
          // For the completion moment, we want the three contributor display
          // names in section order (head, torso, legs). Pull them from the
          // roster entry we already have + fold in the caller as the just-
          // submitted section's contributor.
          const contributorNames: string[] = [];
          if (data.isComplete && monster) {
            for (const s of SECTIONS) {
              if (s === section) contributorNames.push(mainApp?.visitor?.displayName ?? "");
              else contributorNames.push(monster.sections?.[s]?.contributorDisplayName ?? "");
            }
          }
          setSubmitResult({
            isComplete: !!data.isComplete,
            composedName: data.composedName ?? null,
            imageUrl: data.imageUrl ?? null,
            contributorNames,
          });
          setPhase("submitted");
        }
      } catch (error) {
        const httpStatus = (error as { response?: { status?: number } })?.response?.status;
        if (httpStatus === 409) {
          setPhase("raced");
        } else {
          setErrorMessage(dispatch, error as ErrorType);
        }
      }
    });
  };

  // Drawer → wide modal transition. The server closes this iframe and
  // reopens the main-app modal with all credentials preserved.
  const returnToMainApp = () => {
    if (isBusy) return;
    run(() => backendAPI.post("/main-app/return").catch(() => {}));
  };

  // "Start a new monster" from the race dialog: server handles the modal
  // switch (handleStartMonster calls transitionToDrawer).
  const startFreshMonster = () => {
    return run(async () => {
      try {
        await backendAPI.post(`/monsters/start`);
      } catch (error) {
        setErrorMessage(dispatch, error as ErrorType);
      }
    });
  };

  // Legs.feet disabled-set — legs pick is a no-feet part → feet disabled (except NONE)
  const disabledFeetIds = useMemo(() => {
    if (section !== "legs") return undefined;
    const legsId = picks["legs"];
    if (!legsId || legsId === NONE_ID) return undefined;
    const legsPart = partById[legsId];
    if (legsPart?.supportsFeet !== false) return undefined;
    // Every real feet part is disabled; NONE stays clickable.
    const disabled = new Set<string>();
    for (const p of Object.values(partById)) {
      if (p.categoryId === "feet") disabled.add(p.id);
    }
    return disabled;
  }, [picks, section]);

  if (phase === "submitted" && submitResult) {
    return (
      <div className="p-2 mm-app min-h-screen">
        <PageContainer isLoading={false}>
          <SectionSubmitted
            section={section}
            isComplete={submitResult.isComplete}
            composedName={submitResult.composedName}
            imageUrl={submitResult.imageUrl}
            contributorNames={submitResult.contributorNames}
            nameToken={nameToken}
            picks={picks}
            sectionsRemaining={Math.max(0, 3 - stepIndex)}
            onBackToMonsterMash={returnToMainApp}
          />
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="mm-app min-h-screen">
      <PageContainer isLoading={isLoading}>
        <div className="flex flex-col gap-2 items-center">
          <Logo className="h-10 w-auto" />
          <BuildingPill section={section} stepIndex={stepIndex} />
        </div>
        <div className="w-full flex flex-col gap-2 mt-4">
          {/* Two-column layout: pinned preview on the left, scrollable
            pickers on the right. `position: sticky` on the preview keeps
            it visible as the pickers scroll — natural document scroll on
            the parent means when everything fits the viewport there's no
            scroll at all; only tall content triggers scrolling. */}
          <div className="flex gap-1 items-start">
            <aside className="sticky top-2 flex-shrink-0 w-[42%] self-start">
              <LayeredPreview section={section} picks={picks} peerDoneSections={peerDoneSections} />
            </aside>

            <div className="mm-section flex flex-col items-center gap-3 p-2">
              <div className="w-full flex items-baseline justify-between gap-3">
                <p className="flex-stretch font-semibold mm-text-white">
                  {categories[0]?.section === section && `${section.charAt(0).toUpperCase()}${section.slice(1)} parts`}
                </p>
                <span className="p2 mm-text-accent-lt">
                  {chosenCount} of {categories.length}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                {categories.map((cat) => (
                  <SectionAccordion
                    key={cat.id}
                    catId={cat.id}
                    label={cat.label}
                    chosen={!!picks[cat.id]}
                    isExpandable={true}
                    isOpen={openAccordion === cat.id}
                    onToggle={() => setOpenAccordion(openAccordion === cat.id ? null : cat.id)}
                  >
                    <PartGrid
                      category={cat}
                      value={picks[cat.id]}
                      onChange={(id) => handleCategoryChange(cat.id, id)}
                      disabledIds={cat.id === "feet" ? disabledFeetIds : undefined}
                    />
                  </SectionAccordion>
                ))}
              </div>

              <NameTokenPicker section={section} value={nameToken} onChange={setNameToken} />
            </div>
          </div>

          {/* Full-width footer: submit + cancel + disclaimer sit under both
            columns (mockup shows them separated by a horizontal rule). */}
          <div className="border-t pt-3 mt-2 flex flex-col gap-2">
            <button
              className="btn mm-button-primary"
              disabled={!allChosen || isBusy}
              onClick={() => setPhase("confirming")}
              aria-disabled={!allChosen || isBusy}
            >
              <div className="flex flex-col">
                <p className="font-bold text-xl">Submit {section}</p>
                {allChosen ? (
                  <p>Ready to submit!</p>
                ) : (
                  <p className="text-xs">
                    choose all {categories.length + 1} — {categories.length + 1 - chosenCount - (nameToken ? 1 : 0)}{" "}
                    left
                  </p>
                )}
              </div>
            </button>

            <button
              className="btn btn-outline"
              disabled={isBusy}
              onClick={() =>
                run(async () => {
                  try {
                    await backendAPI.post(`/monsters/${monsterId}/abandon`);
                  } finally {
                    await backendAPI.post("/main-app/return").catch(() => {});
                  }
                })
              }
            >
              Cancel & release my claim
            </button>
          </div>

          {phase === "confirming" && (
            <SubmitConfirm section={section} onConfirm={submitSection} onCancel={() => setPhase("picking")} />
          )}

          {phase === "raced" && <RaceDialog onBackToList={returnToMainApp} onStartNew={startFreshMonster} />}

          {pendingLegsSwap && <NoFeetModal onKeep={closeNoFeet} onUseNewLegs={applyNewLegs} />}
        </div>
      </PageContainer>
    </div>
  );
};

export default MonsterBuilder;
