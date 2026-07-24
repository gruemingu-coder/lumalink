interface SelectOption<T extends string | number> {
  value: T;
  label: string;
}

interface SelectProps<T extends string | number> {
  id: string;
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  description?: string;
}

export function Select<T extends string | number>({
  id,
  label,
  value,
  options,
  onChange,
  description,
}: SelectProps<T>) {
  return (
    <div className="py-1">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-200">
        {label}
      </label>
      {description && <p className="mb-1.5 text-xs text-slate-500">{description}</p>}
      <select
        id={id}
        value={value}
        onChange={(e) => {
          const raw = e.target.value;
          const match = options.find((o) => String(o.value) === raw);
          if (match) onChange(match.value);
        }}
        className="w-full rounded-xl border border-base-600 bg-base-900 px-3 py-2.5 text-sm text-slate-100 focus:border-brand-500"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
