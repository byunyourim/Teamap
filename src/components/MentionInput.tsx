import { useState, useRef, useEffect } from 'react';

interface Member {
  login: string;
  name: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  members: Member[];
  placeholder?: string;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
}

export default function MentionInput({ value, onChange, members, placeholder, rows = 3, className, autoFocus }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [filter, setFilter] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const ref = useRef<HTMLTextAreaElement>(null);

  const filtered = members.filter((m) =>
    m.login.toLowerCase().includes(filter.toLowerCase()) ||
    m.name.toLowerCase().includes(filter.toLowerCase())
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(text);

    const before = text.slice(0, cursor);
    const atMatch = before.match(/@(\w*)$/);
    if (atMatch) {
      setShowDropdown(true);
      setFilter(atMatch[1]);
      setMentionStart(cursor - atMatch[0].length);
    } else {
      setShowDropdown(false);
    }
  };

  const handleSelect = (login: string) => {
    const before = value.slice(0, mentionStart);
    const after = value.slice(ref.current?.selectionStart ?? mentionStart);
    const newVal = `${before}@${login} ${after}`;
    onChange(newVal);
    setShowDropdown(false);
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDropdown && e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  useEffect(() => {
    if (!showDropdown) return;
    const handleClick = () => setShowDropdown(false);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showDropdown]);

  return (
    <div className="mention-wrapper">
      <textarea
        ref={ref}
        className={className}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="mention-dropdown">
          {filtered.map((m) => (
            <div
              key={m.login}
              className="mention-item"
              onMouseDown={(e) => { e.preventDefault(); handleSelect(m.login); }}
            >
              <span className="mention-item-name">{m.name}</span>
              <span className="mention-item-login">@{m.login}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
