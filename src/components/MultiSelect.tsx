import { useState, useRef, useEffect } from 'react';

interface Props {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export default function MultiSelect({ options, selected, onChange, placeholder = '전체' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter((s) => s !== val));
    else onChange([...selected, val]);
  };

  const label = selected.length === 0 ? placeholder : `${selected.length}개 레포`;

  return (
    <div ref={ref} className="multi-select-wrap">
      <button className="multi-select-trigger" onClick={() => setOpen(!open)}>
        {label}
        <span className="multi-select-arrow">&#9662;</span>
      </button>
      {open && (
        <div className="multi-select-dropdown">
          <div
            className="multi-select-item"
            onClick={() => onChange([])}
          >
            <span className={`multi-select-check ${selected.length === 0 ? 'checked' : ''}`} />
            <span>전체</span>
          </div>
          {options.map((opt) => (
            <div
              key={opt}
              className="multi-select-item"
              onClick={() => toggle(opt)}
            >
              <span className={`multi-select-check ${selected.includes(opt) ? 'checked' : ''}`} />
              <span>{opt}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
