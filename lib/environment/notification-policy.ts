export type EnvironmentalSourceKind = 'satellite' | 'model' | 'citizen_report';

export const notificationAudiencesForSource = (sourceKind: EnvironmentalSourceKind) =>
  sourceKind === 'model' ? ['staff'] as const : ['staff', 'public'] as const;
