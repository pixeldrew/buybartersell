import {
  createActivityPollWithStore,
  mongoActivityPollStore,
  type ActivityPollSummary,
} from './activity-polls.ts';
import { listTrackedGroupUsers, sendActivityPollToTrackedGroup } from './whatsapp.ts';

export async function createActivityPoll(question: string): Promise<ActivityPollSummary> {
  return createActivityPollWithStore({
    question,
    store: mongoActivityPollStore,
    now: () => new Date(),
    listTrackedGroupUsers,
    sendActivityPoll: sendActivityPollToTrackedGroup,
  });
}
