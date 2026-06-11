/**
 * Prompt API - 与后端 aiohttp handlers 对接
 */

import { api } from './client';
import type { Prompt } from '@/lib/types';

export const promptsApi = {
  list: () => api.get<Prompt[]>('/api/prompts'),
  get: (id: string) => api.get<Prompt>(`/api/prompts/${id}`),
  create: (data: { title: string; content: string; tags?: string[] }) =>
    api.post<Prompt>('/api/prompts', data),
  update: (id: string, data: Partial<Prompt>) => api.put<Prompt>(`/api/prompts/${id}`, data),
  remove: (id: string) => api.del<void>(`/api/prompts/${id}`),
  sync: () => api.post<{ synced: number }>('/api/sync', {}),
  listTags: () => api.get<string[]>('/api/prompts/tags'),
};
