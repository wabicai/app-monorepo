import ServiceHardware from './ServiceHardware';

import type { IBackgroundApi } from '../../apis/IBackgroundApi';
import type { Features, SearchDevice } from '@onekeyfe/hd-core';

jest.mock('@onekeyhq/shared/src/background/backgroundDecorators', () => ({
  backgroundClass: () => (target: unknown) => target,
  backgroundMethod:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
  backgroundMethodForDev:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
  toastIfError:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));

jest.mock('@onekeyhq/shared/src/eventBus/appEventBus', () => ({
  EAppEventBusNames: {
    SyncDeviceLabelToWalletName: 'SyncDeviceLabelToWalletName',
    UpdateWalletAvatarByDeviceSerialNo: 'UpdateWalletAvatarByDeviceSerialNo',
  },
  appEventBus: {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
  },
}));

jest.mock('@onekeyhq/shared/src/platformEnv', () => ({
  __esModule: true,
  default: {
    isDesktop: true,
    isJest: true,
    isNative: false,
    isSupportDesktopBle: false,
  },
}));

jest.mock('@onekeyhq/shared/src/utils/deviceHomeScreenUtils', () => ({
  __esModule: true,
  DEFAULT_T1_HOME_SCREEN_INFORMATION: {},
  T1_HOME_SCREEN_DEFAULT_IMAGES: [],
  default: {},
}));

jest.mock('../../dbs/local/localDb', () => ({
  __esModule: true,
  default: {
    getDeviceByQuery: jest.fn(),
  },
}));

jest.mock('../../states/jotai/atoms', () => ({
  EHardwareUiStateAction: {},
  hardwareForceTransportAtom: {
    get: jest.fn(async () => ({ forceTransportType: undefined })),
  },
  hardwareUiStateAtom: {},
  hardwareUiStateCompletedAtom: {},
  settingsPersistAtom: {},
}));

function buildDevice({
  features,
  connectProtocol,
}: {
  features?: Features;
  connectProtocol?: 'V1' | 'V2';
}) {
  return {
    connectId: 'USB_SERIAL',
    uuid: 'DEVICE_SERIAL',
    deviceId: 'DEVICE_ID',
    deviceType: 'pro',
    name: 'OneKey Pro',
    commType: 'webusb',
    features,
    connectProtocol,
  } as unknown as SearchDevice;
}

describe('ServiceHardware.connect WebUSB reuse', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('复用首次 WebUSB 通讯结果，后续调用固定已探测协议', async () => {
    const service = new ServiceHardware({
      backgroundApi: {} as IBackgroundApi,
    });
    jest
      .spyOn(service, 'getCompatibleConnectId')
      .mockResolvedValue('USB_SERIAL');
    const connectDevice = jest
      .spyOn(service, 'connectDevice')
      .mockResolvedValue({ label: 'OneKey Pro' } as Features);
    const features = { label: 'OneKey Pro' } as Features;

    await expect(
      service.connect({
        device: buildDevice({ features, connectProtocol: 'V1' }),
      }),
    ).resolves.toBe(features);
    expect(connectDevice).not.toHaveBeenCalled();

    await service.connect({
      device: buildDevice({}),
    });
    expect(connectDevice).toHaveBeenCalledWith({
      connectId: 'USB_SERIAL',
      params: { connectProtocol: 'V1' },
    });
  });

  it('不再吞掉 WebUSB 重连错误并伪装成成功', async () => {
    const service = new ServiceHardware({
      backgroundApi: {} as IBackgroundApi,
    });
    jest
      .spyOn(service, 'getCompatibleConnectId')
      .mockResolvedValue('USB_SERIAL');
    jest
      .spyOn(service, 'connectDevice')
      .mockRejectedValue(new Error('WebUSB reconnect failed'));

    await expect(
      service.connect({ device: buildDevice({ connectProtocol: 'V1' }) }),
    ).rejects.toThrow('WebUSB reconnect failed');
  });
});
