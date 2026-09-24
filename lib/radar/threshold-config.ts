import type { RiskLevelKey } from './types.ts';

export const RISK_CONFIG = {
  thresholds: {
    watch: 10,
    warning: 35,
    danger: 60,
    critical: 90,
  },
  soil: {
    api7Divisor: 120,
    maxAdditionalFactor: 0.5,
  },
  terrain: {
    moderateSlopeDegrees: 12,
    steepSlopeDegrees: 20,
    flatFactor: 1,
    moderateFactor: 1.1,
    steepFactor: 1.25,
  },
  freshness: {
    radarStaleAfterMinutes: 20,
    radarExpireAfterMinutes: 40,
    forecastStaleAfterMinutes: 15,
    forecastExpireAfterMinutes: 30,
    metNorwayStaleAfterMinutes: 90,
    metNorwayExpireAfterMinutes: 180,
    outlookStaleAfterMinutes: 120,
    outlookExpireAfterMinutes: 360,
  },
  villageSampling: {
    minPoints: 5,
    maxPoints: 12,
    targetAreaPerPointKm2: 12,
    // The operational statistic is named explicitly; p90 remains diagnostic.
    // Name the operational choice honestly and retain p90 only as a diagnostic.
    aggregationMethod: 'max' as const,
    minimumCoverage: 0.6,
  },
  forecastAgreement: {
    // Initial operational thresholds. These must be calibrated against local
    // rain gauges and recorded events before being treated as validated.
    highDifferenceMm: 2,
    mediumDifferenceMm: 5,
    highRelativeDifference: 0.35,
    mediumRelativeDifference: 0.6,
  },
  longRangeOutlook: {
    startLeadDay: 7,
    endLeadDay: 9,
    // Initial planning thresholds only; calibrate with local gauges and events.
    monitorRainMm: 20,
    prepareRainMm: 50,
    monitorProbabilityPct: 60,
    prepareProbabilityPct: 60,
    agreementMm: 15,
  },
  alert: {
    promotionCycles: 2,
    demotionCycles: 2,
    hysteresisMargin: 5,
    requireHumanApproval: true,
  },
} as const;

export type RiskLevelDefinition = {
  key: RiskLevelKey;
  name: string;
  color: string;
  glow: string;
  recommendedActions: string[];
};

export const RISK_LEVELS: RiskLevelDefinition[] = [
  {
    key: 'normal',
    name: 'ปกติ',
    color: '#22C55E',
    glow: 'rgba(34,197,94,.8)',
    recommendedActions: ['ติดตามข้อมูลตามรอบปกติ'],
  },
  {
    key: 'watch',
    name: 'เฝ้าระวัง',
    color: '#FACC15',
    glow: 'rgba(250,204,21,.8)',
    recommendedActions: ['เสนอให้เจ้าหน้าที่ตรวจสอบลำห้วย ทางน้ำ และจุดเสี่ยงในพื้นที่'],
  },
  {
    key: 'warning',
    name: 'เตือนภัย',
    color: '#F97316',
    glow: 'rgba(249,115,22,.8)',
    recommendedActions: ['เสนอให้ประสานผู้นำชุมชนและตรวจสอบกลุ่มเปราะบาง'],
  },
  {
    key: 'danger',
    name: 'อันตราย',
    color: '#EF4444',
    glow: 'rgba(239,68,68,.9)',
    recommendedActions: ['เสนอให้ศูนย์ปฏิบัติการประเมินพื้นที่จริงและพิจารณามาตรการตอบโต้'],
  },
  {
    key: 'critical',
    name: 'วิกฤต',
    color: '#A855F7',
    glow: 'rgba(168,85,247,.9)',
    recommendedActions: ['เสนอให้ผู้มีอำนาจประเมินและอนุมัติมาตรการฉุกเฉินตามแผนท้องถิ่น'],
  },
  {
    key: 'unknown',
    name: 'ข้อมูลไม่เพียงพอ',
    color: '#94A3B8',
    glow: 'rgba(148,163,184,.6)',
    recommendedActions: ['ตรวจสอบแหล่งข้อมูลก่อนใช้ประกอบการตัดสินใจ'],
  },
];

export const getRiskLevelDefinition = (key: RiskLevelKey) =>
  RISK_LEVELS.find((level) => level.key === key) ?? RISK_LEVELS[RISK_LEVELS.length - 1];

export const classifyRiskIndex = (riskIndex: number): RiskLevelKey => {
  if (riskIndex >= RISK_CONFIG.thresholds.critical) return 'critical';
  if (riskIndex >= RISK_CONFIG.thresholds.danger) return 'danger';
  if (riskIndex >= RISK_CONFIG.thresholds.warning) return 'warning';
  if (riskIndex >= RISK_CONFIG.thresholds.watch) return 'watch';
  return 'normal';
};
