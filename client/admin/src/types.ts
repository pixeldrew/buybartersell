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

export interface ActivityPollParticipant {
  id: string;
  phoneNumber: string | null;
  role: 'member';
}

export interface ActivityPollResponse {
  participantId: string;
  phoneNumber: string | null;
  respondedAt: string;
}

export interface ActivityPoll {
  id: string;
  pollMessageId: string;
  groupId: string;
  question: string;
  status: 'open' | 'closed';
  expectedParticipants: ActivityPollParticipant[];
  responses: ActivityPollResponse[];
  sentAt: string;
  closedAt: string | null;
  expectedCount: number;
  respondedCount: number;
  inactiveCount: number;
  respondedParticipants: ActivityPollParticipant[];
  inactiveParticipants: ActivityPollParticipant[];
}
