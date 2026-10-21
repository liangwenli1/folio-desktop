import type { Subscription } from './api';
import { day, type Dict, type Lang } from './i18n';

export const isPaid = (s: Subscription) => s.status === 'active' && s.plan !== 'free';

// One line under the plan name: when it renews, ends, changes, or when the trial is over.
export function planStatus(s: Subscription, d: Dict, lang: Lang){
  if (s.status === 'trialing' && s.trialEndsAt) return d.plan.trialEnds(day(s.trialEndsAt, lang));
  if (!isPaid(s) || !s.currentPeriodEnd) return '';
  const end = day(s.currentPeriodEnd, lang);
  if (s.cancelAtPeriodEnd) return d.plan.ends(end);
  if (s.scheduledPlan) return d.plan.scheduled(d.plans[s.scheduledPlan], end);
  return d.plan.renews(end, d.periods[s.period!]);
}
