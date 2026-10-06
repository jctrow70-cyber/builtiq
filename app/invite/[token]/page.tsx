'use client';

import { useEffect, useState } from 'react';
import { roleLabel } from '../../../lib/groups';
import { GROUP_INVITE_TOKEN_STORAGE_KEY, recordGroupInvitationEvent } from '../../../lib/groups/invitationSecurity';
import { friendlyAuthError, supabase } from '../../../lib/supabaseClient';

type Preview = {
  state?: string;
  group_name?: string;
  inviter_name?: string;
  role?: string;
  expires_at?: string;
};

export default function GroupInvitePage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signup');
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    if (!token) return;
    sessionStorage.setItem(GROUP_INVITE_TOKEN_STORAGE_KEY, token);
  }, [token]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionEmail(data.session?.user?.email || null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email || null);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ready || !sessionEmail || !token) return;
    let cancelled = false;
    supabase.rpc('st_preview_group_invite', { p_token: token }).then(({ data, error: previewError }) => {
      if (cancelled) return;
      if (previewError) {
        setError(friendlyMessage(previewError.message));
        setPreview(null);
        return;
      }
      setPreview((data || { state: 'invalid' }) as Preview);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, sessionEmail, token]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (authError) setError(friendlyAuthError(authError.message));
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const redirect = `${window.location.origin}/invite/${encodeURIComponent(token)}`;
    const { error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: redirect },
    });
    setBusy(false);
    if (authError) setError(friendlyAuthError(authError.message));
    else setNotice('Account created. If a confirmation email arrives, open it and you will return to this invitation.');
  }

  async function join() {
    setError('');
    setBusy(true);
    const { data, error: joinError } = await supabase.rpc('st_accept_group_invite', { p_token: token });
    setBusy(false);
    if (joinError) {
      setError(friendlyMessage(joinError.message));
      return;
    }
    const payload = data && typeof data === 'object' ? (data as { team_id?: string; invite_id?: string }) : {};
    const authUser = await supabase.auth.getUser();
    if (payload.team_id && payload.invite_id) {
      recordGroupInvitationEvent({
        type: 'group_invitation_accepted',
        inviteId: payload.invite_id,
        teamId: payload.team_id,
        userId: authUser.data.user?.id || '',
      });
    }
    sessionStorage.removeItem(GROUP_INVITE_TOKEN_STORAGE_KEY);
    setJoined(true);
  }

  function decline() {
    sessionStorage.removeItem(GROUP_INVITE_TOKEN_STORAGE_KEY);
    window.location.assign('/');
  }

  const state = preview?.state;

  return (
    <div className="auth-shell">
      <header className="header">
        <div>
          <div className="brand">
            Build<span>IQ</span> Health
          </div>
          <div className="muted">Group invitation</div>
        </div>
      </header>
      <div className="login">
        <div className="panel auth-panel">
          {!ready && <p className="muted">Loading invitation…</p>}

          {ready && !sessionEmail && (
            <>
              <h2>Join a group</h2>
              <p className="muted">Sign in or create an account with the email address that received this invitation. You will come back to this page.</p>
              <div className="tabs auth-tabs">
                <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
                  Sign In
                </button>
                <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
                  Create Account
                </button>
              </div>
              <form onSubmit={mode === 'signin' ? signIn : signUp}>
                <label htmlFor="invite-email">Email</label>
                <input id="invite-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                <label htmlFor="invite-password">Password</label>
                <input id="invite-password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="submit" className="btn green full" disabled={busy} style={{ marginTop: 12 }}>
                  {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              </form>
            </>
          )}

          {ready && sessionEmail && joined && (
            <>
              <h2>You joined {preview?.group_name || 'the group'}</h2>
              <p className="muted">Your personal training stays as it was. This group has its own place in your training.</p>
              <a className="btn green full" href="/" style={{ marginTop: 12 }}>
                Continue to BuildIQ
              </a>
            </>
          )}

          {ready && sessionEmail && !joined && state === 'email_mismatch' && (
            <>
              <h2>This invitation is for a different email</h2>
              <p className="muted">You are signed in as {sessionEmail}. This link cannot be used from this account.</p>
              <button type="button" className="btn secondary full" style={{ marginTop: 12 }} onClick={() => void supabase.auth.signOut()}>
                Sign out and use the invited email
              </button>
            </>
          )}

          {ready && sessionEmail && !joined && (state === 'invalid' || state === 'revoked') && (
            <>
              <h2>This invitation link is not valid</h2>
              <p className="muted">It may have been replaced, canceled, or already used. Ask the person who invited you to send a new one.</p>
            </>
          )}

          {ready && sessionEmail && !joined && state === 'expired' && (
            <>
              <h2>This invitation has expired</h2>
              {preview?.group_name && <p className="muted">{preview.group_name}</p>}
              <p className="muted">Ask for a new invitation.</p>
            </>
          )}

          {ready && sessionEmail && !joined && state === 'archived' && (
            <>
              <h2>This group is not accepting members</h2>
              {preview?.group_name && <p>{preview.group_name}</p>}
            </>
          )}

          {ready && sessionEmail && !joined && state === 'accepted' && (
            <>
              <h2>You already joined {preview?.group_name || 'this group'}</h2>
              <a className="btn green full" href="/" style={{ marginTop: 12 }}>
                Continue to BuildIQ
              </a>
            </>
          )}

          {ready && sessionEmail && !joined && state === 'ready' && (
            <>
              <h2>{preview?.group_name || 'Group'}</h2>
              <p className="muted">Invited by {preview?.inviter_name || 'a group member'}</p>
              <p>Role: {roleLabel(preview?.role)}</p>
              <div className="actions" style={{ marginTop: 16 }}>
                <button type="button" className="btn green" disabled={busy} onClick={() => void join()}>
                  {busy ? 'Joining…' : 'Join Group'}
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={decline}>
                  Not now
                </button>
              </div>
            </>
          )}

          {notice && <p className="muted">{notice}</p>}
          {error && <p className="team-sheet-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function friendlyMessage(message: string): string {
  if (/different email/i.test(message)) return 'This invitation was sent to a different email address.';
  if (/expired/i.test(message)) return 'This invitation has expired.';
  if (/canceled|revoked/i.test(message)) return 'This invitation was canceled.';
  if (/not accepting|archived/i.test(message)) return 'This group is not accepting members.';
  if (/already been used/i.test(message)) return 'This invitation has already been used.';
  if (/not valid/i.test(message)) return 'This invitation link is not valid.';
  if (/056|schema cache|could not find the function/i.test(message)) {
    return 'Group invitations are not available until the latest database migration is applied.';
  }
  return message || 'Something went wrong.';
}
