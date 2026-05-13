import { useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ExternalLink, Wallet, AlertTriangle, Activity, ShieldOff, Pause,
} from 'lucide-react';
import {
  getAssignedWallets, setAssignedWallets,
  getAssignedContracts, setAssignedContracts,
  getWalletGasThreshold, setWalletGasThreshold,
  type ChainAddress,
} from '../store';
import { explorerUrl, explorerAddressUrl } from '../slack';

const CHAINS = ['Sepolia', 'Fuji', 'KCP'];
const NATIVE_SYMBOL: Record<string, string> = {
  Sepolia: 'ETH',
  Fuji: 'AVAX',
  KCP: 'KCP',
};

type Tab = 'lookup' | 'wallets' | 'pending' | 'failed' | 'contracts';

export default function OnchainMonitorPage({ bell, back, initialChain, initialHash }: {
  bell?: React.ReactNode;
  back?: React.ReactNode;
  initialChain?: string;
  initialHash?: string;
}) {
  const [tab, setTab] = useState<Tab>('lookup');

  return (
    <main className="main-content">
      <div className="main-header">
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{back}온체인 모니터링</span>
        {bell}
      </div>

      <div className="tasks-toolbar">
        <div className="tasks-tabs">
          <TabBtn id="lookup" active={tab === 'lookup'} onClick={() => setTab('lookup')}>
            Tx 검색
          </TabBtn>
          <TabBtn id="wallets" active={tab === 'wallets'} onClick={() => setTab('wallets')}>
            운영 지갑
          </TabBtn>
          <TabBtn id="pending" active={tab === 'pending'} onClick={() => setTab('pending')}>
            Pending Tx
          </TabBtn>
          <TabBtn id="failed" active={tab === 'failed'} onClick={() => setTab('failed')}>
            실패 Tx
          </TabBtn>
          <TabBtn id="contracts" active={tab === 'contracts'} onClick={() => setTab('contracts')}>
            컨트랙트 상태
          </TabBtn>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px 28px' }}>
        {tab === 'lookup' && <LookupTab initialChain={initialChain} initialHash={initialHash} />}
        {tab === 'wallets' && <WalletsTab />}
        {tab === 'pending' && <PendingTxTab />}
        {tab === 'failed' && <FailedTxTab />}
        {tab === 'contracts' && <ContractsTab />}

        {tab !== 'lookup' && (
          <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 24 }}>
            ※ 잔고 / Pending / 실패 / 컨트랙트 데이터는 현재 시뮬레이션입니다. RPC / Etherscan API 연동은 향후 작업.
          </p>
        )}
      </div>
    </main>
  );
}

/* ─── Tx 검색 ─── */

function resolveChainName(chainId?: string): string {
  if (!chainId) return CHAINS[CHAINS.length - 1];
  const map: Record<string, string> = {
    '11155111': 'Sepolia',
    '43113': 'Fuji',
    '56357': 'KCP',
  };
  const name = map[chainId] ?? chainId;
  return CHAINS.includes(name) ? name : CHAINS[CHAINS.length - 1];
}

function LookupTab({ initialChain, initialHash }: { initialChain?: string; initialHash?: string }) {
  const [chain, setChain] = useState(resolveChainName(initialChain));
  const [hash, setHash] = useState(initialHash || '');
  const [history, setHistory] = useState<{ chain: string; hash: string; ts: number }[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('teamap_tx_lookup_history') ?? '[]');
    } catch {
      return [];
    }
  });

  const [autoOpened, setAutoOpened] = useState(false);

  const open = (c: string, h: string) => {
    const url = explorerUrl(c, h);
    if (!url) {
      alert('Explorer URL 매핑이 없는 체인입니다.');
      return;
    }
    window.open(url, '_blank');
    const next = [{ chain: c, hash: h, ts: Date.now() }, ...history.filter((x) => x.hash !== h)].slice(0, 10);
    setHistory(next);
    localStorage.setItem('teamap_tx_lookup_history', JSON.stringify(next));
  };

  useEffect(() => {
    if (initialHash && !autoOpened) {
      setAutoOpened(true);
      const c = resolveChainName(initialChain);
      open(c, initialHash.startsWith('0x') ? initialHash : `0x${initialHash}`);
    }
  }, [initialHash]);

  const openAddress = (c: string, addr: string) => {
    const url = explorerAddressUrl(c, addr);
    if (!url) {
      alert('Explorer URL 매핑이 없는 체인입니다.');
      return;
    }
    window.open(url, '_blank');
  };

  const submit = () => {
    const h = hash.trim();
    if (!h) return;
    // 주소(40자)면 주소 페이지, 64자면 트랜잭션 페이지
    const clean = h.replace(/^0x/i, '');
    if (clean.length === 40) openAddress(chain, h.startsWith('0x') ? h : `0x${h}`);
    else open(chain, h.startsWith('0x') ? h : `0x${h}`);
    setHash('');
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
        Tx Hash / 주소 빠른 조회
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
        해시 또는 주소를 붙여넣고 Enter — 해당 체인 Explorer 새 창으로 열립니다.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <select value={chain} onChange={(e) => setChain(e.target.value)} style={{ ...inputStyle, width: 140, flex: 'none' }}>
          {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          autoFocus
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          placeholder="0x... (Tx hash 64자 또는 주소 40자)"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        <button onClick={submit} style={addBtnStyle}>조회 ↗</button>
      </div>

      {history.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{
            fontSize: 11, color: 'var(--text-faint)',
            textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
          }}>
            최근 조회
          </div>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
            display: 'flex', flexDirection: 'column',
          }}>
            {history.map((h, i) => (
              <button
                key={i}
                onClick={() => open(h.chain, h.hash)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', textAlign: 'left',
                  background: 'transparent', border: 'none',
                  borderBottom: i === history.length - 1 ? 'none' : '1px solid var(--border)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                  background: 'var(--bg-input)', color: 'var(--text-muted)',
                  border: '1px solid var(--border)', flexShrink: 0,
                }}>
                  {h.chain}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text)', fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {h.hash}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {new Date(h.ts).toLocaleString('ko-KR', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── 운영 지갑 ─── */

function WalletsTab() {
  const [wallets, setWallets] = useState<ChainAddress[]>(getAssignedWallets());
  const [threshold, setThresholdLocal] = useState(getWalletGasThreshold());
  const [chain, setChain] = useState(CHAINS[0]);
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  // 잔고 시뮬레이션 (주소별 고정 시드)
  const balances = useMemo(() => simulateBalances(wallets), [wallets.map((w) => w.address).join(',')]);

  const persist = (next: ChainAddress[]) => {
    setWallets(next);
    setAssignedWallets(next);
  };

  const add = () => {
    if (!addr.trim()) return;
    persist([...wallets, { chain, address: addr.trim(), label: label.trim() || undefined }]);
    setAddr('');
    setLabel('');
  };

  const remove = (i: number) => {
    if (!window.confirm('이 지갑을 삭제할까요?')) return;
    persist(wallets.filter((_, idx) => idx !== i));
  };

  const saveThreshold = (v: number) => {
    setThresholdLocal(v);
    setWalletGasThreshold(v);
  };

  return (
    <>
      {/* 임계값 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 16, padding: 12,
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
      }}>
        <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>가스비 경고 임계값</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={threshold}
          onChange={(e) => saveThreshold(Number(e.target.value) || 0)}
          style={{ ...inputStyle, width: 90, padding: '4px 8px' }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          (Native 토큰 단위. 이 값보다 잔고가 적으면 빨간색 표시 + 알림)
        </span>
      </div>

      {/* 지갑 추가 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={chain} onChange={(e) => setChain(e.target.value)} style={{ ...inputStyle, width: 130 }}>
          {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          style={{ ...inputStyle, fontFamily: 'monospace' }}
          placeholder="0x..."
          value={addr}
          onChange={(e) => setAddr(e.target.value)}
        />
        <input
          style={{ ...inputStyle, width: 160 }}
          placeholder="라벨 (선택)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button onClick={add} style={addBtnStyle}><Plus size={14} /> 추가</button>
      </div>

      {/* 잔고 카드 */}
      {wallets.length === 0 ? (
        <EmptyState icon={<Wallet size={28} />} message="등록된 지갑이 없습니다." hint="Bot이 모니터링할 운영 지갑을 추가하세요." />
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12,
        }}>
          {wallets.map((w, i) => {
            const bal = balances[i] ?? 0;
            const symbol = NATIVE_SYMBOL[w.chain] ?? '';
            const low = bal < threshold;
            const addrUrl = explorerAddressUrl(w.chain, w.address);
            return (
              <div key={i} style={{
                background: 'var(--bg-card)', border: `1px solid ${low ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                borderRadius: 10, padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 2 }}>{w.chain}</div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                      {w.label || <span style={{ color: 'var(--text-dim)' }}>(라벨 없음)</span>}
                    </div>
                  </div>
                  <button onClick={() => remove(i)} style={miniIconBtn} title="삭제">
                    <Trash2 size={12} />
                  </button>
                </div>
                {addrUrl ? (
                  <a href={addrUrl} target="_blank" rel="noreferrer" style={{
                    display: 'block',
                    fontFamily: 'monospace', fontSize: 11, color: 'var(--accent)',
                    marginBottom: 10, wordBreak: 'break-all', textDecoration: 'none',
                  }}>
                    {w.address} ↗
                  </a>
                ) : (
                <div style={{
                  fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)',
                  marginBottom: 10, wordBreak: 'break-all',
                }}>
                  {w.address}
                </div>
                )}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontSize: 22, fontWeight: 600,
                    color: low ? 'var(--danger)' : 'var(--text)',
                  }}>
                    {bal.toFixed(4)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{symbol}</span>
                  {low && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, fontWeight: 600,
                      padding: '2px 6px', borderRadius: 3,
                      background: 'rgba(239,68,68,0.12)', color: 'var(--danger)',
                      border: '1px solid rgba(239,68,68,0.3)',
                    }}>
                      LOW
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ─── Pending Tx ─── */

function PendingTxTab() {
  const wallets = getAssignedWallets();
  const txs = useMemo(() => simulatePending(wallets), [wallets.map((w) => w.address).join(',')]);

  if (wallets.length === 0) {
    return <EmptyState icon={<Activity size={28} />} message="등록된 지갑이 없습니다." hint="운영 지갑 탭에서 먼저 등록하세요." />;
  }
  if (txs.length === 0) {
    return <EmptyState icon={<Activity size={28} />} message="Pending 트랜잭션이 없습니다." hint="" />;
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>체인</th>
          <th style={thStyle}>From</th>
          <th style={thStyle}>Tx Hash</th>
          <th style={thStyle}>대기 시간</th>
          <th style={thStyle}>상태</th>
        </tr>
      </thead>
      <tbody>
        {txs.map((t) => (
          <tr key={t.txHash} style={{ borderTop: '1px solid var(--border)' }}>
            <td style={tdStyle}>{t.chain}</td>
            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{shorten(t.from)}</td>
            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>
              <a href={explorerUrl(t.chain, t.txHash) ?? '#'} target="_blank" rel="noreferrer"
                 style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {shorten(t.txHash)} <ExternalLink size={10} />
              </a>
            </td>
            <td style={tdStyle}>{formatDuration(t.pendingMs)}</td>
            <td style={tdStyle}>
              {t.pendingMs > 30 * 60 * 1000 ? (
                <span style={badge('danger')}>지연 (30분+)</span>
              ) : t.pendingMs > 10 * 60 * 1000 ? (
                <span style={badge('warning')}>주의 (10분+)</span>
              ) : (
                <span style={badge('muted')}>정상</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ─── 실패 Tx ─── */

function FailedTxTab() {
  const wallets = getAssignedWallets();
  const txs = useMemo(() => simulateFailed(wallets), [wallets.map((w) => w.address).join(',')]);

  if (wallets.length === 0) {
    return <EmptyState icon={<ShieldOff size={28} />} message="등록된 지갑이 없습니다." hint="운영 지갑 탭에서 먼저 등록하세요." />;
  }
  if (txs.length === 0) {
    return <EmptyState icon={<ShieldOff size={28} />} message="실패한 트랜잭션이 없습니다." hint="" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {txs.map((t) => (
        <div key={t.txHash} style={{
          background: 'var(--bg-card)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 8, padding: 14,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={badge('danger')}>FAILED</span>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{t.chain}</span>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                {new Date(t.timestamp).toLocaleString('ko-KR', { hour12: false })}
              </span>
            </div>
            <a href={explorerUrl(t.chain, t.txHash) ?? '#'} target="_blank" rel="noreferrer"
               style={{ color: 'var(--accent)', fontSize: 11, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={10} /> Explorer
            </a>
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text)', marginBottom: 6 }}>
            {t.txHash}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ color: 'var(--text-faint)' }}>Revert reason: </span>
            <code style={{ color: 'var(--danger)' }}>{t.reason}</code>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── 컨트랙트 상태 ─── */

function ContractsTab() {
  const [contracts, setContracts] = useState<ChainAddress[]>(getAssignedContracts());
  const [chain, setChain] = useState(CHAINS[0]);
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const states = useMemo(() => simulateContractStates(contracts), [contracts.map((c) => c.address).join(',')]);

  const persist = (next: ChainAddress[]) => {
    setContracts(next);
    setAssignedContracts(next);
  };
  const add = () => {
    if (!addr.trim()) return;
    persist([...contracts, { chain, address: addr.trim(), label: label.trim() || undefined }]);
    setAddr('');
    setLabel('');
  };
  const remove = (i: number) => {
    if (!window.confirm('이 컨트랙트를 삭제할까요?')) return;
    persist(contracts.filter((_, idx) => idx !== i));
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={chain} onChange={(e) => setChain(e.target.value)} style={{ ...inputStyle, width: 130 }}>
          {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input style={{ ...inputStyle, fontFamily: 'monospace' }} placeholder="0x..." value={addr} onChange={(e) => setAddr(e.target.value)} />
        <input style={{ ...inputStyle, width: 160 }} placeholder="라벨 (선택)" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button onClick={add} style={addBtnStyle}><Plus size={14} /> 추가</button>
      </div>

      {contracts.length === 0 ? (
        <EmptyState icon={<Pause size={28} />} message="등록된 컨트랙트가 없습니다." hint="모니터링할 컨트랙트 주소를 추가하세요." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {contracts.map((c, i) => {
            const s = states[i];
            return (
              <div key={i} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 8, padding: 14,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{c.chain}</span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                        {c.label || '(라벨 없음)'}
                      </span>
                      {s.paused && <span style={badge('warning')}>PAUSED</span>}
                      {!s.paused && <span style={badge('success')}>ACTIVE</span>}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-faint)', wordBreak: 'break-all' }}>
                      {c.address}
                    </div>
                  </div>
                  <button onClick={() => remove(i)} style={miniIconBtn} title="삭제">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10,
                  paddingTop: 10, borderTop: '1px dashed var(--border)',
                }}>
                  <KeyVal label="Owner" value={s.owner} mono />
                  <KeyVal label="Last Event" value={s.lastEvent} />
                  <KeyVal label="Tx 수 (24h)" value={s.txCount24h.toString()} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ─── 시뮬레이션 헬퍼 ─── */

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  return Math.abs(h);
}

function simulateBalances(wallets: ChainAddress[]): number[] {
  return wallets.map((w) => {
    const seed = hashCode(w.address) % 1000;
    return seed / 1000 * 5; // 0 ~ 5 native
  });
}

function simulatePending(wallets: ChainAddress[]) {
  return wallets.flatMap((w) => {
    const seed = hashCode(w.address);
    if (seed % 3 !== 0) return [];
    return [{
      chain: w.chain,
      from: w.address,
      txHash: '0x' + (seed.toString(16).padStart(8, '0').repeat(8)).slice(0, 64),
      pendingMs: ((seed % 60) + 5) * 60 * 1000,
    }];
  });
}

function simulateFailed(wallets: ChainAddress[]) {
  const reasons = [
    'execution reverted: insufficient balance',
    'execution reverted: ERC20InsufficientAllowance',
    'execution reverted: nonce too low',
    'gas required exceeds allowance',
  ];
  return wallets.flatMap((w) => {
    const seed = hashCode(w.address);
    if (seed % 4 !== 0) return [];
    return [{
      chain: w.chain,
      txHash: '0x' + ((seed * 7).toString(16).padStart(8, '0').repeat(8)).slice(0, 64),
      reason: reasons[seed % reasons.length],
      timestamp: Date.now() - (seed % 86400) * 1000,
    }];
  });
}

function simulateContractStates(contracts: ChainAddress[]) {
  return contracts.map((c) => {
    const seed = hashCode(c.address);
    return {
      paused: seed % 5 === 0,
      owner: '0x' + (seed * 13).toString(16).padStart(8, '0').repeat(5).slice(0, 40),
      lastEvent: ['Transfer', 'Approval', 'OwnershipTransferred', 'Paused'][seed % 4],
      txCount24h: seed % 500,
    };
  });
}

/* ─── 작은 컴포넌트 ─── */

function TabBtn({ active, onClick, children }: { id: Tab; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button className={`tasks-tab${active ? ' active' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

function KeyVal({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text)', fontFamily: mono ? 'monospace' : 'inherit', wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ icon, message, hint }: { icon: React.ReactNode; message: string; hint: string }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px',
      background: 'var(--bg-sidebar)', border: '1px dashed var(--border)', borderRadius: 8,
      color: 'var(--text-faint)',
    }}>
      <div style={{ marginBottom: 12 }}>{icon}</div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>{message}</p>
      {hint && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{hint}</p>}
    </div>
  );
}

/* ─── 헬퍼 ─── */

function shorten(addr: string): string {
  if (addr.length < 14) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  if (hr > 0) return `${hr}h ${min % 60}m`;
  if (min > 0) return `${min}m ${sec % 60}s`;
  return `${sec}s`;
}

function badge(variant: 'danger' | 'warning' | 'success' | 'muted'): React.CSSProperties {
  const colors = {
    danger: { bg: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: 'rgba(239,68,68,0.3)' },
    warning: { bg: 'rgba(245,158,11,0.12)', color: 'var(--warning)', border: 'rgba(245,158,11,0.3)' },
    success: { bg: 'rgba(16,185,129,0.12)', color: 'var(--success)', border: 'rgba(16,185,129,0.3)' },
    muted: { bg: 'rgba(100,116,139,0.12)', color: 'var(--text-muted)', border: 'rgba(100,116,139,0.3)' },
  }[variant];
  return {
    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 3,
    background: colors.bg, color: colors.color, border: `1px solid ${colors.border}`,
    display: 'inline-block',
  };
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-input)', color: 'var(--text)', fontSize: 13,
  borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  flex: 1,
};

const addBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '0 16px', fontSize: 13, fontWeight: 500, borderRadius: 6,
  background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const miniIconBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
  color: 'var(--text-faint)', cursor: 'pointer',
  width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const tableStyle: React.CSSProperties = {
  width: '100%', borderCollapse: 'collapse',
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--text-faint)',
  padding: '10px 14px', textTransform: 'uppercase', letterSpacing: 0.5,
  borderBottom: '1px solid var(--border)',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 13, color: 'var(--text)',
};
