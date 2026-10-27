'use client';

export function openHelpModal(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('srcpro:open-help'));
}

export function refreshWorkspace(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('srcpro:refresh'));
}
