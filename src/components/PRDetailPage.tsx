import { useState, useEffect } from 'react';
import {
  ArrowLeft, Loader2, GitPullRequest, CheckCircle2, XCircle,
  Clock, FileEdit, ExternalLink, GitBranch, Plus, Minus,
  ChevronDown, ChevronRight, MessageSquare,
} from 'lucide-react';
import {
  fetchPRDetail, fetchPRFiles, fetchPRReviewComments,
  fetchIssueComments, fetchUserNames, fetchMyLogin, submitPRReview, addComment,
  type PRDetail, type PRFile, type PRReviewComment, type GitHubComment,
} from '../github';
import { cn } from '@/lib/utils';

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  return `${d}일 전`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getStatusLabel(pr: PRDetail) {
  if (pr.merged) return 'Merged';
  if (pr.state === 'closed') return 'Closed';
  if (pr.draft) return 'Draft';
  return 'Open';
}

function getStatusStyle(pr: PRDetail) {
  if (pr.merged) return { color: '#a78bfa', background: 'rgba(167,139,250,0.1)' };
  if (pr.state === 'closed') return { color: '#f87171', background: 'rgba(248,113,113,0.1)' };
  if (pr.draft) return { color: '#64748b', background: 'rgba(100,116,139,0.1)' };
  return { color: '#34d399', background: 'rgba(52,211,153,0.1)' };
}

function getReviewBadge(status: PRDetail['reviewStatus']) {
  if (status === 'approved') return { label: 'Approved', color: '#34d399', bg: 'rgba(52,211,153,0.1)', icon: <CheckCircle2 size={12} /> };
  if (status === 'changes_requested') return { label: 'Changes Requested', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', icon: <XCircle size={12} /> };
  return { label: 'Pending', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: <Clock size={12} /> };
}

function getStatusIcon(pr: PRDetail) {
  if (pr.merged) return <GitPullRequest size={14} style={{ color: '#a78bfa' }} />;
  if (pr.state === 'closed') return <XCircle size={14} style={{ color: '#f87171' }} />;
  if (pr.draft) return <FileEdit size={14} style={{ color: '#64748b' }} />;
  return <GitPullRequest size={14} style={{ color: '#34d399' }} />;
}

function getFileIcon(status: string) {
  if (status === 'added') return <Plus size={12} style={{ color: '#34d399' }} />;
  if (status === 'removed') return <Minus size={12} style={{ color: '#f87171' }} />;
  return <FileEdit size={12} style={{ color: '#60a5fa' }} />;
}

interface Props {
  repo: string;
  prNumber: number;
  onBack: () => void;
  bell?: React.ReactNode;
}

const badge: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999, display: 'inline-flex', alignItems: 'center', gap: 4,
};

const label: React.CSSProperties = { color: '#64748b', width: 60, flexShrink: 0, fontSize: 13 };
const value: React.CSSProperties = { color: '#cbd5e1', fontSize: 13 };
const dot: React.CSSProperties = { color: '#475569', margin: '0 4px' };
const sectionHeader: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: '12px 20px', background: '#1e2840' };
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#cbd5e1' };
const sectionCount: React.CSSProperties = { fontSize: 11, color: '#64748b', marginLeft: 8 };

export default function PRDetailPage({ repo, prNumber, onBack, bell }: Props) {
  const [pr, setPr] = useState<PRDetail | null>(null);
  const [files, setFiles] = useState<PRFile[]>([]);
  const [reviewComments, setReviewComments] = useState<PRReviewComment[]>([]);
  const [issueComments, setIssueComments] = useState<GitHubComment[]>([]);
  const [nameMap, setNameMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState(false);
  const [myLogin, setMyLogin] = useState('');
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [detail, fileList, revComments, issComments, login] = await Promise.all([
          fetchPRDetail(repo, prNumber),
          fetchPRFiles(repo, prNumber),
          fetchPRReviewComments(repo, prNumber),
          fetchIssueComments(repo, prNumber),
          fetchMyLogin(),
        ]);
        setMyLogin(login);
        setPr(detail);
        setFiles(fileList);
        setReviewComments(revComments);
        setIssueComments(issComments);

        const logins = [...new Set([
          detail.author,
          ...detail.reviewers,
          ...(detail.mergedBy ? [detail.mergedBy] : []),
          ...revComments.map((c) => c.author),
          ...issComments.map((c) => c.author),
        ])];
        const names = await fetchUserNames(logins);
        setNameMap(new Map(names));
      } catch {
        //
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [repo, prNumber]);

  const getName = (login: string) => (nameMap.get(login) ?? login).split('/')[0];

  const handleApprove = async () => {
    if (!pr) return;
    setApproving(true);
    try {
      await submitPRReview(repo, prNumber, 'APPROVE');
      setPr({ ...pr, reviewStatus: 'approved' });
    } catch {
      //
    } finally {
      setApproving(false);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      await addComment(repo, prNumber, commentText.trim());
      const updated = await fetchIssueComments(repo, prNumber);
      setIssueComments(updated);
      setCommentText('');
    } catch {
      //
    } finally {
      setSubmitting(false);
    }
  };

  const toggleFile = (filename: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename);
      else next.add(filename);
      return next;
    });
  };

  if (loading) {
    return (
      <main className="main-content">
        <div className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="header-icon-btn" onClick={onBack}><ArrowLeft size={16} /></button>
            <span>PR</span>
          </div>
          {bell}
        </div>
        <div className="main-body"><Loader2 size={20} className="spinner" /></div>
      </main>
    );
  }

  if (!pr) {
    return (
      <main className="main-content">
        <div className="main-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="header-icon-btn" onClick={onBack}><ArrowLeft size={16} /></button>
            <span>PR</span>
          </div>
          {bell}
        </div>
        <div className="main-body">
          <p style={{ fontSize: 13, color: '#64748b' }}>PR을 불러올 수 없습니다.</p>
        </div>
      </main>
    );
  }

  const sts = getStatusStyle(pr);
  const rev = getReviewBadge(pr.reviewStatus);

  return (
    <main className="main-content">
      <div className="main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="header-icon-btn" onClick={onBack}><ArrowLeft size={16} /></button>
          <span>PR</span>
        </div>
        <div className="header-actions">
          {pr.state === 'open' && pr.reviewStatus !== 'approved' && pr.reviewers.includes(myLogin) && (
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                background: 'rgba(52,211,153,0.15)', color: '#34d399', border: 'none', cursor: 'pointer',
                opacity: approving ? 0.5 : 1,
              }}
              onClick={handleApprove}
              disabled={approving}
            >
              {approving ? <Loader2 size={13} className="spinner" /> : <CheckCircle2 size={13} />}
              승인
            </button>
          )}
          {bell}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px', maxWidth: 1200 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Title & status */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            {getStatusIcon(pr)}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, color: '#e2e8f0', lineHeight: 1.4, margin: 0 }}>
                  {pr.title}
                  <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 8 }}>#{pr.number}</span>
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ ...badge, color: sts.color, background: sts.background }}>{getStatusLabel(pr)}</span>
                  {pr.state === 'open' && (
                    <span style={{ ...badge, color: rev.color, background: rev.bg }}>{rev.icon} {rev.label}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <GitBranch size={11} /> {pr.head} → {pr.base}
                </span>
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                >
                  <ExternalLink size={11} /> GitHub
                </a>
              </div>
            </div>
          </div>

          {/* Info list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={label}>Project</span>
              <span style={value}>{pr.repo}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={label}>Author</span>
              <span style={value}>{getName(pr.author)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={label}>Created</span>
              <span style={value}>{formatDate(pr.createdAt)}</span>
              {(pr.mergedAt || pr.updatedAt) && (
                <>
                  <span style={dot}>·</span>
                  <span style={{ color: '#64748b', fontSize: 13 }}>{pr.merged ? 'Merged' : 'Updated'}</span>
                  <span style={value}>{pr.mergedAt ? formatDate(pr.mergedAt) : timeAgo(pr.updatedAt)}</span>
                </>
              )}
            </div>
            {pr.reviewers.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={label}>Reviewer</span>
                <span style={value}>{pr.reviewers.map(getName).join(', ')}</span>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={label}>Changes</span>
              <span style={value}>{pr.changedFiles} files</span>
              <span style={{ color: '#34d399', fontSize: 13 }}>+{pr.additions}</span>
              <span style={{ color: '#f87171', fontSize: 13 }}>-{pr.deletions}</span>
            </div>
          </div>

          {/* Body */}
          {pr.body && (
            <div style={{ background: '#1a2236', borderRadius: 8, overflow: 'hidden' }}>
              <div style={sectionHeader}>
                <span style={sectionTitle}>Description</span>
              </div>
              <div style={{ padding: '16px 20px' }}>
                <pre style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, margin: 0 }}>{pr.body}</pre>
              </div>
            </div>
          )}

          {/* Files */}
          <div style={{ background: '#1a2236', borderRadius: 8, overflow: 'hidden' }}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>Files</span>
              <span style={sectionCount}>{files.length}</span>
            </div>
            {files.length === 0 ? (
              <p style={{ fontSize: 13, color: '#475569', padding: '24px 20px' }}>변경된 파일이 없습니다.</p>
            ) : (
              files.map((file) => {
                const fileComments = reviewComments.filter((c) => c.path === file.filename);
                return (
                  <div key={file.filename} style={{ borderBottom: '1px solid #232f45' }}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', cursor: 'pointer' }}
                      onClick={() => toggleFile(file.filename)}
                    >
                      {file.patch ? (
                        expandedFiles.has(file.filename)
                          ? <ChevronDown size={12} style={{ color: '#64748b', flexShrink: 0 }} />
                          : <ChevronRight size={12} style={{ color: '#64748b', flexShrink: 0 }} />
                      ) : <span style={{ width: 12 }} />}
                      {getFileIcon(file.status)}
                      <span style={{ flex: 1, fontSize: 13, color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.filename}</span>
                      {fileComments.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#60a5fa', flexShrink: 0, marginRight: 8 }}>
                          <MessageSquare size={10} /> {fileComments.length}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: '#34d399', flexShrink: 0 }}>+{file.additions}</span>
                      <span style={{ fontSize: 11, color: '#f87171', flexShrink: 0, marginLeft: 8 }}>-{file.deletions}</span>
                    </div>
                    {expandedFiles.has(file.filename) && (
                      <>
                        {file.patch && (
                          <div style={{ background: '#0d1520', overflowX: 'auto', maxHeight: 400, overflowY: 'auto' }}>
                            <pre style={{ fontSize: 12, lineHeight: 1.6, fontFamily: 'monospace', padding: '12px 16px', margin: 0 }}>
                              {file.patch.split('\n').map((line, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: '0 8px',
                                    ...(line.startsWith('+') && !line.startsWith('+++')
                                      ? { background: 'rgba(52,211,153,0.05)', color: 'rgba(110,231,183,0.8)' }
                                      : line.startsWith('-') && !line.startsWith('---')
                                      ? { background: 'rgba(248,113,113,0.05)', color: 'rgba(252,165,165,0.8)' }
                                      : line.startsWith('@@')
                                      ? { color: 'rgba(96,165,250,0.6)' }
                                      : { color: '#64748b' }),
                                  }}
                                >
                                  {line}
                                </div>
                              ))}
                            </pre>
                          </div>
                        )}
                        {fileComments.length > 0 && (
                          <div style={{ background: '#141d2e', borderTop: '1px solid #232f45' }}>
                            {fileComments.map((c) => (
                              <div key={c.id} style={{ padding: '10px 16px', borderBottom: '1px solid #1e2840' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                  <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 500 }}>{getName(c.author)}</span>
                                  {c.line && <span style={{ fontSize: 11, color: '#475569' }}>L{c.line}</span>}
                                  <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
                                </div>
                                <pre style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, margin: 0 }}>{c.body}</pre>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Comments */}
          <div style={{ background: '#1a2236', borderRadius: 8, overflow: 'hidden' }}>
            <div style={sectionHeader}>
              <span style={sectionTitle}>Comments</span>
              <span style={sectionCount}>{issueComments.length}</span>
            </div>
            {issueComments.length === 0 ? (
              <p style={{ fontSize: 13, color: '#475569', padding: '24px 20px' }}>댓글이 없습니다.</p>
            ) : (
              issueComments.map((c) => (
                <div key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #232f45' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#cbd5e1', fontWeight: 500 }}>{getName(c.author)}</span>
                    <span style={{ fontSize: 11, color: '#475569', marginLeft: 'auto' }}>{timeAgo(c.createdAt)}</span>
                  </div>
                  <pre style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, margin: 0 }}>{c.body}</pre>
                </div>
              ))
            )}
            {!pr.merged && <div style={{ padding: '12px 16px', borderTop: '1px solid #232f45' }}>
              <textarea
                style={{
                  width: '100%', background: '#0d1520', color: '#cbd5e1', fontSize: 13,
                  borderRadius: 6, padding: '8px 12px', resize: 'none',
                  border: '1px solid #232f45', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                  boxSizing: 'border-box',
                }}
                rows={3}
                placeholder="댓글을 입력하세요..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleComment(); }}
                onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f680'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = '#232f45'; }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#475569' }}>Ctrl+Enter</span>
                <button
                  style={{
                    padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 6,
                    background: submitting || !commentText.trim() ? '#1e293b' : 'rgba(59,130,246,0.15)',
                    color: submitting || !commentText.trim() ? '#475569' : '#60a5fa',
                    border: 'none', cursor: submitting || !commentText.trim() ? 'default' : 'pointer',
                  }}
                  onClick={handleComment}
                  disabled={submitting || !commentText.trim()}
                >
                  {submitting ? '전송 중...' : 'Comment'}
                </button>
              </div>
            </div>}
          </div>

        </div>
      </div>
    </main>
  );
}
