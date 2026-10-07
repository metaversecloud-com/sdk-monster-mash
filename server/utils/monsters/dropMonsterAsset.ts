import { DroppedAssetClickType, DroppedAssetInterface, VisitorInterface } from "@rtsdk/topia";
import { MonsterAssetDataObject } from "@shared/types/index.js";
import { Credentials } from "../../types/index.js";
import { Asset, DroppedAsset, World } from "../topiaInit.js";
import { standardizeError } from "../standardizeError.js";

interface DropMonsterInput {
  credentials: Credentials;
  visitor: VisitorInterface | null;
  monsterId: string;
  imageUrl: string;
  clickableLinkBase: string;
  monsterAssetData: MonsterAssetDataObject;
}

const OFFSET_X = 80;
const OFFSET_Y = 0;

/**
 * Drop the finished monster into the world as a new dropped asset.
 * The monster's full record lives on THIS dropped asset's dataObject
 * (`monsterAssetData` — includes name, birthdate, contributors, sections,
 * imageUrl). The key asset roster keeps only the index fields.
 */
export const dropMonsterAsset = async ({
  credentials,
  visitor,
  monsterId,
  imageUrl,
  clickableLinkBase,
  monsterAssetData,
}: DropMonsterInput): Promise<DroppedAssetInterface> => {
  try {
    const { assetId: keyAssetId, interactivePublicKey, sceneDropId, urlSlug } = credentials;
    const asset = await Asset.create(process.env.IMG_ASSET_ID || "webImageAsset", { credentials });

    const clickableLink = `${clickableLinkBase.replace(/\/$/, "")}/?screen=single-monster&monsterId=${monsterId}`;

    const position = {
      x: (visitor?.moveTo?.x ?? 0) + OFFSET_X,
      y: (visitor?.moveTo?.y ?? 0) + OFFSET_Y,
    };

    const droppedAsset = await DroppedAsset.drop(asset, {
      assetScale: 0.6,
      clickType: DroppedAssetClickType.LINK,
      clickableLink,
      clickableLinkTitle: "Monster Mash",
      isOpenLinkInDrawer: true,
      isInteractive: true,
      interactivePublicKey,
      layer1: imageUrl,
      position,
      sceneDropId,
      uniqueName: `MonsterMash-monster-${monsterId}`,
      urlSlug,
    });

    // Persist the monster's canonical record on this dropped asset. Include
    // the key asset's id so admin actions initiated from a world click on
    // this monster (drawer opens with `credentials.assetId = monster's id`)
    // can still resolve the roster back to the right key asset.
    const monsterAssetDataWithKey = { ...monsterAssetData, keyAssetId };
    await droppedAsset
      .setDataObject(monsterAssetDataWithKey as unknown as Record<string, unknown>, {})
      .catch((error) => {
        console.warn("dropMonsterAsset: could not persist monster dataObject", error);
      });

    // Best-effort celebration particle.
    try {
      const world = World.create(urlSlug, { credentials });
      world
        .triggerParticle({ name: "whiteStar_burst", duration: 3, position })
        .catch((error: unknown) => console.warn("dropMonsterAsset: particle failed", error));
    } catch (error) {
      console.warn("dropMonsterAsset: world.create failed", error);
    }

    return droppedAsset;
  } catch (error) {
    throw standardizeError(error);
  }
};
