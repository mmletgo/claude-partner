/**
 * Device API - 局域网设备列表
 */

import { api } from './client';
import type { Device } from '@/lib/types';

export const devicesApi = {
  list: () => api.get<Device[]>('/api/devices'),
  health: () => api.get<{ ok: boolean }>('/api/health'),
};
