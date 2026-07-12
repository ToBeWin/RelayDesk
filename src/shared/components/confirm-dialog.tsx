"use client";

import { AlertTriangle, X } from "lucide-react";

export function ConfirmDialog({ open, title, description, confirmLabel = "确认", destructive = false, onConfirm, onCancel }: { open: boolean; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><header><span><AlertTriangle size={20} /></span><div><h2 id="confirm-title">{title}</h2><p>{description}</p></div><button type="button" aria-label="关闭确认窗口" onClick={onCancel}><X size={18} /></button></header><footer><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button type="button" className={destructive ? "danger-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button></footer></section></div>;
}

export function TextPromptDialog({ open, title, description, value, onChange, confirmLabel = "保存", onConfirm, onCancel }: { open: boolean; title: string; description: string; value: string; onChange: (value: string) => void; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  if (!open) return null;
  return <div className="confirm-backdrop" role="presentation"><section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title"><header><span><AlertTriangle size={20} /></span><div><h2 id="prompt-title">{title}</h2><p>{description}</p></div><button type="button" aria-label="关闭窗口" onClick={onCancel}><X size={18} /></button></header><label className="dialog-field">名称<input autoFocus value={value} onChange={(event) => onChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); onConfirm(); } }} /></label><footer><button type="button" className="secondary-button" onClick={onCancel}>取消</button><button type="button" className="primary-button" onClick={onConfirm} disabled={!value.trim()}>{confirmLabel}</button></footer></section></div>;
}
