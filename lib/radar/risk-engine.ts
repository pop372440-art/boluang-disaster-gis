import { canUseForAlert } from './data-freshness.ts';
import { classifyRiskIndex, getRiskLevelDefinition, RISK_CONFIG } from './threshold-config.ts';
import type { DataFreshness, RiskAssessment } from './types.ts';

export type RiskInput = {
  rain3h: number | null | undefined;
  api7: number | null | undefined;
  slopeDeg?: number | null;
  dataFreshness: DataFreshness;
};

const validNonNegative = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const sumApi7 = (dailyRain: Array<number | null | undefined>): number | null => {
  const days = dailyRain.slice(0, 7);
  if (days.length < 7 || !days.every(validNonNegative)) return null;
  return days.reduce<number>((sum, value) => sum + (value as number), 0);
};

export function assessRisk(input: RiskInput): RiskAssessment {
  const reasons: string[] = [];

  if (!validNonNegative(input.rain3h) || !validNonNegative(input.api7)) {
    reasons.push('ข้อมูลฝนไม่ครบถ้วน ไม่เป็นตัวเลข หรือมีค่าติดลบ');
    const level = getRiskLevelDefinition('unknown');
    return {
      riskIndex: null,
      level: level.key,
      confidence: 'low',
      reasons,
      recommendedActions: level.recommendedActions,
      dataFreshness: input.dataFreshness,
      soilFactor: null,
      terrainFactor: null,
      alertEligible: false,
    };
  }

  const soilFactor = 1 + Math.min(
    input.api7 / RISK_CONFIG.soil.api7Divisor,
    RISK_CONFIG.soil.maxAdditionalFactor,
  );

  const slopeDeg = input.slopeDeg;
  const hasSlope = validNonNegative(slopeDeg);
  let terrainFactor: number = RISK_CONFIG.terrain.flatFactor;
  if (hasSlope && slopeDeg > RISK_CONFIG.terrain.steepSlopeDegrees) {
    terrainFactor = RISK_CONFIG.terrain.steepFactor;
  } else if (hasSlope && slopeDeg > RISK_CONFIG.terrain.moderateSlopeDegrees) {
    terrainFactor = RISK_CONFIG.terrain.moderateFactor;
  }

  if (!hasSlope) reasons.push('ไม่มีข้อมูลความลาดชัน ใช้ค่าอ้างอิง 1.00 และลดระดับความเชื่อมั่น');
  if (!canUseForAlert(input.dataFreshness)) reasons.push('ข้อมูลไม่สดพอสำหรับออกสัญญาณแจ้งเตือน');

  const riskIndex = input.rain3h * soilFactor * terrainFactor;
  const levelKey = classifyRiskIndex(riskIndex);
  const level = getRiskLevelDefinition(levelKey);
  if (riskIndex >= RISK_CONFIG.thresholds.watch) {
    reasons.push(`ดัชนีความเสี่ยง ${riskIndex.toFixed(1)} ผ่านเกณฑ์ระดับ${level.name}`);
  }

  const confidence = !hasSlope || !canUseForAlert(input.dataFreshness) ? 'low' : 'medium';
  return {
    riskIndex,
    level: level.key,
    confidence,
    reasons,
    recommendedActions: level.recommendedActions,
    dataFreshness: input.dataFreshness,
    soilFactor,
    terrainFactor,
    alertEligible: canUseForAlert(input.dataFreshness),
  };
}
