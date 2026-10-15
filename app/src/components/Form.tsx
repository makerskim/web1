import type { InputHTMLAttributes, ReactNode } from 'react';
import s from './Form.module.css';

// 아이폰 설정 화면처럼 하얀 묶음 안에 '이름 | 입력칸'을 같은 폭으로 맞춰요
export function Group({ title, footer, children }: { title?: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <section className={s.groupWrap}>
      {title && <h3 className={s.groupTitle}>{title}</h3>}
      <div className={s.group}>{children}</div>
      {footer && <p className={s.groupFoot}>{footer}</p>}
    </section>
  );
}

export function Field({ label, hint, ...rest }: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={s.row}>
      <span className={s.label}>{label}</span>
      <input className={s.input} {...rest} />
      {hint && <small className={s.hint}>{hint}</small>}
    </label>
  );
}

export function Row({ icon, label, detail, onClick, danger = false, chevron = true, children }: {
  icon?: ReactNode; label: ReactNode; detail?: ReactNode; onClick?: () => void; danger?: boolean; chevron?: boolean; children?: ReactNode;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`${s.row} ${s.nav} ${danger ? s.danger : ''}`} onClick={onClick} type={onClick ? 'button' : undefined}>
      {icon && <span className={s.icon}>{icon}</span>}
      <span className={s.navLabel}>{label}</span>
      {detail && <span className={s.detail}>{detail}</span>}
      {children}
      {onClick && chevron && <svg className={s.chev} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>}
    </Tag>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: Array<{ value: T; label: ReactNode }>; onChange: (v: T) => void; label: string;
}) {
  return (
    <div className={s.seg} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className={o.value === value ? s.segOn : ''} onClick={() => onChange(o.value)} data-value={o.value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
