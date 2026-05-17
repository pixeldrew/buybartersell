import { useEffect, useMemo, useState } from 'react';
import { AlertCircleIcon, LogInIcon, RefreshCwIcon, SaveIcon, Trash2Icon, UsersIcon } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import type { PieLabelRenderProps } from 'recharts';
import {
  getSettings,
  getStats,
  getTrackedGroupUsers,
  isAuthenticationRequiredError,
  removeTrackedGroupUser,
  setAppUrl,
  setTermsGate,
} from './api';
import type { AdminSettings, AdminStats, TrackedGroupUserRole, TrackedGroupUsers } from './types';
import { Alert, AlertDescription, AlertTitle } from '@buybartersell/ui/components/ui/alert';
import { Badge } from '@buybartersell/ui/components/ui/badge';
import { Button } from '@buybartersell/ui/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@buybartersell/ui/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@buybartersell/ui/components/ui/chart';
import { Input } from '@buybartersell/ui/components/ui/input';
import { Label } from '@buybartersell/ui/components/ui/label';
import { Skeleton } from '@buybartersell/ui/components/ui/skeleton';
import { Switch } from '@buybartersell/ui/components/ui/switch';

const postsConfig = {
  count: {
    label: 'Posts',
    color: 'var(--primary)',
  },
} satisfies ChartConfig;

const sentimentColors: Record<string, string> = {
  selling: 'var(--primary)',
  wanted: 'var(--muted-foreground)',
  info: 'var(--secondary)',
  unrelated: 'var(--border)',
};

const RADIAN = Math.PI / 180;

function renderSentimentLabel({
  cx,
  cy,
  midAngle,
  outerRadius,
  name,
  value,
}: PieLabelRenderProps) {
  if (!value || typeof midAngle !== 'number' || typeof cx !== 'number' || typeof cy !== 'number' || typeof outerRadius !== 'number') {
    return null;
  }

  const radius = outerRadius + 26;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="var(--foreground)"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="fill-foreground text-xs font-medium"
    >
      {name}: {value}
    </text>
  );
}

export function App() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [trackedGroupUsers, setTrackedGroupUsers] = useState<TrackedGroupUsers | null>(null);
  const [appUrlInput, setAppUrlInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [termsPending, setTermsPending] = useState(false);
  const [appUrlPending, setAppUrlPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [trackedGroupUsersError, setTrackedGroupUsersError] = useState<string | null>(null);
  const [authenticationRequired, setAuthenticationRequired] = useState(false);

  async function loadDashboard(options: { skipTrackedGroupUsers?: boolean } = {}) {
    setError(null);
    setTrackedGroupUsersError(null);
    setAuthenticationRequired(false);
    setRefreshing(true);
    try {
      const [nextStats, nextSettings, nextTrackedGroupUsers] = await Promise.all([
        getStats(),
        getSettings(),
        options.skipTrackedGroupUsers
          ? Promise.resolve({ status: 'skipped' as const })
          : getTrackedGroupUsers()
            .then((response) => ({ status: 'fulfilled' as const, value: response.trackedGroup }))
            .catch((err) => ({ status: 'rejected' as const, reason: err })),
      ]);
      setStats(nextStats);
      setSettings(nextSettings);
      setAppUrlInput(nextSettings.appUrl);
      if (nextTrackedGroupUsers.status === 'fulfilled') {
        setTrackedGroupUsers(nextTrackedGroupUsers.value);
      } else if (nextTrackedGroupUsers.status === 'skipped') {
        // Skip touching tracked-group state in optimistic refresh paths.
      } else if (isAuthenticationRequiredError(nextTrackedGroupUsers.reason)) {
        setAuthenticationRequired(true);
      } else {
        setTrackedGroupUsers(null);
        setTrackedGroupUsersError((nextTrackedGroupUsers.reason as Error).message);
      }
    } catch (err) {
      if (isAuthenticationRequiredError(err)) {
        setAuthenticationRequired(true);
      } else {
        setError((err as Error).message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  const sentimentData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.sentimentCounts).map(([name, value]) => ({ name, value }));
  }, [stats]);

  async function updateTermsGate(enabled: boolean) {
    if (!settings) return;
    setSettingsError(null);
    setTermsPending(true);
    const previous = settings.termsGateEnabled;
    setSettings({ ...settings, termsGateEnabled: enabled });
    try {
      const response = await setTermsGate(enabled);
      setSettings({ ...settings, termsGateEnabled: response.termsGateEnabled });
    } catch (err) {
      setSettings({ ...settings, termsGateEnabled: previous });
      setSettingsError((err as Error).message);
    } finally {
      setTermsPending(false);
    }
  }

  async function saveAppUrl() {
    if (!settings) return;
    setSettingsError(null);
    setAppUrlPending(true);
    try {
      const response = await setAppUrl(appUrlInput);
      setSettings({ ...settings, appUrl: response.appUrl });
      setAppUrlInput(response.appUrl);
    } catch (err) {
      setSettingsError((err as Error).message);
    } finally {
      setAppUrlPending(false);
    }
  }

  if (loading) return <DashboardSkeleton />;
  if (authenticationRequired) return <AuthenticationRequired />;

  return (
    <main className="min-h-screen bg-background px-6 py-6 text-foreground md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-normal">WhatsApp Group Stats</h1>
              <Badge variant={settings?.termsGateEnabled ? 'default' : 'secondary'}>
                Terms Gate {settings?.termsGateEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Admin dashboard for message stats and join request controls.</p>
          </div>
          <Button variant="outline" onClick={() => void loadDashboard()} disabled={refreshing}>
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon data-icon="inline-start" />
            <AlertTitle>Dashboard unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {settings ? (
          <Card>
            <CardHeader>
              <CardTitle>Join Request Settings</CardTitle>
              <CardDescription>Controls used when WhatsApp sends a group join request.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="terms-gate">Terms Gate</Label>
                  <p className="text-sm text-muted-foreground">Send a terms approval link before approving join requests.</p>
                </div>
                <Switch
                  id="terms-gate"
                  checked={settings.termsGateEnabled}
                  disabled={termsPending}
                  onCheckedChange={(checked) => void updateTermsGate(checked)}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="app-url">APP_URL</Label>
                <div className="flex flex-col gap-2 md:flex-row">
                  <Input
                    id="app-url"
                    value={appUrlInput}
                    onChange={(event) => setAppUrlInput(event.target.value)}
                    placeholder="https://example.com"
                    type="url"
                  />
                  <Button onClick={() => void saveAppUrl()} disabled={appUrlPending}>
                    <SaveIcon data-icon="inline-start" />
                    Save
                  </Button>
                </div>
              </div>

              {settingsError ? (
                <Alert variant="destructive">
                  <AlertCircleIcon data-icon="inline-start" />
                  <AlertTitle>Setting not saved</AlertTitle>
                  <AlertDescription>{settingsError}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <TrackedGroupUsersCard
          trackedGroupUsers={trackedGroupUsers}
          error={trackedGroupUsersError}
          onRemoved={(participantId) => {
            setTrackedGroupUsers((current) => {
              if (!current) return current;
              return {
                ...current,
                participants: current.participants.filter((entry) => entry.id !== participantId),
              };
            });
            setTrackedGroupUsersError(null);
            void loadDashboard({ skipTrackedGroupUsers: true });
            void getTrackedGroupUsers()
              .then((response) => {
                setTrackedGroupUsers(response.trackedGroup);
              })
              .catch((err) => {
                if (isAuthenticationRequiredError(err)) {
                  setAuthenticationRequired(true);
                  return;
                }
                setTrackedGroupUsersError((err as Error).message);
              });
          }}
        />

        {stats ? (
          <section className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Posts</CardTitle>
                <CardDescription>Last 7 days</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={postsConfig} className="h-72 w-full">
                  <BarChart data={stats.weeklyPosts}>
                    <CartesianGrid vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} tickMargin={8} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                  </BarChart>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gear Market</CardTitle>
                <CardDescription>Detected listing intent</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3">
                <MarketMetric label="Selling" value={stats.marketCounts.selling} />
                <MarketMetric label="Wanted" value={stats.marketCounts.wanted} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle>Sentiment</CardTitle>
                <CardDescription>Message classification mix</CardDescription>
              </CardHeader>
              <CardContent>
                <ChartContainer config={{ value: { label: 'Messages' } }} className="h-72 w-full">
                  <PieChart>
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Pie
                      data={sentimentData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={64}
                      outerRadius={92}
                      paddingAngle={2}
                      label={renderSentimentLabel}
                      labelLine={{ stroke: 'var(--border)' }}
                    >
                      {sentimentData.map((entry) => (
                        <Cell key={entry.name} fill={sentimentColors[entry.name] ?? 'var(--muted-foreground)'} />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function roleLabel(role: TrackedGroupUserRole) {
  if (role === 'superadmin') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

function roleVariant(role: TrackedGroupUserRole) {
  return role === 'member' ? 'secondary' : 'default';
}

function formatPhoneNumber(phoneNumber: string | null): string | null {
  if (!phoneNumber) return null;
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return `+${digits}`;
}

function TrackedGroupUsersCard({
  trackedGroupUsers,
  error,
  onRemoved,
}: {
  trackedGroupUsers: TrackedGroupUsers | null;
  error: string | null;
  onRemoved: (participantId: string) => void;
}) {
  const [removePendingId, setRemovePendingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function removeUser(user: TrackedGroupUsers['participants'][number]) {
    const identity = user.displayName ?? formatPhoneNumber(user.phoneNumber) ?? user.id;
    const confirmed = window.confirm(`Remove ${identity} from ${trackedGroupUsers?.subject ?? 'the tracked group'}?`);
    if (!confirmed) return;

    setRemoveError(null);
    setRemovePendingId(user.id);
    try {
      await removeTrackedGroupUser(user.id);
      onRemoved(user.id);
    } catch (err) {
      setRemoveError((err as Error).message);
    } finally {
      setRemovePendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon data-icon="inline-start" />
          Users
        </CardTitle>
        <CardDescription>
          {trackedGroupUsers
            ? `${trackedGroupUsers.subject} - ${trackedGroupUsers.participants.length} users`
            : 'Users from the configured tracked WhatsApp group.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon data-icon="inline-start" />
            <AlertTitle>Users unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {removeError ? (
          <Alert variant="destructive">
            <AlertCircleIcon data-icon="inline-start" />
            <AlertTitle>Remove failed</AlertTitle>
            <AlertDescription>{removeError}</AlertDescription>
          </Alert>
        ) : null}

        {!error && !trackedGroupUsers ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}

        {trackedGroupUsers ? (
          trackedGroupUsers.participants.length > 0 ? (
            <div className="max-h-80 overflow-auto rounded-md border">
              {trackedGroupUsers.participants.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{user.displayName ?? formatPhoneNumber(user.phoneNumber) ?? user.id}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {formatPhoneNumber(user.phoneNumber) ?? user.id}
                    </span>
                  </div>
                  <Badge variant={roleVariant(user.role)}>{roleLabel(user.role)}</Badge>
                  {user.role === 'member' ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={removePendingId === user.id}
                      onClick={() => void removeUser(user)}
                    >
                      <Trash2Icon data-icon="inline-start" />
                      Remove
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No users found for this group.</p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

function AuthenticationRequired() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-6 text-foreground">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in required</CardTitle>
          <CardDescription>Use your authorized Google account to access the admin dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <a href={`/login?returnTo=${encodeURIComponent('/admin/dashboard')}`}>
              <LogInIcon data-icon="inline-start" />
              Sign in with Google
            </a>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function MarketMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/40 p-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-3xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <main className="min-h-screen bg-background px-6 py-6 text-foreground md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-44 w-full" />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 lg:col-span-2" />
          <Skeleton className="h-96" />
          <Skeleton className="h-96 lg:col-span-3" />
        </div>
      </div>
    </main>
  );
}
