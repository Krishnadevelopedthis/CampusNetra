import { create } from 'zustand'

/**
 * Whether the assistant chat is open, shared so the QR button can step aside:
 * on a phone the chat covers the screen and the scan button floated over it.
 */
export const useAssistantStore = create((set) => ({
  open: false,
  setOpen: (v) => set((s) => ({ open: typeof v === 'function' ? v(s.open) : v })),
}))
