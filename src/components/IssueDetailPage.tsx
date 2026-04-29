import { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Send, Pencil, X, Check } from 'lucide-react';
import { addComment, fetchIssueComments, fetchOrgMembers, fetchUserNames, updateComment, updateIssueState, type GitHubIssue, type GitHubComment } from '../github';
import { parseMentions, createMentionNotifications } from '../notifications';

interface Props {
  issue: GitHubIssue;
  nameMap: Map<string, string>;
  ghLogin: string;
  onBack: () => void;
  onIssueUpdate: (updated: GitHubIssue) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getName(login: string, nameMap: Map<string, string>) {
  return (nameMap.get(login) ?? login).split('/')[0];
}

export default function IssueDetailPage({ issue, nameMap, ghLogin, onBack, onIssueUpdate }: Props) {
  const [comments, setComments] = useState<GitHubComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [names, setNames] = useState<Map<string, string>>(nameMap);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issueState, setIssueState] = useState(issue.state);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState('');
  const [members, setMembers] = useState<{ login: string; name: string }[]>([]);
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionStart, setMentionStart] = useState(-1);
  const [mentionIdx, setMentionIdx] = useState(0);

  const filteredMembers = members.filter((m) =>
    m.login.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    m.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const loadComments = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const data = await fetchIssueComments(issue.repo, issue.number);
    setComments(data);
    const logins = [...new Set(data.map((c) => c.author))];
    if (logins.length > 0) {
      const updated = await fetchUserNames(logins);
      setNames(new Map(updated));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadComments(true);
    fetchOrgMembers().then(setMembers).catch(() => {});
  }, [issue.repo, issue.number]);

  const handleAddComment = async () => {
    if (!newComment.trim() || submitting) return;
    setSubmitting(true);
    try {
      const text = newComment.trim();
      await addComment(issue.repo, issue.number, text);
      setNewComment('');
      await loadComments(false);
      const mentions = parseMentions(text);
      console.log('mentions:', mentions, 'from:', ghLogin);
      if (mentions.length > 0) {
        createMentionNotifications(mentions, ghLogin, issue.title, issue.repo, issue.number, text)
          .then(() => console.log('notification sent'))
          .catch((e) => console.error('notification error:', e));
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : '댓글 작성 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async () => {
    if (!editBody.trim() || submitting || editingId === null) return;
    setSubmitting(true);
    try {
      await updateComment(issue.repo, editingId, editBody.trim());
      setEditingId(null);
      await loadComments(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleState = async () => {
    const next = issueState === 'open' ? 'closed' : 'open';
    setSubmitting(true);
    try {
      await updateIssueState(issue.repo, issue.number, next);
      setIssueState(next);
      onIssueUpdate({ ...issue, state: next });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="main-content">
      <div className="main-header">
        <div className="issue-detail-header-left">
          <button className="issue-back-btn" onClick={onBack}>
            <ArrowLeft size={16} />
          </button>
          <span>{issue.title}</span>
          <span className="tasks-issue-number">#{issue.number}</span>
        </div>
        <button className="header-icon-btn" onClick={() => window.open(issue.url, '_blank')} title="GitHub에서 보기">
          <ExternalLink size={14} />
        </button>
      </div>

      <div className="issue-detail-content">
        <div className="issue-detail-meta">
          <span className={`tasks-status-badge ${issueState}`}>{issueState === 'open' ? '열림' : '닫힘'}</span>
          <span className="issue-detail-repo">{issue.repo}</span>
          <span className="issue-detail-info">{getName(issue.author, names)} &middot; {formatDate(issue.createdAt)}</span>
        </div>

        <div className="issue-detail-body">
          {issue.body ? (
            <pre className="issue-detail-text">{issue.body}</pre>
          ) : (
            <p className="issue-detail-empty">내용이 없습니다.</p>
          )}
        </div>

        <div className="issue-detail-comments-header">
          댓글 {loading ? '' : `(${comments.length})`}
        </div>

        {loading ? (
          <div className="issue-detail-loading">
            <Loader2 size={16} className="spinner" />
          </div>
        ) : comments.length === 0 ? (
          <p className="issue-detail-empty">댓글이 없습니다.</p>
        ) : (
          <div className="issue-detail-comments">
            {comments.map((c) => (
              <div key={c.id} className="issue-comment">
                <div className="issue-comment-header">
                  <span className="issue-comment-author">{getName(c.author, names)}</span>
                  <div className="issue-comment-header-right">
                    <span className="issue-comment-date">{formatDate(c.createdAt)}</span>
                    {c.author === ghLogin && editingId !== c.id && (
                      <button
                        className="issue-comment-edit-btn"
                        onClick={() => { setEditingId(c.id); setEditBody(c.body); }}
                      >
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === c.id ? (
                  <div className="issue-comment-edit-form">
                    <textarea
                      className="issue-comment-edit-input"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={3}
                      autoFocus
                    />
                    <div className="issue-comment-edit-actions">
                      <button
                        className="issue-comment-edit-cancel"
                        onClick={() => setEditingId(null)}
                      >
                        <X size={12} /> 취소
                      </button>
                      <button
                        className="issue-comment-edit-save"
                        onClick={handleEditComment}
                        disabled={submitting || !editBody.trim()}
                      >
                        {submitting ? <Loader2 size={12} className="spinner" /> : <Check size={12} />} 저장
                      </button>
                    </div>
                  </div>
                ) : (
                  <pre className="issue-comment-body">{c.body}</pre>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="issue-comment-form">
          <div className="mention-wrapper">
            <textarea
              className="issue-comment-input"
              placeholder="댓글을 입력하세요... (@로 멘션)"
              value={newComment}
              onChange={(e) => {
                const text = e.target.value;
                setNewComment(text);
                const cursor = e.target.selectionStart;
                const before = text.slice(0, cursor);
                const atMatch = before.match(/@([^\s]*)$/);
                if (atMatch) {
                  setShowMention(true);
                  setMentionFilter(atMatch[1]);
                  setMentionStart(cursor - atMatch[0].length);
                  setMentionIdx(0);
                } else {
                  setShowMention(false);
                }
              }}
              onKeyDown={(e) => {
                if (!showMention || filteredMembers.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionIdx((prev) => (prev + 1) % filteredMembers.length);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionIdx((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                } else if ((e.key === 'Enter' || e.key === 'Tab') && showMention) {
                  e.preventDefault();
                  const m = filteredMembers[mentionIdx];
                  if (m) {
                    const before = newComment.slice(0, mentionStart);
                    const cursorEnd = mentionStart + mentionFilter.length + 1;
                    const after = newComment.slice(cursorEnd);
                    setNewComment(`${before}@${m.login} ${after}`);
                    setShowMention(false);
                  }
                } else if (e.key === 'Escape') {
                  setShowMention(false);
                }
              }}
              rows={3}
            />
            {showMention && filteredMembers.length > 0 && (
              <div className="mention-dropdown">
                {filteredMembers.map((m, i) => (
                  <div
                    key={m.login}
                    className={`mention-item ${i === mentionIdx ? 'mention-item-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const before = newComment.slice(0, mentionStart);
                      const cursorEnd = mentionStart + mentionFilter.length + 1;
                      const after = newComment.slice(cursorEnd);
                      setNewComment(`${before}@${m.login} ${after}`);
                      setShowMention(false);
                    }}
                    onMouseEnter={() => setMentionIdx(i)}
                  >
                    <span className="mention-item-name">{m.name}</span>
                    <span className="mention-item-login">@{m.login}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="issue-comment-actions">
            <button
              className={`issue-state-btn ${issueState === 'open' ? 'close' : 'reopen'}`}
              onClick={handleToggleState}
              disabled={submitting}
            >
              {issueState === 'open' ? '이슈 닫기' : '이슈 열기'}
            </button>
            <button
              className="issue-comment-submit"
              onClick={handleAddComment}
              disabled={submitting || !newComment.trim()}
            >
              {submitting ? <Loader2 size={14} className="spinner" /> : <Send size={14} />}
              Comment
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
