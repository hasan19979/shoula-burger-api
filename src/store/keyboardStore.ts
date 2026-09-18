import { create } from 'zustand';

export type KeyboardMode = 'numeric' | 'text';

interface KeyboardState {
  active: boolean;
  mode: KeyboardMode;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  open: (params: { mode: KeyboardMode; value: string; onChange: (value: string) => void; onClose?: () => void }) => void;
  close: () => void;
  setValue: (value: string) => void;
}

export const useKeyboardStore = create<KeyboardState>((set, get) => ({
  active: false,
  mode: 'text',
  value: '',
  onChange: () => {},
  onClose: () => {},

  open: ({ mode, value, onChange, onClose }) => {
    set({ active: true, mode, value, onChange, onClose: onClose || (() => {}) });
  },

  close: () => {
    get().onClose();
    set({ active: false });
  },

  setValue: (value) => {
    set({ value });
    get().onChange(value);
  },
}));
