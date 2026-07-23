'use client';

import { useCallback, useEffect, useState } from 'react';

type BugReportRow = {
  id: string;
  user_id: string;
  title: string | null;
  description: string;
  page_context: string | null;
  app_nav: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
  reporter_email: string | null;
};

const STATUS_OPTIONS = ['open', 'triaged', 'resolved', 'closed'] as const;

function formatReportDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function BugReportsAdmin({ accessToken }: { accessToken: string | null }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [reports, setReports] = useState<BugReportRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [statusDraft, setStatusDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState('');

  const loadReports = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/bug-reports/admin', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setIsAdmin(false);
        setReports([]);
        return;
      }
      if (!res.ok) throw new Error(data?.error || `Could not load bug reports (${res.status})`);
      setIsAdmin(!!data.isAdmin);
      setEmailConfigured(!!data.emailConfigured);
      const rows = (data.reports || []) as BugReportRow[];
      setReports(rows);
      setStatusDraft(
        rows.reduce((acc: Record<string, string>, row) => {
          acc[row.id] = row.status || 'open';
          return acc;
        }, {})
      );
      setMessage(rows.length ? `${rows.length} report${rows.length === 1 ? '' : 's'} loaded.` : 'No bug reports yet.');
    } catch (e: any) {
      setError(e?.message || 'Could not load bug reports.');
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      setLoaded(false);
      setIsAdmin(false);
      setReports([]);
      return;
    }
    loadReports();
  }, [accessToken, loadReports]);

  async function saveStatus(reportId: string) {
    if (!accessToken) return;
    const status = statusDraft[reportId] || 'open';
    setSavingId(reportId);
    setError('');
    try {
      const res = await fetch('/api/bug-reports/admin', {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: reportId, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Could not update status (${res.status})`);
      setReports((prev) =>
        prev.map((row) => (row.id === reportId ? { ...row, status: data.report?.status || status } : row))
      );
      setMessage('Status updated.');
    } catch (e: any) {
      setError(e?.message || 'Could not update status.');
    } finally {
      setSavingId('');
    }
  }

  if (!accessToken || (loaded && !isAdmin)) return null;

  return (
    <div className="card bug-admin-card">
      <div className="topline" style={{ justifyContent: 'space-between' }}>
        <h2>Bug reports</h2>
        <button type="button" className="btn small secondary" onClick={loadReports} disabled={loading}>
          Refresh
        </button>
      </div>
      <p className="muted">
        Review in-app bug reports from users. New submissions email configured admins when{' '}
        <code>RESEND_API_KEY</code> is set.
      </p>
      {!emailConfigured && (
        <p className="muted dash-insight" style={{ marginTop: 8 }}>
          Email alerts are off. Add <code>RESEND_API_KEY</code>, <code>BUILDIQ_EMAIL_FROM</code>, and optional{' '}
          <code>BUILDIQ_BUG_REPORT_NOTIFY_EMAILS</code> to your server environment, then restart the app.
        </p>
      )}
      {error && (
        <p className="muted" style={{ marginTop: 8, color: '#f5a3a3' }}>
          {error}
        </p>
      )}
      {message && !error && <p className="muted" style={{ marginTop: 8 }}>{message}</p>}
      {!loaded || loading ? (
        <p className="muted" style={{ marginTop: 8 }}>
          Loading bug reports…
        </p>
      ) : reports.length === 0 ? (
        <p className="muted" style={{ marginTop: 8 }}>
          No reports yet. Users can submit from the floating Bug button anywhere in the app.
        </p>
      ) : (
        <div className="bug-admin-list">
          {reports.map((report) => (
            <article key={report.id} className="bug-admin-row">
              <div className="bug-admin-meta">
                <span className={`badge bug-status-${report.status || 'open'}`}>{report.status || 'open'}</span>
                <span className="muted">{formatReportDate(report.created_at)}</span>
                <span className="muted">{report.reporter_email || 'Unknown reporter'}</span>
                <span className="muted">#{report.id.slice(0, 8)}</span>
              </div>
              <h3 className="bug-admin-title">{report.title?.trim() || 'Untitled report'}</h3>
              {report.app_nav && <p className="muted">Screen: {report.app_nav}</p>}
              <p className="bug-admin-desc">{report.description}</p>
              {report.page_context && (
                <details className="bug-admin-details">
                  <summary>Page context</summary>
                  <pre className="bug-admin-context">{report.page_context}</pre>
                </details>
              )}
              {report.user_agent && (
                <details className="bug-admin-details">
                  <summary>User agent</summary>
                  <pre className="bug-admin-context">{report.user_agent}</pre>
                </details>
              )}
              <div className="bug-admin-actions">
                <label htmlFor={`bug-status-${report.id}`}>Status</label>
                <select
                  id={`bug-status-${report.id}`}
                  value={statusDraft[report.id] || report.status || 'open'}
                  onChange={(e) =>
                    setStatusDraft((prev) => ({
                      ...prev,
                      [report.id]: e.target.value,
                    }))
                  }
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn small green"
                  onClick={() => saveStatus(report.id)}
                  disabled={savingId === report.id}
                >
                  {savingId === report.id ? 'Saving…' : 'Save status'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
