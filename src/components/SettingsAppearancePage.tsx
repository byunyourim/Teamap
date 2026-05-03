import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { getTheme, setTheme, resolveTheme, type Theme } from '../theme';

const OPTIONS: { value: Theme; label: string; description: string; icon: React.ReactNode }[] = [
  { value: 'light',  label: 'Light',  description: '밝은 화면',          icon: <Sun size={18} /> },
  { value: 'dark',   label: 'Dark',   description: '어두운 화면',        icon: <Moon size={18} /> },
  { value: 'system', label: 'System', description: 'OS 설정 따라가기',   icon: <Monitor size={18} /> },
];

export default function SettingsAppearancePage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [theme, setThemeVal] = useState<Theme>(getTheme());
  const [resolved, setResolved] = useState(resolveTheme());

  useEffect(() => {
    setResolved(resolveTheme(theme));
  }, [theme]);

  const choose = (t: Theme) => {
    setThemeVal(t);
    setTheme(t);
  };

  return (
    <main className="main-content">
      <div className="main-header"><span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}테마</span>{bell}</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 720 }}>

          <section>
            <h3 style={{
              fontSize: 14, fontWeight: 600, color: 'var(--text)',
              marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
            }}>
              모드
            </h3>

            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
            }}>
              {OPTIONS.map((opt) => {
                const selected = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => choose(opt.value)}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 8,
                      padding: '16px', borderRadius: 8, cursor: 'pointer',
                      background: selected ? 'rgba(59,130,246,0.08)' : 'var(--bg-input)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'var(--text)',
                    }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 36, height: 36, borderRadius: 8,
                        background: selected ? 'rgba(59,130,246,0.12)' : 'var(--bg-hover)',
                        color: selected ? 'var(--accent)' : 'var(--text-muted)',
                      }}>
                        {opt.icon}
                      </span>
                      {selected && (
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                          background: 'rgba(59,130,246,0.15)', color: 'var(--accent)',
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {opt.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
              현재 적용 중: <strong>{resolved === 'dark' ? 'Dark' : 'Light'}</strong>
              {theme === 'system' && ' (OS 설정 기반)'}
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
