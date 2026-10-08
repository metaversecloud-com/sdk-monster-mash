export const fireToast = jest.fn().mockResolvedValue({ success: true });
export const triggerParticle = jest.fn().mockResolvedValue({ success: true });

export enum DroppedAssetClickType {
  NONE = "none",
  LINK = "link",
  PORTAL = "portal",
  TELEPORT = "teleport",
  WEBHOOK = "webhook",
}

export class Topia {
  constructor(_opts: any) {}
}

export class AssetFactory {
  constructor(_topia: any) {}
  create(_id: string, _opts: any) {
    return Promise.resolve({ id: _id });
  }
}

export const droppedMonsterAssetSpy = jest.fn();

export class DroppedAssetFactory {
  constructor(_topia: any) {}
  get(_assetId: string, _slug: string, _opts: any) {
    return Promise.resolve({});
  }
  drop(_asset: any, opts: any) {
    droppedMonsterAssetSpy(opts);
    const record: any = {
      id: `dropped-${opts?.uniqueName ?? "asset"}`,
      setDataObject: jest.fn().mockResolvedValue({}),
    };
    return Promise.resolve(record);
  }
}

/**
 * Ecosystem inventory the mock serves to `getCachedInventoryItems`. Tests
 * set this via `__mock.setEcosystemInventory([...])`; the cache layer is
 * what strips INACTIVE rows, so put raw rows here (INACTIVE included).
 */
export let ecosystemInventoryItems: any[] = [];

export const ecosystemFetchInventorySpy = jest.fn();

export class EcosystemFactory {
  constructor(_topia: any) {}
  create(_opts: any) {
    return {
      fetchInventoryItems: async () => {
        ecosystemFetchInventorySpy(_opts);
      },
      get inventoryItems() {
        return ecosystemInventoryItems;
      },
    };
  }
}

export class UserFactory {
  constructor(_topia: any) {}
  create(_opts: any) {
    const record: any = {
      fetchDataObject: jest.fn().mockResolvedValue({}),
      updateDataObject: jest.fn().mockResolvedValue({}),
      fireToast,
    };
    return Promise.resolve(record);
  }
}

export class VisitorFactory {
  constructor(_topia: any) {}
  get(_visitorId: number, _slug: string, _opts: any) {
    return Promise.resolve({ fireToast });
  }
  create(_visitorId: number, _slug: string, _opts: any) {
    return Promise.resolve({ fireToast });
  }
}

export const worldDeleteDroppedAssetsSpy = jest.fn().mockResolvedValue({});

export class WorldFactory {
  constructor(_topia: any) {}
  create(slug: string, opts: any) {
    (__mock as any).lastWorldCreateArgs = { slug, opts };
    return { fireToast, triggerParticle };
  }
  deleteDroppedAssets(...args: any[]) {
    return worldDeleteDroppedAssetsSpy(...args);
  }
}

export class WorldActivityFactory {
  constructor(_topia: any) {}
}

export const __mock = {
  fireToast,
  triggerParticle,
  droppedMonsterAssetSpy,
  worldDeleteDroppedAssetsSpy,
  lastWorldCreateArgs: null as any,
  ecosystemFetchInventorySpy,
  setEcosystemInventory(items: any[]) {
    ecosystemInventoryItems = items;
  },
  reset() {
    ecosystemInventoryItems = [];
    ecosystemFetchInventorySpy.mockClear();
    fireToast.mockClear();
    triggerParticle.mockClear();
    droppedMonsterAssetSpy.mockClear();
    worldDeleteDroppedAssetsSpy.mockClear();
    this.lastWorldCreateArgs = null;
  },
};
