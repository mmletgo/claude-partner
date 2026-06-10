/**
 * Transfer API - 文件传输任务
 */

import { api } from './client';
import type { TransferTask } from '@/lib/types';

export const transferApi = {
  list: () => api.get<TransferTask[]>('/api/transfer/tasks'),
  send: (deviceId: string, filePath: string) =>
    api.post<TransferTask>('/api/transfer/send', { deviceId, filePath }),
  cancel: (taskId: string) => api.del<void>(`/api/transfer/tasks/${taskId}`),
};
