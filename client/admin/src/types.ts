export interface WeeklyPostCount {
  date: string;
  count: number;
}

export interface AdminStats {
  weeklyPosts: WeeklyPostCount[];
  sentimentCounts: Record<string, number>;
  marketCounts: {
    selling: number;
    wanted: number;
  };
}

export interface AdminSettings {
  termsGateEnabled: boolean;
  appUrl: string;
}

export type TrackedGroupUserRole = 'member' | 'admin' | 'superadmin';

export interface TrackedGroupUser {
  id: string;
  phoneNumber: string | null;
  role: TrackedGroupUserRole;
}

export interface TrackedGroupUsers {
  groupId: string;
  subject: string;
  participants: TrackedGroupUser[];
}
