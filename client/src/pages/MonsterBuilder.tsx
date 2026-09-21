import { useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

// components
import {
  BuildingPill,
  LayeredPreview,
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
import { GlobalDispatchContext, GlobalStateContext } from "@/context/GlobalContext";
import { ErrorType } from "@/context/types";

// shared
import { CATEGORIES_BY_SECTION, PART_BY_ID } from "@shared/content/monsterMash";
import { MonsterIndexEntry, Section, SECTIONS } from "@shared/types/index";

// utils
import { backendAPI, setErrorMessage, setMainAppState } from "@/utils";

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
  const navigate = useNavigate();
  const { mainApp } = useContext(GlobalStateContext);

  // Locate the monster in the roster so we can render peer-done placeholders.
  const monster: MonsterIndexEntry | undefined = useMemo(() => {
    return mainApp?.monsters?.find((m) => m.monsterId === monsterId);
  }, [mainApp?.monsters, monsterId]);

  const draft = mainApp?.activeDraft && mainApp.activeDraft.monsterId === monsterId ? mainApp.activeDraft : null;
  const categories = CATEGORIES_BY_SECTION[section];

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Hydrate from server-side draft the first time it arrives.
  useEffect(() => {
    if (!draft) return;
    setPicks((prev) => (Object.keys(prev).length ? prev : { ...draft.picks }));
    setNameToken((prev) => prev || (draft.nameToken ?? ""));
  }, [draft]);

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

  // Peer-done sections (for the LayeredPreview dashed placeholders + real reveal).
  const peerDoneSections = useMemo(() => {
    const map: Partial<Record<Section, { contributorDisplayName?: string; sectionImageUrl?: string }>> = {};
    if (!monster) return map;
    for (const s of SECTIONS) {
      if (s === section) continue;
      const slot = monster.sections?.[s];
      if (slot?.status !== "done") continue;
      map[s] = {
        contributorDisplayName: slot.contributorDisplayName,
        sectionImageUrl: monster.inProgressSections?.[s]?.sectionImageUrl,
      };
    }
    return map;
  }, [monster, section]);

  const handleCategoryChange = (categoryId: string, partId: string) => {
    // Legs sub-rule: picking a `legs.legs` with supportsFeet=false while a real
    // feet is present → open the NoFeetModal to force a choice.
    if (categoryId === "legs" && partId !== NONE_ID) {
      const legPart = PART_BY_ID[partId];
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

  const submitSection = async () => {
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const returnToMainApp = () => {
    // Refresh /main-app so the Create tab reflects the updated roster.
    backendAPI
      .get("/main-app")
      .then((response) => {
        if (response?.data?.success && response.data.data) setMainAppState(dispatch, response.data.data);
      })
      .catch(() => {})
      .finally(() => navigate("/", { replace: true }));
  };

  const startFreshMonster = async () => {
    try {
      const response = await backendAPI.post(`/monsters/start`);
      if (response?.data?.success) {
        const { monsterId: newId, section: newSection } = response.data.data;
        navigate(`/?screen=builder&monsterId=${newId}&section=${newSection}`, { replace: true });
      }
    } catch (error) {
      setErrorMessage(dispatch, error as ErrorType);
    }
  };

  if (phase === "submitted" && submitResult) {
    return (
      <PageContainer isLoading={false}>
        <SectionSubmitted
          section={section}
          isComplete={submitResult.isComplete}
          composedName={submitResult.composedName}
          imageUrl={submitResult.imageUrl}
          contributorNames={submitResult.contributorNames}
          nameToken={nameToken}
          onBackToMonsterMash={returnToMainApp}
        />
      </PageContainer>
    );
  }

  // Legs.feet disabled-set — legs pick is a no-feet part → feet disabled (except NONE)
  const disabledFeetIds = useMemo(() => {
    if (section !== "legs") return undefined;
    const legsId = picks["legs"];
    if (!legsId || legsId === NONE_ID) return undefined;
    const legsPart = PART_BY_ID[legsId];
    if (legsPart?.supportsFeet !== false) return undefined;
    // Every real feet part is disabled; NONE stays clickable.
    const disabled = new Set<string>();
    for (const p of Object.values(PART_BY_ID)) {
      if (p.categoryId === "feet") disabled.add(p.id);
    }
    return disabled;
  }, [picks, section]);

  return (
    <PageContainer isLoading={isLoading}>
      <div className="w-full max-w-md mx-auto flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="p2 uppercase tracking-wider text-gray-500">Monster Mash</p>
          <BuildingPill section={section} stepIndex={stepIndex} />
          <p className="p2 text-gray-600">preview left, pickers below</p>
        </div>

        <LayeredPreview section={section} picks={picks} peerDoneSections={peerDoneSections} />

        <div className="flex items-center justify-between">
          <h3 className="h3">
            {categories[0]?.section === section && `${section.charAt(0).toUpperCase()}${section.slice(1)} parts`}
          </h3>
          <span className="p2 text-gray-600">
            {chosenCount} of {categories.length} chosen
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {categories.map((cat) => (
            <SectionAccordion
              key={cat.id}
              category={cat}
              chosen={!!picks[cat.id]}
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

        <button
          className="btn"
          disabled={!allChosen || isSubmitting}
          onClick={() => setPhase("confirming")}
          aria-disabled={!allChosen || isSubmitting}
        >
          {allChosen
            ? `Submit ${section}`
            : `Submit ${section} (choose all ${categories.length + 1} — ${categories.length + 1 - chosenCount - (nameToken ? 1 : 0)} left)`}
        </button>

        <button
          className="btn btn-outline"
          onClick={async () => {
            try {
              await backendAPI.post(`/monsters/${monsterId}/abandon`);
            } finally {
              returnToMainApp();
            }
          }}
        >
          Cancel & release my claim
        </button>

        <p className="p2 text-center text-gray-500">
          EVERY category is required. Where "nothing" is a valid look the options include an explicit NONE tile — there are no optional categories.
        </p>

        {phase === "confirming" && (
          <SubmitConfirm
            section={section}
            isSubmitting={isSubmitting}
            onConfirm={submitSection}
            onCancel={() => setPhase("picking")}
          />
        )}

        {phase === "raced" && <RaceDialog onBackToList={returnToMainApp} onStartNew={startFreshMonster} />}

        {pendingLegsSwap && (
          <NoFeetModal
            keepFeetId={picks["feet"] ?? ""}
            newLegsId={pendingLegsSwap}
            onKeep={closeNoFeet}
            onUseNewLegs={applyNewLegs}
          />
        )}
      </div>
    </PageContainer>
  );
};

export default MonsterBuilder;
