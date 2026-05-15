import { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import {
  getUsername, setUsername,
  getAssignedRepos, setAssignedRepos,
  getSlackDmUserId, setSlackDmUserId,
} from '../store';
import { getToken, setToken, fetchReposWithPermissions, type RepoWithPermission } from '../github';
import {
  getSlackToken, setSlackToken,
  getSlackChannel, setSlackChannel,
  testConnection, isElectron,
} from '../slack';
import {
  getAnthropicKey, setAnthropicKey,
  getGeminiKey, setGeminiKey,
  getProvider, setProvider,
  testApiKey,
  type Provider,
} from '../ai';

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
  borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: 'var(--text)',
  marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid var(--border)',
};

export default function SettingsAccountPage({ bell, back }: { bell?: React.ReactNode; back?: React.ReactNode }) {
  const [name, setName] = useState(getUsername());
  const [token, setTokenVal] = useState(getToken() ?? '');

  const [repoOptions, setRepoOptions] = useState<RepoWithPermission[]>([]);
  const [selected, setSelected] = useState<string[]>(getAssignedRepos());
  const [reposLoading, setReposLoading] = useState(false);

  const [slackToken, setSlackTokenVal] = useState(getSlackToken());
  const [slackChannel, setSlackChannelVal] = useState(getSlackChannel());
  const [slackDmUserId, setSlackDmUserIdVal] = useState(getSlackDmUserId());
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackResult, setSlackResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [anthropicKey, setAnthropicKeyVal] = useState(getAnthropicKey());
  const [geminiKey, setGeminiKeyVal] = useState(getGeminiKey());
  const [provider, setProviderVal] = useState<Provider>(getProvider());
  const [aiTesting, setAiTesting] = useState(false);
  const [aiResult, setAiResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    setReposLoading(true);
    fetchReposWithPermissions()
      .then((list) => {
        setRepoOptions(list);
        if (getAssignedRepos().length === 0) {
          const defaults = list.filter((r) => r.permission !== 'read').map((r) => r.name);
          setSelected(defaults);
          setAssignedRepos(defaults);
        }
      })
      .catch(() => setRepoOptions([]))
      .finally(() => setReposLoading(false));
  }, []);

  const toggleRepo = (name: string) => {
    setSelected((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      setAssignedRepos(next);
      return next;
    });
  };

  const handleSave = () => {
    setUsername(name.trim());
    setToken(token.trim());
    setSlackToken(slackToken.trim());
    setSlackChannel(slackChannel.trim());
    setSlackDmUserId(slackDmUserId.trim());
    setAnthropicKey(anthropicKey.trim());
    setGeminiKey(geminiKey.trim());
    setProvider(provider);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSlackTest = async () => {
    setSlackToken(slackToken.trim());
    setSlackChannel(slackChannel.trim());
    setSlackTesting(true);
    setSlackResult(null);
    const r = await testConnection();
    if (r.ok) setSlackResult({ ok: true, msg: `연결 성공 — #${r.channelName}` });
    else setSlackResult({ ok: false, msg: r.error });
    setSlackTesting(false);
  };

  const handleAiTest = async () => {
    setAnthropicKey(anthropicKey.trim());
    setGeminiKey(geminiKey.trim());
    setProvider(provider);
    setAiTesting(true);
    setAiResult(null);
    const r = await testApiKey(provider);
    if (r.ok) setAiResult({ ok: true, msg: '연결 성공' });
    else setAiResult({ ok: false, msg: r.error });
    setAiTesting(false);
  };

  return (
    <main className="main-content">
      <div className="main-header"><span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}계정</span>{bell}</div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

          {/* 계정 정보 */}
          <section>
            <h3 style={sectionTitleStyle}>계정 정보</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>이름</label>
                <input
                  style={inputStyle}
                  placeholder="이름을 입력하세요"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>GitHub Token</label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={token}
                  onChange={(e) => setTokenVal(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>repo, read:org 권한 필요</p>
              </div>
            </div>
          </section>

          {/* 담당 프로젝트 */}
          <section>
            <h3 style={sectionTitleStyle}>담당 프로젝트</h3>

            {/* GitHub 레포 */}
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>담당 GitHub 레포지토리</label>
              <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -2, marginBottom: 6 }}>
                쓰기 / 관리자 권한이 있는 레포가 기본으로 담당 등록됩니다. 다른 레포도 클릭으로 추가/제외할 수 있습니다.
              </p>
              {reposLoading && (
                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>레포 목록 불러오는 중…</p>
              )}
              {!reposLoading && repoOptions.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  접근 가능한 레포가 없습니다.
                </p>
              )}
              {repoOptions.length > 0 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 6, maxHeight: 280, overflowY: 'auto',
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: 10,
                }}>
                  {repoOptions.map((r) => {
                    const isSelected = selected.includes(r.name);
                    return (
                      <button
                        key={r.name}
                        onClick={() => toggleRepo(r.name)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          fontSize: 12, color: 'var(--text-muted)',
                          padding: '4px 6px', borderRadius: 4,
                          background: 'transparent', border: 'none', cursor: 'pointer',
                          textAlign: 'left', width: '100%',
                          fontFamily: 'inherit',
                        }}
                      >
                        <span
                          style={{
                            width: 16, height: 16, flexShrink: 0,
                            borderRadius: 3,
                            background: isSelected ? 'rgba(52,211,153,0.15)' : 'transparent',
                            border: `1px solid ${isSelected ? 'rgba(52,211,153,0.4)' : 'var(--border-strong)'}`,
                            color: 'var(--success)',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} />}
                        </span>
                        <span style={{
                          flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          opacity: isSelected ? 1 : 0.6,
                        }}>
                          {r.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                {selected.length}개 선택됨 / 총 {repoOptions.length}개
              </p>
            </div>
          </section>

          {/* Slack 연동 */}
          <section>
            <h3 style={sectionTitleStyle}>Slack 연동 (에러 로그 수집)</h3>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8, marginBottom: 14 }}>
              지정한 채널에서 에러 메시지를 받아옵니다. Bot Token에 <code>channels:history</code> / <code>channels:read</code> 스코프가 필요하고, 봇이 채널에 초대되어 있어야 합니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>Bot Token</label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  type="password"
                  placeholder="xoxb-..."
                  value={slackToken}
                  onChange={(e) => setSlackTokenVal(e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Channel ID</label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  placeholder="C0123ABCDEF"
                  value={slackChannel}
                  onChange={(e) => setSlackChannelVal(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  Slack 채널 우클릭 → "Copy link" → URL 끝의 ID
                </p>
              </div>
              <div>
                <label style={labelStyle}>내 Slack 유저 ID <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(오버나이트 브리핑 DM)</span></label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  placeholder="U0123ABCDEF"
                  value={slackDmUserId}
                  onChange={(e) => setSlackDmUserIdVal(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
                  Slack 프로필 → 더보기 → 멤버 ID 복사 (U로 시작)
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleSlackTest}
                  disabled={slackTesting || !isElectron()}
                  style={{
                    padding: '8px 16px', fontSize: 12, borderRadius: 6,
                    background: 'transparent', color: 'var(--text)',
                    border: '1px solid var(--border-strong)',
                    cursor: slackTesting || !isElectron() ? 'not-allowed' : 'pointer',
                    opacity: slackTesting || !isElectron() ? 0.5 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {slackTesting && <Loader2 size={12} className="spinner" />}
                  연결 테스트
                </button>
                {!isElectron() && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    데스크톱 앱에서만 동작 (브라우저 모드 비활성)
                  </span>
                )}
                {slackResult && (
                  <span style={{
                    fontSize: 12,
                    color: slackResult.ok ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {slackResult.msg}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* AI 원인 분석 */}
          <section>
            <h3 style={sectionTitleStyle}>AI 원인 분석</h3>
            <p style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8, marginBottom: 14 }}>
              에러 로그에서 "AI 분석" 버튼을 누르면 GitHub 코드 검색 결과와 함께 LLM에 전달해 <strong>에러 지점(파일:라인)</strong>을 찾습니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={labelStyle}>사용할 공급자</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['gemini', 'anthropic'] as Provider[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setProviderVal(p)}
                      style={{
                        padding: '8px 16px', fontSize: 12, borderRadius: 6,
                        background: provider === p ? 'rgba(59,130,246,0.15)' : 'var(--bg-input)',
                        color: provider === p ? 'var(--accent)' : 'var(--text-muted)',
                        border: `1px solid ${provider === p ? 'var(--accent)' : 'var(--border)'}`,
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      {p === 'gemini' ? 'Google Gemini (무료)' : 'Anthropic Claude (유료)'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={labelStyle}>
                  Gemini API Key
                  <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer"
                    style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                    발급 ↗
                  </a>
                </label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  type="password"
                  placeholder="AIza..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKeyVal(e.target.value)}
                />
                <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  무료 한도: 분당 10회 / 일 250회 (gemini-2.5-flash)
                </p>
              </div>

              <div>
                <label style={labelStyle}>
                  Anthropic API Key
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                    style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}>
                    발급 ↗
                  </a>
                </label>
                <input
                  style={{ ...inputStyle, fontFamily: 'monospace' }}
                  type="password"
                  placeholder="sk-ant-..."
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKeyVal(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleAiTest}
                  disabled={aiTesting || !isElectron()}
                  style={{
                    padding: '8px 16px', fontSize: 12, borderRadius: 6,
                    background: 'transparent', color: 'var(--text)',
                    border: '1px solid var(--border-strong)',
                    cursor: aiTesting || !isElectron() ? 'not-allowed' : 'pointer',
                    opacity: aiTesting || !isElectron() ? 0.5 : 1,
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {aiTesting && <Loader2 size={12} className="spinner" />}
                  연결 테스트 ({provider === 'gemini' ? 'Gemini' : 'Anthropic'})
                </button>
                {!isElectron() && (
                  <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    데스크톱 앱 전용
                  </span>
                )}
                {aiResult && (
                  <span style={{
                    fontSize: 12,
                    color: aiResult.ok ? 'var(--success)' : 'var(--danger)',
                  }}>
                    {aiResult.msg}
                  </span>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* 저장 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
          <button
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 500, borderRadius: 6,
              background: saved ? 'rgba(52,211,153,0.15)' : 'var(--accent)',
              color: saved ? 'var(--success)' : '#fff',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onClick={handleSave}
          >
            {saved ? <><Check size={14} /> 저장됨</> : '저장'}
          </button>
        </div>
      </div>
    </main>
  );
}

