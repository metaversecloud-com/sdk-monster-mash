import { VisitorInterface } from "@rtsdk/topia";
import { MonsterMashVisitorData, VisitorDataObjectType } from "@shared/types/index.js";
import { Credentials } from "../types/index.js";
import { Visitor } from "./topiaInit.js";
import { standardizeError } from "./standardizeError.js";

interface GetVisitorOptions {
  /** Fetch full details (includes `isAdmin`, current position, etc.). Defaults to false — most controllers just need to write. */
  shouldGetVisitorDetails?: boolean;
  /** Fetch and shape ecosystem inventory items (badges). Defaults to false. */
  includeInventory?: boolean;
  /** Force-refresh the SDK's inventory cache. Wire this from `?forceRefreshInventory=true`. */
  forceRefreshInventory?: boolean;
}

interface GetVisitorResult {
  visitor: VisitorInterface;
  isAdmin: boolean;
  visitorData: MonsterMashVisitorData;
  visitorInventory: { [badgeName: string]: { id: string; icon: string; name: string } };
}

/**
 * Default per-profile per-instance shape written on first-open. Missing keys
 * are added by the initializer below when we upgrade schemas.
 */
const DEFAULT_VISITOR_DATA = (): MonsterMashVisitorData => ({
  schemaVersion: 1,
  dateStarted: Date.now(),
  contributedMonsters: {},
  pendingWinBanners: [],
  pendingCompletionBanners: [],
  daysAppOpened: [],
  weeksVotedIn: [],
  weeksSubmittedIn: [],
  weeksCreatedMonsterIn: [],
  votesCastThisWeek: { windowId: "", count: 0 },
  totalVotesCast: 0,
  totalThirdSectionCompletions: 0,
});

/**
 * Get (or create) a visitor, ensure the caller's Monster Mash data-object slot
 * exists under `${urlSlug}-${sceneDropId}`, optionally fetch inventory badges.
 *
 * `Visitor.get` fetches admin/position details; `Visitor.create` skips those
 * and returns a light instance suitable for writes. Pick the cheaper one when
 * you don't need admin/position.
 */
export const getVisitor = async (
  credentials: Credentials,
  options: GetVisitorOptions = {},
): Promise<GetVisitorResult> => {
  try {
    const { sceneDropId, urlSlug, visitorId } = credentials;
    const { shouldGetVisitorDetails = false, includeInventory = false, forceRefreshInventory = false } = options;

    let visitor: VisitorInterface;
    if (shouldGetVisitorDetails) visitor = await Visitor.get(visitorId, urlSlug, { credentials });
    else visitor = await Visitor.create(visitorId, urlSlug, { credentials });

    if (!visitor) throw new Error("Visitor not in world");

    const dataObject = ((await visitor.fetchDataObject()) || {}) as VisitorDataObjectType;
    const key = `${urlSlug}-${sceneDropId}`;
    const scoped = dataObject[key] as MonsterMashVisitorData | undefined;

    const lockId = `${sceneDropId}-${visitorId}-${new Date(Math.round(Date.now() / 60000) * 60000).toISOString()}`;

    let visitorData: MonsterMashVisitorData;
    if (!scoped || scoped.schemaVersion !== 1) {
      visitorData = DEFAULT_VISITOR_DATA();
      await visitor
        .updateDataObject({ [key]: visitorData }, { lock: { lockId, releaseLock: true } })
        .catch(() => console.warn("getVisitor: lock contention writing default visitor data"));
    } else {
      visitorData = scoped;
    }

    let visitorInventory: GetVisitorResult["visitorInventory"] = {};
    if (includeInventory) {
      // forceRefreshInventory: pass through to the SDK's cache-buster.
      // The SDK accepts a boolean arg; guard with a runtime check so older
      // signatures (no arg) still work.
      const fetchInventoryFn = visitor.fetchInventoryItems as unknown as (force?: boolean) => Promise<unknown>;
      await fetchInventoryFn.call(visitor, forceRefreshInventory);
      for (const visitorItem of visitor.inventoryItems ?? []) {
        const { id, status, item } = visitorItem as any;
        const { name, type, image_url = "" } = item || {};
        if (status === "ACTIVE" && type === "BADGE") {
          visitorInventory[name] = { id, icon: image_url, name };
        }
      }
    }

    return {
      visitor,
      isAdmin: visitor.isAdmin ?? false,
      visitorData,
      visitorInventory,
    };
  } catch (error) {
    throw standardizeError(error);
  }
};
