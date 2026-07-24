import accountUtils from '@onekeyhq/shared/src/utils/accountUtils';

import { currencyPersistAtom } from '../../../states/jotai/atoms';

import ServiceHardwarePortfolioSync from './ServiceHardwarePortfolioSync';

import type { IPortfolioSyncSettledPayload } from './serviceHardwarePortfolioSyncUtils';
import type { IBackgroundApi } from '../../../apis/IBackgroundApi';

jest.mock('@onekeyhq/shared/src/background/backgroundDecorators', () => ({
  backgroundClass: () => (target: unknown) => target,
  backgroundMethod:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
  backgroundMethodForDev:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

jest.mock('@onekeyhq/shared/src/eventBus/appEventBus', () => ({
  EAppEventBusNames: {
    AllNetworksTokenListSettled: 'AllNetworksTokenListSettled',
  },
  appEventBus: { on: jest.fn(), off: jest.fn() },
}));

jest.mock('@onekeyhq/shared/src/platformEnv', () => ({
  __esModule: true,
  default: { isDev: false, isJest: true },
}));

jest.mock('@onekeyhq/shared/src/utils/accountUtils', () => ({
  __esModule: true,
  default: { isHwWallet: jest.fn() },
}));

jest.mock('../../../states/jotai/atoms', () => ({
  currencyPersistAtom: { get: jest.fn() },
  settingsPersistAtom: { get: jest.fn() },
}));

jest.mock('../../../states/jotai/atoms/devSettings', () => ({
  devSettingsPersistAtom: {
    get: jest.fn().mockResolvedValue({
      enabled: true,
      settings: {
        enablePortfolioSyncDev: true,
        enablePro2TestMode: true,
      },
    }),
  },
  isPro2DebugModuleEnabled: jest.fn().mockReturnValue(true),
}));

describe('ServiceHardwarePortfolioSync.cancelActivePortfolioSync', () => {
  test('cancels the active operation and waits for upload cleanup', async () => {
    const cancelHardwareOperation = jest.fn().mockResolvedValue(undefined);
    const service = new ServiceHardwarePortfolioSync({
      backgroundApi: {
        serviceHardware: { cancelHardwareOperation },
      } as unknown as IBackgroundApi,
    });
    let resolveUpload:
      | ((value: { portfolioUpdated: boolean }) => void)
      | undefined;
    const uploadPromise = new Promise<{ portfolioUpdated: boolean }>(
      (resolve) => {
        resolveUpload = resolve;
      },
    );
    const activeUpload = {
      cancelledByUser: false,
      operationId: 'portfolio:PRO2_CONNECT_ID:1:1',
      promise: uploadPromise,
    };
    const activeUploads = new Map([['PRO2_CONNECT_ID', activeUpload]]);
    (
      service as unknown as {
        activeUploadByConnectId: Map<
          string,
          {
            cancelledByUser: boolean;
            operationId: string;
            promise: Promise<{ portfolioUpdated: boolean }>;
          }
        >;
      }
    ).activeUploadByConnectId = activeUploads;

    let completed = false;
    const waiting = service
      .cancelActivePortfolioSync({ connectId: 'PRO2_CONNECT_ID' })
      .then((result) => {
        completed = true;
        return result;
      });

    await Promise.resolve();
    expect(activeUpload.cancelledByUser).toBe(true);
    expect(cancelHardwareOperation).toHaveBeenCalledWith({
      connectId: 'PRO2_CONNECT_ID',
      operationId: 'portfolio:PRO2_CONNECT_ID:1:1',
    });
    expect(completed).toBe(false);

    resolveUpload?.({ portfolioUpdated: true });
    await expect(waiting).resolves.toBe(true);
  });

  test('returns immediately when the device has no active upload', async () => {
    const service = new ServiceHardwarePortfolioSync({
      backgroundApi: {} as IBackgroundApi,
    });

    await expect(
      service.cancelActivePortfolioSync({ connectId: 'PRO2_CONNECT_ID' }),
    ).resolves.toBe(false);
  });
});

describe('ServiceHardwarePortfolioSync.syncSettledPortfolio', () => {
  test('short-circuits an empty portfolio before build or upload', async () => {
    const service = new ServiceHardwarePortfolioSync({
      backgroundApi: {} as IBackgroundApi,
    });
    const payload: IPortfolioSyncSettledPayload = {
      accountAddress: '0x1234567890abcdef',
      accountId: 'evm--1',
      aggregateTokenMap: {},
      deviceConnectId: 'PRO2_CONNECT_ID',
      totalFiat: '0',
      totalTokenCount: 0,
      tokenMap: {},
      tokens: [],
      walletId: 'hw-1',
      walletType: 'hw',
    };

    await (
      service as unknown as {
        syncSettledPortfolio: (
          eventPayload: IPortfolioSyncSettledPayload,
        ) => Promise<void>;
      }
    ).syncSettledPortfolio(payload);

    expect(currencyPersistAtom.get).not.toHaveBeenCalled();
    expect(accountUtils.isHwWallet).not.toHaveBeenCalled();
    await expect(service.getLastPortfolioSyncResultForDev()).resolves.toEqual(
      expect.objectContaining({
        deviceConnectId: 'PRO2_CONNECT_ID',
        status: 'empty',
        totalTokenCount: 0,
        walletId: 'hw-1',
      }),
    );
  });
});
