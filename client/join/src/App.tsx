import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  outcome?: 'approved' | 'declined';
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
        <Alert>
          <AlertTitle>Terms & Conditions</AlertTitle>
          <AlertDescription>
            By continuing, you agree to follow the group rules and respect admin moderation decisions.
          </AlertDescription>
        </Alert>
        <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
          <p>By joining this group you agree to treat all members with respect and courtesy.</p>
          <p>Spam, self-promotion, and unsolicited commercial messages are prohibited.</p>
          <p>Off-topic content and invite links shared without admin approval will be removed.</p>
          <p>Members who repeatedly violate these rules will be removed from the group.</p>
          <p>The administrators reserve the right to update these terms at any time.</p>
        </div>
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
