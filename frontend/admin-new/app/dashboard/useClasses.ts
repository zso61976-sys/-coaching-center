'use client';

import { useCallback, useEffect, useState } from 'react';

/** Shown until the server answers, and what a new company starts with */
export const DEFAULT_CLASSES = ['9th', '10th', '11th', '12th'];

export interface ClassUsage {
  students: number;
  teachers: number;
  schedules: number;
}

/**
 * The company's class list, kept on the server so every computer sees the same classes.
 * `apiBase` is the API root including `/api`.
 */
export function useClasses(apiBase: string, token: string | null) {
  const [classes, setClasses] = useState<string[]>(DEFAULT_CLASSES);
  const [usage, setUsage] = useState<Record<string, ClassUsage>>({});

  const apply = (data: { classes: string[]; usage: Record<string, ClassUsage> }) => {
    setClasses(data.classes);
    setUsage(data.usage);
  };

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${apiBase}/admin/classes`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) apply((await res.json()).data);
    } catch {
      console.error('Failed to fetch classes');
    }
  }, [apiBase, token]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Saves the whole list; returns an error message, or null when it worked */
  const save = async (next: string[]): Promise<string | null> => {
    try {
      const res = await fetch(`${apiBase}/admin/classes`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ classes: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.message;
        return (Array.isArray(msg) ? msg.join(', ') : msg) || 'Could not save the classes';
      }
      apply(body.data);
      return null;
    } catch {
      return 'Could not reach the server';
    }
  };

  return { classes, usage, reload, save };
}
