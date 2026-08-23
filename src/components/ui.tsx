import Link from "next/link";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------- structure */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-[-0.02em]">
          {title}
        </h1>
        {/* Small, deliberate, and on every page: it is what makes the app look
            like one thing rather than a stack of forms. */}
        <span className="mt-2 block h-[3px] w-10 rounded-full bg-accent" />
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2 no-print">{actions}</div> : null}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-sm ${className}`}
    >
      {title || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border-b border-line bg-raise/60 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-bold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-muted">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mx-auto mt-1 max-w-md text-sm text-muted">{hint}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------------- values */

export function StatTile({
  label,
  value,
  hint,
  href,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "text-ink",
    good: "text-brand",
    warn: "text-accent",
    bad: "text-accent",
  }[tone];

  // A coloured edge along the top, so a wall of tiles has a rhythm and the one
  // that needs attention is findable without reading every label.
  const edge = {
    neutral: "before:bg-brand/45",
    good: "before:bg-brand",
    warn: "before:bg-accent/55",
    bad: "before:bg-accent",
  }[tone];

  const body = (
    <>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.09em] text-muted">
        {label}
      </p>
      <p className={`mt-1.5 text-[1.75rem] font-extrabold leading-none tabular-nums tracking-tight ${toneClass}`}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </>
  );

  const shell =
    "relative overflow-hidden rounded-xl border border-line bg-surface p-4 shadow-sm transition-colors " +
    "before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-[''] " +
    edge;

  return href ? (
    <Link href={href} className={`${shell} block hover:border-brand/50 hover:bg-raise`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "good" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    neutral: "bg-raise text-muted ring-line",
    brand: "bg-brand-soft text-brand-ink ring-brand/30",
    good: "bg-brand-soft text-brand-ink ring-brand/30",
    warn: "bg-accent-soft text-accent-ink ring-accent/30",
    // Over a limit is the one badge that should stop someone, so it is solid
    // rather than tinted — the same red, carrying more weight.
    bad: "bg-accent text-white ring-accent/60",
  }[tone];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ring-1 ring-inset ${tones} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * A limit bar. `value` and `limit` are in the same unit; the bar turns amber
 * past 80% and rose once the limit is exceeded, which is the only signal that
 * matters on the finance pages.
 */
export function LimitBar({
  value,
  limit,
  label,
  valueLabel,
  limitLabel,
}: {
  value: number;
  limit: number;
  label?: string;
  valueLabel: string;
  limitLabel: string;
}) {
  const pct = limit > 0 ? (value / limit) * 100 : 0;
  const over = value > limit;
  // One hue, three weights: comfortably inside is blue, close to the limit is
  // a muted red, over it is full strength. The figures beside the bar say which
  // is which in words, so the weight is a cue and never the only signal.
  const tone = over ? "bg-accent" : pct >= 80 ? "bg-accent/55" : "bg-brand";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted">
          <span className={over ? "font-semibold text-accent-ink" : "font-semibold text-ink"}>
            {valueLabel}
          </span>{" "}
          of {limitLabel}
        </span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-raise">
        <div
          className={`h-full rounded-full ${tone}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted">
        {over
          ? `${(pct - 100).toFixed(1)}% over the limit`
          : `${pct.toFixed(1)}% used`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------- tables */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="table-scroll -mx-4 px-4">
      <table className="w-full min-w-[36rem] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-line px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className = "",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <td className={`border-b border-line px-3 py-2 align-top ${className}`}>
      {children}
    </td>
  );
}

/* --------------------------------------------------------------------- forms */

export function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Select({
  name,
  options,
  defaultValue,
  includeBlank,
  blankLabel = "—",
  required,
  className = "",
}: {
  name: string;
  options: readonly { value: string | number; label: string }[];
  defaultValue?: string | number | null;
  includeBlank?: boolean;
  blankLabel?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <select
      name={name}
      required={required}
      defaultValue={defaultValue == null ? "" : String(defaultValue)}
      className={`field ${className}`}
    >
      {includeBlank ? <option value="">{blankLabel}</option> : null}
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Checkbox with a label, sized for thumbs on a phone at the door. */
export function Check({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-line accent-[var(--color-brand)]"
      />
      <span>{label}</span>
    </label>
  );
}

/** Inline note used for compliance disclaimers and data-quality warnings. */
export function Note({
  tone = "info",
  children,
}: {
  tone?: "info" | "warn" | "bad";
  children: ReactNode;
}) {
  const tones = {
    info: "border-line bg-raise text-muted",
    warn: "border-accent/40 bg-accent-soft text-accent-ink",
    bad: "border-accent/40 bg-accent-soft text-accent-ink",
  }[tone];

  return (
    <div className={`rounded-lg border px-3 py-2 text-xs leading-relaxed ${tones}`}>
      {children}
    </div>
  );
}
