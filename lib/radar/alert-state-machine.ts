import { classifyRiskIndex, RISK_CONFIG } from './threshold-config.ts';
import type { RiskLevelKey } from './types.ts';

export type OperationalAlertLevel = Exclude<RiskLevelKey, 'unknown'>;
export type AlertState = {
  current: OperationalAlertLevel;
  startedAt: string;
  changedAt: string;
  pendingTarget: OperationalAlertLevel | null;
  pendingCycles: number;
  notificationStatus: 'none' | 'suppressed' | 'awaiting_human_approval';
  suppressionReason: string | null;
};

export type AlertTransitionInput = {
  riskIndex: number | null;
  alertEligible: boolean;
  now: string;
};

const order: OperationalAlertLevel[] = ['normal', 'watch', 'warning', 'danger', 'critical'];
const rank = (level: OperationalAlertLevel) => order.indexOf(level);
const thresholdFor = (level: OperationalAlertLevel) => level === 'normal' ? 0 : RISK_CONFIG.thresholds[level];

export function createInitialAlertState(now: string): AlertState {
  return {
    current: 'normal',
    startedAt: now,
    changedAt: now,
    pendingTarget: null,
    pendingCycles: 0,
    notificationStatus: 'none',
    suppressionReason: null,
  };
}

export function transitionAlertState(previous: AlertState | null, input: AlertTransitionInput): AlertState {
  const state = previous ?? createInitialAlertState(input.now);
  if (!input.alertEligible || input.riskIndex == null || !Number.isFinite(input.riskIndex)) {
    return {
      ...state,
      pendingTarget: null,
      pendingCycles: 0,
      notificationStatus: 'suppressed',
      suppressionReason: 'ข้อมูลไม่ครบหรือไม่สดพอสำหรับออกสัญญาณแจ้งเตือน',
    };
  }

  const candidate = classifyRiskIndex(input.riskIndex) as OperationalAlertLevel;
  let target = candidate;
  if (rank(candidate) < rank(state.current)) {
    const demotionBoundary = Math.max(0, thresholdFor(state.current) - RISK_CONFIG.alert.hysteresisMargin);
    if (input.riskIndex >= demotionBoundary) target = state.current;
  }
  if (target === state.current) {
    return {
      ...state,
      pendingTarget: null,
      pendingCycles: 0,
      notificationStatus: rank(state.current) >= rank('warning') ? 'awaiting_human_approval' : 'none',
      suppressionReason: null,
    };
  }

  const nextCycles = state.pendingTarget === target ? state.pendingCycles + 1 : 1;
  const requiredCycles = rank(target) > rank(state.current)
    ? RISK_CONFIG.alert.promotionCycles
    : RISK_CONFIG.alert.demotionCycles;
  if (nextCycles < requiredCycles) {
    return {
      ...state,
      pendingTarget: target,
      pendingCycles: nextCycles,
      notificationStatus: rank(state.current) >= rank('warning') ? 'awaiting_human_approval' : 'none',
      suppressionReason: null,
    };
  }
  return {
    current: target,
    startedAt: target === 'normal' ? input.now : state.current === 'normal' ? input.now : state.startedAt,
    changedAt: input.now,
    pendingTarget: null,
    pendingCycles: 0,
    notificationStatus: rank(target) >= rank('warning') ? 'awaiting_human_approval' : 'none',
    suppressionReason: null,
  };
}
