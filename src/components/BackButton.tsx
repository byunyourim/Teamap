import { ArrowLeft } from 'lucide-react';

export default function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="뒤로"
      style={{
        background: 'transparent', border: 'none',
        color: 'var(--text-muted)', cursor: 'pointer',
        padding: 6, marginRight: 4, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <ArrowLeft size={16} />
    </button>
  );
}
