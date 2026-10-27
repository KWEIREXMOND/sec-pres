'use client';

import React, { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, ChevronDown, Info, Loader2, X } from 'lucide-react';
import { classNames, initials, statusTone, titleCase } from '@/lib/format';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'gold' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-navy-900 text-white hover:bg-navy-800 shadow-soft',
  secondary: 'bg-navy-50 text-navy-800 hover:bg-navy-100',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-navy-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-soft',
  gold: 'bg-gold-400 text-navy-950 hover:bg-gold-300 shadow-soft',
  success: 'bg-moss-700 text-white hover:bg-moss-900',
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-sm',
  icon: 'h-10 w-10 p-0',
};

export function Button({ variant = 'primary', size = 'md', loading, icon, fullWidth, className, children, disabled, ...props }: ButtonProps) {
  return (
    <button
      className={classNames(
        'btn',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

interface LinkButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export function LinkButton({ href, variant = 'primary', size = 'md', icon, fullWidth, className, children, ...props }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={classNames('btn', buttonVariants[variant], buttonSizes[size], fullWidth && 'w-full', className)}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}

export function IconButton({ label, className, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={classNames('icon-btn', className)} {...props}>
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames('card', className)} {...props}>
      {children}
    </div>
  );
}

export function PageHeader({ title, description, eyebrow, actions }: { title: string; description?: string; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-gold-700">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-subtitle">{description}</p>}
      </div>
      {actions && <div className="row-actions">{actions}</div>}
    </div>
  );
}

export function SectionHeader({ title, description, action, className }: { title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={classNames('section-header', className)}>
      <div>
        <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ label, value, hint, tone = 'navy', icon, href }: { label: string; value: string | number; hint?: string; tone?: 'navy' | 'gold' | 'red' | 'green'; icon?: React.ReactNode; href?: string }) {
  const toneClass = {
    navy: 'from-navy-900 to-navy-700',
    gold: 'from-gold-600 to-gold-400',
    red: 'from-red-700 to-red-500',
    green: 'from-moss-900 to-moss-500',
  }[tone];
  const content = (
    <div className={classNames('stat-card', `bg-gradient-to-br ${toneClass}`)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-white/70">{label}</div>
          <div className="mt-2 text-3xl font-bold text-white">{value}</div>
          {hint && <div className="mt-2 text-xs text-white/75">{hint}</div>}
        </div>
        {icon && <div className="rounded-xl bg-white/15 p-2 text-white">{icon}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block">{content}</Link> : content;
}

export function Badge({ children, tone = 'navy', className, dot }: { children: React.ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' | 'muted'; className?: string; dot?: boolean }) {
  const toneClass = {
    navy: 'bg-navy-50 text-navy-700 border-navy-100',
    gold: 'bg-gold-50 text-gold-800 border-gold-200',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    muted: 'bg-slate-100 text-slate-600 border-slate-200',
  }[tone];
  return (
    <span className={classNames('badge', toneClass, className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge tone={statusTone(status)} className={className} dot>{titleCase(status)}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  return <Badge tone={priority === 'critical' || priority === 'urgent' ? 'red' : priority === 'high' ? 'gold' : priority === 'normal' ? 'navy' : 'muted'}>{titleCase(priority)}</Badge>;
}

export function Avatar({ name, color, size = 'md' }: { name: string; color?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = { sm: 'h-8 w-8 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-14 w-14 text-base' }[size];
  return (
    <div className={classNames('avatar', sizeClass)} style={{ backgroundColor: color || '#0b1f3a' }} aria-hidden="true">
      {initials(name)}
    </div>
  );
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={classNames('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin text-navy-700" />
      {label}
    </div>
  );
}

export function EmptyState({ title, description, icon, action }: { title: string; description?: string; icon?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="empty-state">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-700">{icon || <Info className="h-6 w-6" />}</div>
      <h3 className="mt-4 text-sm font-semibold text-navy-900">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  const styles = {
    info: 'border-navy-100 bg-navy-50 text-navy-900',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    warning: 'border-gold-200 bg-gold-50 text-gold-900',
    error: 'border-red-100 bg-red-50 text-red-900',
  }[tone];
  const Icon = tone === 'success' ? Check : tone === 'warning' || tone === 'error' ? AlertTriangle : Info;
  return (
    <div className={classNames('alert', styles)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        {title && <div className="text-sm font-semibold">{title}</div>}
        <div className="text-sm">{children}</div>
      </div>
      {action}
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, error, required, children, className }: FieldProps) {
  return (
    <div className={classNames('field', className)}>
      <label htmlFor={htmlFor} className="field-label">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
      {hint && !error && <p className="field-hint">{hint}</p>}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={classNames('input', className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={classNames('textarea', className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={classNames('input appearance-none pr-9', className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  );
});

export function SearchInput({ value, onChange, placeholder = 'Search records...', className }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={classNames('search-input', className)}>
      <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-slate-400" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/><path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {value && <button onClick={() => onChange('')} aria-label="Clear search"><X className="h-3.5 w-3.5" /></button>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (checked: boolean) => void; label: string; description?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className="toggle-row">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <input id={id} type="checkbox" className="toggle" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }[size];
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={classNames('modal-panel', width)} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <div>
            <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
            {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Close" onClick={onClose}><X className="h-5 w-5" /></IconButton>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange, className }: { tabs: Array<{ id: string; label: string; count?: number }>; active: string; onChange: (id: string) => void; className?: string }) {
  return (
    <div className={classNames('tabs', className)} role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} role="tab" aria-selected={active === tab.id} className={classNames('tab', active === tab.id && 'tab-active')} onClick={() => onChange(tab.id)}>
          {tab.label}
          {typeof tab.count === 'number' && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = 'navy' }: { value: number; tone?: 'navy' | 'gold' | 'green' | 'red' }) {
  const toneClass = { navy: 'bg-navy-700', gold: 'bg-gold-400', green: 'bg-moss-500', red: 'bg-red-600' }[tone];
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={classNames('h-full rounded-full transition-all', toneClass)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function TableWrap({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={classNames('table-wrap', className)}>{children}</div>;
}

export function KeyValue({ items }: { items: Array<{ label: string; value: React.ReactNode }> }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</dt>
          <dd className="mt-1 text-sm font-medium text-slate-800">{item.value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ items }: { items: Array<{ title: string; description?: string; date?: string }> }) {
  if (items.length === 0) return <div className="text-sm text-slate-400">No history has been recorded.</div>;
  return (
    <div className="timeline">
      {items.map((item, index) => (
        <div className="timeline-item" key={`${item.title}-${index}`}>
          <div className="text-sm font-semibold text-slate-800">{item.title}</div>
          {item.description && <div className="mt-0.5 text-xs text-slate-500">{item.description}</div>}
          {item.date && <div className="mt-1 text-[10px] uppercase tracking-wide text-slate-400">{item.date}</div>}
        </div>
      ))}
    </div>
  );
}

export function PrintableDocument({ title, organization, reference, content, footer }: { title: string; organization: string; reference?: string; content: string; footer?: string }) {
  return (
    <div className="print-document" id="print-document">
      <div className="print-letterhead">
        <div className="print-monogram">SRC</div>
        <div>
          <div className="text-sm font-bold uppercase tracking-widest text-navy-900">{organization}</div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Office of the Secretariat</div>
        </div>
      </div>
      <div className="mt-8 border-b border-slate-200 pb-4">
        <h2 className="font-serif text-xl font-bold text-navy-900">{title}</h2>
        {reference && <p className="mt-1 text-xs text-slate-500">Reference: {reference}</p>}
      </div>
      <div className="mt-6 whitespace-pre-wrap font-serif text-[13px] leading-7 text-slate-800">{content || 'No content has been written yet.'}</div>
      {footer && <div className="mt-10 border-t border-slate-200 pt-3 text-[10px] text-slate-400">{footer}</div>}
    </div>
  );
}
