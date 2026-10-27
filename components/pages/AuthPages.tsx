'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck, UserRound } from 'lucide-react';
import { apiPost, ApiError } from '@/lib/api';
import { useAuth } from '@/components/providers';
import { BRAND } from '@/lib/brand';
import { Alert, Button, Field, Input, Modal } from '@/components/ui';

const demoAccounts = [
  { label: 'TSS SRC President', email: 'school.president@srcpro.test', password: 'President123!' },
  { label: 'TSS SRC Secretary', email: 'school.secretary@srcpro.test', password: 'Secretary123!' },
  { label: 'Executive Zone President', email: 'zonal.president@srcpro.test', password: 'President123!' },
  { label: 'Executive Zone Secretary', email: 'zonal.secretary@srcpro.test', password: 'Secretary123!' },
  { label: 'Vice President', email: 'vice.president@srcpro.test', password: 'Executive123!' },
  { label: 'Welfare Chair', email: 'executive@srcpro.test', password: 'Executive123!' },
  { label: 'Organising Secretary', email: 'organiser@srcpro.test', password: 'Executive123!' },
  { label: 'Treasurer', email: 'treasurer@srcpro.test', password: 'Executive123!' },
  { label: 'PRO', email: 'pro@srcpro.test', password: 'Executive123!' },
  { label: 'Sports Chair', email: 'sports@srcpro.test', password: 'Executive123!' },
  { label: 'System Admin', email: 'admin@srcpro.test', password: 'AdminPass123!' },
];

function BrandPanel() {
  return (
    <div className="relative hidden min-h-screen w-1/2 overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-navy-500/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-400 font-bold text-navy-950">{BRAND.monogram}</div>
        <div>
          <div className="font-semibold text-sm">{BRAND.shortName} Secretariat</div>
          <div className="text-xs text-slate-300">{BRAND.subtitle}</div>
        </div>
      </div>
      <div className="relative max-w-lg">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs text-gold-200">
          <ShieldCheck className="h-3.5 w-3.5" /> Secure role-based workspace
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight">One reliable office for Tema Secondary School SRC administration.</h1>
        <p className="mt-5 text-sm leading-7 text-slate-300">
          Coordinate urgent requests, meetings, attendance, official documents, approvals, tasks and verified reports across Tema Secondary School SRC workspaces.
        </p>
        <div className="mt-10 grid grid-cols-3 gap-3">
          {[
            ['HELP', 'Immediate routing'],
            ['Records', 'Persistent database'],
            ['Reports', 'Saved-record based'],
          ].map(([title, subtitle]) => (
            <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold text-gold-200">{title}</div>
              <div className="mt-1 text-[11px] text-slate-300">{subtitle}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="relative text-xs text-slate-400">© {new Date().getFullYear()} {BRAND.name} • Secure digital administration</div>
    </div>
  );
}

function LoginView() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('school.president@srcpro.test');
  const [password, setPassword] = useState('President123!');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotResult, setForgotResult] = useState<{ message: string; resetUrl: string | null; emailStatus: string } | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/workspace/dashboard');
  }, [loading, user, router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace('/workspace/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgot = async (event: React.FormEvent) => {
    event.preventDefault();
    setForgotLoading(true);
    setForgotResult(null);
    try {
      const result = await apiPost<{ message: string; resetUrl: string | null; emailStatus: string }>('/auth/forgot-password', { email: forgotEmail });
      setForgotResult(result);
    } catch (err) {
      setForgotResult({ message: err instanceof ApiError ? err.message : 'The request could not be completed.', resetUrl: null, emailStatus: 'failed' });
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <BrandPanel />
      <main className="flex min-h-screen w-full items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-navy-900 text-xs font-bold text-gold-300">{BRAND.monogram}</div>
            <div className="font-semibold text-navy-900">{BRAND.shortName}</div>
          </div>
          <div className="mb-7">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-gold-700">Welcome back</div>
            <h2 className="mt-2 text-3xl font-bold text-navy-900">Sign in to your workspace</h2>
            <p className="mt-2 text-sm text-slate-500">Use your official account to continue.</p>
          </div>
          {error && <div className="mb-4"><Alert tone="error">{error}</Alert></div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Official email" htmlFor="email" required>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input id="email" type="email" autoComplete="username" className="pl-10" value={email} onChange={(event) => setEmail(event.target.value)} required />
              </div>
            </Field>
            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="pl-10 pr-10" value={password} onChange={(event) => setPassword(event.target.value)} required />
                <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-slate-400">Sessions are protected with HTTP-only cookies.</span>
              <button type="button" className="font-semibold text-navy-700 hover:underline" onClick={() => { setForgotEmail(email); setForgotOpen(true); }}>Forgot password?</button>
            </div>
            <Button type="submit" size="lg" fullWidth loading={submitting} icon={<ShieldCheck className="h-4 w-4" />}>Sign in securely</Button>
          </form>

          <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><UserRound className="h-3.5 w-3.5" /> Test accounts</div>
            <p className="mt-1 text-xs text-slate-500">Select an account to fill the sign-in form.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.email}
                  type="button"
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-navy-300 hover:text-navy-800"
                  onClick={() => { setEmail(account.email); setPassword(account.password); setError(null); }}
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Modal
        open={forgotOpen}
        onClose={() => { setForgotOpen(false); setForgotResult(null); }}
        title="Reset your password"
        description="A single-use secure link will be prepared for the account."
        footer={<Button variant="outline" onClick={() => { setForgotOpen(false); setForgotResult(null); }}>Close</Button>}
      >
        <form onSubmit={handleForgot} className="space-y-4">
          <Field label="Official email" htmlFor="forgot-email" required>
            <Input id="forgot-email" type="email" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required />
          </Field>
          <Button type="submit" loading={forgotLoading} icon={<KeyRound className="h-4 w-4" />}>Prepare secure reset link</Button>
          {forgotResult && (
            <Alert tone={forgotResult.emailStatus === 'sent' || forgotResult.resetUrl ? 'success' : 'warning'}>
              <div>{forgotResult.message}</div>
              {forgotResult.resetUrl && (
                <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="text-xs font-semibold text-emerald-900">Local development link</div>
                  <Link className="mt-1 block break-all text-xs text-navy-700 underline" href={forgotResult.resetUrl}>{forgotResult.resetUrl}</Link>
                </div>
              )}
              {!forgotResult.resetUrl && <div className="mt-1 text-xs">Email status: {forgotResult.emailStatus}. Contact your administrator if no message arrives.</div>}
            </Alert>
          )}
        </form>
      </Modal>
    </div>
  );
}

function ResetView() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [purpose, setPurpose] = useState('password_reset');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token') || '');
    setPurpose(params.get('purpose') || 'password_reset');
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<{ message: string }>('/auth/reset-password', { token, purpose, password });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <BrandPanel />
      <main className="flex min-h-screen w-full items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-panel">
          <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-navy-800"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
          <h1 className="text-2xl font-bold text-navy-900">{purpose === 'account_activation' ? 'Activate your account' : 'Set a new password'}</h1>
          <p className="mt-2 text-sm text-slate-500">Use at least 10 characters. The secure link is single-use.</p>
          {!token && <div className="mt-5"><Alert tone="error">This link is missing its security token. Request a new one from the sign-in page.</Alert></div>}
          {message ? (
            <div className="mt-6 space-y-4">
              <Alert tone="success">{message}</Alert>
              <Button fullWidth onClick={() => router.push('/login')}>Continue to sign in</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {error && <Alert tone="error">{error}</Alert>}
              <Field label="New password" htmlFor="new-password" required>
                <Input id="new-password" type="password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required />
              </Field>
              <Field label="Confirm password" htmlFor="confirm-password" required>
                <Input id="confirm-password" type="password" minLength={10} value={confirm} onChange={(event) => setConfirm(event.target.value)} required />
              </Field>
              <Button type="submit" size="lg" fullWidth loading={loading} disabled={!token}>Save password</Button>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

export function AuthPages({ mode }: { mode: 'login' | 'reset' }) {
  return mode === 'login' ? <LoginView /> : <ResetView />;
}
