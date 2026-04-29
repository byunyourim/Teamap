import { useState } from 'react';
import { Check } from 'lucide-react';
import { getUsername, setUsername } from '../store';
import { getToken, setToken } from '../github';

export default function SettingsAccountPage({ bell }: { bell?: React.ReactNode }) {
  const [name, setName] = useState(getUsername());
  const [token, setTokenVal] = useState(getToken() ?? '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setUsername(name.trim());
    setToken(token.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <main className="main-content">
      <div className="main-header"><span>계정</span>{bell}</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px', maxWidth: 480 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>이름</label>
            <input
              style={{
                width: '100%', background: '#1a2236', color: '#e2e8f0', fontSize: 13,
                borderRadius: 6, padding: '10px 12px', border: '1px solid #232f45',
                outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
              placeholder="이름을 입력하세요"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#334155'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#232f45'; }}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 6 }}>GitHub Token</label>
            <input
              style={{
                width: '100%', background: '#1a2236', color: '#e2e8f0', fontSize: 13,
                borderRadius: 6, padding: '10px 12px', border: '1px solid #232f45',
                outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box',
              }}
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={token}
              onChange={(e) => setTokenVal(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#334155'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#232f45'; }}
            />
            <p style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>repo, read:org 권한 필요</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              style={{
                padding: '8px 20px', fontSize: 13, fontWeight: 500, borderRadius: 6,
                background: saved ? 'rgba(52,211,153,0.15)' : '#3b82f6',
                color: saved ? '#34d399' : '#fff',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
              onClick={handleSave}
            >
              {saved ? <><Check size={14} /> 저장됨</> : '저장'}
            </button>
          </div>

        </div>
      </div>
    </main>
  );
}
