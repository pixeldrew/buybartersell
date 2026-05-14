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
