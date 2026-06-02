import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircleIcon, CheckCircle2Icon, Loader2Icon, XCircleIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@buybartersell/ui/components/ui/alert';
import { Button } from '@buybartersell/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@buybartersell/ui/components/ui/card';
import { Skeleton } from '@buybartersell/ui/components/ui/skeleton';
import { Input } from '@buybartersell/ui/components/ui/input';
import { Label } from '@buybartersell/ui/components/ui/label';

type JoinState =
  | { status: 'loading' }
  | { status: 'ready'; token: string }
  | { status: 'submitting'; token: string; action: 'accept' | 'reject' }
  | { status: 'approved' }
  | { status: 'declined' }
  | { status: 'error'; message: string };

interface ApiResponse {
  ok: boolean;
  error?: string;
  outcome?: 'approved' | 'declined' | 'added';
  available?: boolean;
  turnstileSiteKey?: string;
}

function readTokenFromPath(): string | null {
  const match = window.location.pathname.match(/^\/join\/([^/]+)\/?$/);
  return match?.[1] ?? null;
}

async function requestJson(path: string, init?: RequestInit): Promise<ApiResponse> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const data = (await response.json()) as ApiResponse;
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'Unable to complete request.');
  return data;
}

export function App() {
  if (!readTokenFromPath() && /^\/join\/?$/.test(window.location.pathname)) {
    return <DirectJoinApp />;
  }
  return <TokenJoinApp />;
}

function TokenJoinApp() {
  const [state, setState] = useState<JoinState>({ status: 'loading' });
  const token = useMemo(readTokenFromPath, []);

  useEffect(() => {
    if (!token) {
      setState({ status: 'error', message: 'This invitation link is invalid.' });
      return;
    }

    requestJson(`/api/join/${token}/status`)
      .then(() => setState({ status: 'ready', token }))
      .catch((err) => setState({ status: 'error', message: (err as Error).message }));
  }, [token]);

  async function submit(action: 'accept' | 'reject') {
    if (state.status !== 'ready') return;
    setState({ status: 'submitting', token: state.token, action });
    try {
      const response = await requestJson(`/api/join/${state.token}/${action === 'accept' ? 'accept' : 'reject'}`, {
        method: 'POST',
      });
      setState({ status: response.outcome === 'approved' ? 'approved' : 'declined' });
    } catch (err) {
      setState({ status: 'error', message: (err as Error).message });
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground">
      {state.status === 'loading' ? <LoadingCard /> : null}
      {state.status === 'ready' || state.status === 'submitting' ? (
        <TermsCard
          submitting={state.status === 'submitting' ? state.action : null}
          onAccept={() => void submit('accept')}
          onReject={() => void submit('reject')}
        />
      ) : null}
      {state.status === 'approved' ? (
        <OutcomeCard
          icon={<CheckCircle2Icon className="size-12 text-primary" />}
          title="You're in!"
          description="Your request has been approved. You should receive a WhatsApp notification shortly."
        />
      ) : null}
      {state.status === 'declined' ? (
        <OutcomeCard
          icon={<XCircleIcon className="size-12 text-muted-foreground" />}
          title="Request Declined"
          description="You have declined the terms. You can request to join again at any time."
        />
      ) : null}
      {state.status === 'error' ? (
        <OutcomeCard
          icon={<AlertCircleIcon className="size-12 text-destructive" />}
          title="Link Unavailable"
          description={state.message}
        />
      ) : null}
    </main>
  );
}

type DirectJoinState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; turnstileSiteKey: string }
  | { status: 'submitting'; turnstileSiteKey: string }
  | { status: 'added' }
  | { status: 'error'; turnstileSiteKey: string; message: string };

function DirectJoinApp() {
  const [state, setState] = useState<DirectJoinState>({ status: 'loading' });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileReset, setTurnstileReset] = useState(0);

  useEffect(() => {
    requestJson('/api/join/direct/config')
      .then((response) => {
        if (!response.available || !response.turnstileSiteKey) {
          setState({ status: 'unavailable' });
          return;
        }
        setState({ status: 'ready', turnstileSiteKey: response.turnstileSiteKey });
      })
      .catch(() => setState({ status: 'unavailable' }));
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== 'ready' && state.status !== 'error') return;
    const turnstileSiteKey = state.turnstileSiteKey;
    setState({ status: 'submitting', turnstileSiteKey });
    try {
      await requestJson('/api/join/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber, acceptedTerms, turnstileToken }),
      });
      setState({ status: 'added' });
    } catch (err) {
      setTurnstileToken('');
      setTurnstileReset((value) => value + 1);
      setState({ status: 'error', turnstileSiteKey, message: (err as Error).message });
    }
  }

  if (state.status === 'loading') return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground"><LoadingCard /></main>;
  if (state.status === 'unavailable') {
    return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground"><OutcomeCard icon={<AlertCircleIcon className="size-12 text-muted-foreground" />} title="Requests Unavailable" description="Direct group access requests are currently unavailable." /></main>;
  }
  if (state.status === 'added') {
    return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground"><OutcomeCard icon={<CheckCircle2Icon className="size-12 text-primary" />} title="You're In!" description="Your phone number has been added to the WhatsApp group." /></main>;
  }

  const submitting = state.status === 'submitting';
  const message = state.status === 'error' ? state.message : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-8 text-foreground">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Request Group Access</CardTitle>
          <CardDescription>Enter your Florida WhatsApp phone number and accept the Terms & Conditions to join.</CardDescription>
        </CardHeader>
        <form onSubmit={(event) => void submit(event)}>
          <CardContent className="flex flex-col gap-4">
            <TermsContent />
            <Alert>
              <AlertTitle>Florida numbers only</AlertTitle>
              <AlertDescription>
                Public join requests are limited to WhatsApp phone numbers with Florida area codes.
              </AlertDescription>
            </Alert>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone-number">Florida WhatsApp phone number</Label>
              <Input id="phone-number" type="tel" autoComplete="tel" placeholder="(555) 123-4567" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} disabled={submitting} required />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 size-4" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} disabled={submitting} />
              <span>I accept the Terms & Conditions.</span>
            </label>
            <TurnstileWidget siteKey={state.turnstileSiteKey} resetKey={turnstileReset} onToken={setTurnstileToken} />
            {message ? <Alert variant="destructive"><AlertCircleIcon data-icon="inline-start" /><AlertTitle>Request not completed</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
          </CardContent>
          <CardFooter>
            <Button className="w-full" type="submit" disabled={submitting || !acceptedTerms || !turnstileToken || !phoneNumber.trim()}>
              {submitting ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              Request Access
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}

function TurnstileWidget({ siteKey, resetKey, onToken }: { siteKey: string; resetKey: number; onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      if (cancelled || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'auto',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
    };
    const scriptId = 'cloudflare-turnstile-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', render);
    render();
    return () => {
      cancelled = true;
      script?.removeEventListener('load', render);
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [siteKey, onToken]);

  useEffect(() => {
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }, [resetKey]);

  return <div ref={containerRef} />;
}

function TermsCard({
  submitting,
  onAccept,
  onReject,
}: {
  submitting: 'accept' | 'reject' | null;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Group Membership</CardTitle>
        <CardDescription>Please read and accept the Terms & Conditions to join.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <TermsContent />
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row">
        <Button className="w-full" onClick={onAccept} disabled={submitting !== null}>
          {submitting === 'accept' ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
          Accept & Join
        </Button>
        <Button className="w-full" variant="secondary" onClick={onReject} disabled={submitting !== null}>
          {submitting === 'reject' ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
          Decline
        </Button>
      </CardFooter>
    </Card>
  );
}

function TermsContent() {
  return (
    <>
      <Alert>
        <AlertTitle>Terms & Conditions</AlertTitle>
        <AlertDescription>By continuing, you agree to follow the group rules and respect admin moderation decisions.</AlertDescription>
      </Alert>
      <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
        <p>By joining this group you agree to treat all members with respect and courtesy.</p>
        <p>Spam, self-promotion, and unsolicited commercial messages are prohibited.</p>
        <p>Off-topic content and invite links shared without admin approval will be removed.</p>
        <p>Members who repeatedly violate these rules will be removed from the group.</p>
        <p>The administrators reserve the right to update these terms at any time.</p>
      </div>
    </>
  );
}

function OutcomeCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <Card className="w-full max-w-md text-center">
      <CardHeader className="items-center">
        {icon}
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function LoadingCard() {
  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
      </CardContent>
      <CardFooter className="flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </CardFooter>
    </Card>
  );
}
