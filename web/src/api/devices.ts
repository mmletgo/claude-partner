/**
 * Device API - 局域网设备列表与本机健康检查
 *
 * Business Logic（为什么需要这个模块）:
 *   前端需要获取局域网内其他设备列表，以及获取本机设备信息用于"本机信息"卡片展示。
 *
 * Code Logic（这个模块做什么）:
 *   封装两个 HTTP 调用：list 获取对端设备列表，health 获取本机运行状态和设备标识。
 */

import { api } from './client';
import type { Device } from '@/lib/types';

/** 后端 /api/health 返回的原始字段（snake_case） */
export interface HealthResponse {
  ok: boolean;
  device_id: string;
  device_name: string;
  http_port: number;
  ts: number;
}

export const devicesApi = {
  /** 获取局域网内已发现的设备列表 */
  list: () => api.get<Device[]>('/api/devices'),
  /** 获取本机健康状态，包含设备 ID、名称和端口 */
  health: () => api.get<HealthResponse>('/api/health'),
};
