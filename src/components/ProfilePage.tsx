import { useState } from 'react';
import { getUsername, setUsername } from '../store';
import { Check } from 'lucide-react';

export default function ProfilePage({ bell }: { bell?: React.ReactNode }) {
  const [name, setName] = useState(getUsername());
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setUsername(name.trim());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <main className="main-content">
      <div className="main-header"><span>프로필</span>{bell}</div>
      <div className="profile-page">
        <div className="profile-card">
          <label className="profile-label">이름</label>
          <input
            className="profile-input"
            placeholder="이름을 입력하세요"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
          <button className="profile-save-btn" onClick={handleSave}>
            {saved ? <><Check size={14} /> 저장됨</> : '저장'}
          </button>
        </div>
      </div>
    </main>
  );
}
