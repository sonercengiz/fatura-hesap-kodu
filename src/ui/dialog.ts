import { signal } from '@preact/signals';

/** Uygulamanın kendi küçük pencereleri: ad sorma ve onay (tarayıcının çıplak prompt/confirm kutuları yerine) */
export interface NameDialog {
  kind: 'name';
  title: string;
  label?: string;
  placeholder?: string;
  initial?: string;
  hint?: string;
  okLabel?: string;
  /** Boş bırakılabilir mi (boş = kendiliğinden ad) */
  allowEmpty?: boolean;
  resolve: (v: string | null) => void;
}
export interface ConfirmDialog {
  kind: 'confirm';
  title: string;
  message: string;
  okLabel?: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
export const dialog = signal<NameDialog | ConfirmDialog | null>(null);

export function askName(opts: Omit<NameDialog, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => { dialog.value = { kind: 'name', ...opts, resolve }; });
}
export function askConfirm(opts: Omit<ConfirmDialog, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => { dialog.value = { kind: 'confirm', ...opts, resolve }; });
}
export function closeDialog(result: string | boolean | null) {
  const d = dialog.value;
  if (!d) return;
  dialog.value = null;
  if (d.kind === 'name') d.resolve(typeof result === 'string' ? result : null);
  else d.resolve(result === true);
}
