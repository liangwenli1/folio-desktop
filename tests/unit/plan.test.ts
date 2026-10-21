import { describe, expect, it } from 'vitest';
import { en } from '../../src/renderer/src/i18n';
import { planStatus } from '../../src/renderer/src/plan';
import type { Subscription } from '../../src/renderer/src/api';

const base: Subscription = {
  plan: 'studio', period: 'monthly', status: 'active', addonPacks: 0, trialEndsAt: null,
  currentPeriodStart: '2026-11-01T00:00:00.000Z', currentPeriodEnd: '2026-12-01T00:00:00.000Z',
  cancelAtPeriodEnd: false, scheduledPlan: null, scheduledPeriod: null, trialAvailable: false,
  entitlements: { profiles: 100, members: null, logDays: 30 }
};

describe('planStatus', () => {
  it('says when a paid plan renews, ends or changes', () => {
    expect(planStatus(base, en, 'en')).toBe('Renews Dec 1, 2026, monthly');
    expect(planStatus({ ...base, cancelAtPeriodEnd: true }, en, 'en')).toBe('Ends Dec 1, 2026');
    expect(planStatus({ ...base, plan: 'company', scheduledPlan: 'studio' }, en, 'en')).toBe('Becomes Studio on Dec 1, 2026');
  });

  it('shows the trial end and nothing for Free', () => {
    expect(planStatus({ ...base, status: 'trialing', period: null, trialEndsAt: '2026-11-08T00:00:00.000Z' }, en, 'en')).toBe('Free trial ends Nov 8, 2026');
    expect(planStatus({ ...base, plan: 'free', period: null, currentPeriodEnd: null }, en, 'en')).toBe('');
  });
});
