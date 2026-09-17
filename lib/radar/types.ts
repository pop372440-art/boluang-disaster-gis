export type DataFreshnessStatus = 'fresh' | 'stale' | 'expired' | 'unknown';

export type DataFreshness = {
  status: DataFreshnessStatus;
  observedAt: string | null;
  checkedAt: string;
  ageMinutes: number | null;
  staleAfterMinutes: number;
  expireAfterMinutes: number;
};

export type DataSourceState = 'idle' | 'loading' | 'fresh' | 'stale' | 'error';

export type DataSourceStatus = {
  state: DataSourceState;
  source: string;
  timestamp: string | null;
  freshness: DataFreshness | null;
  error: string | null;
};

export type RadarFrameKind = 'observed' | 'nowcast';

export type RadarFrame = {
  time: number;
  path: string;
  kind: RadarFrameKind;
};

export type RadarMetadata = {
  source: 'RainViewer';
  generatedAt: string;
  fetchedAt: string;
  frames: RadarFrame[];
  observedFrames: RadarFrame[];
  nowcastFrames: RadarFrame[];
  pastCount: number;
};

export type RiskLevelKey = 'normal' | 'watch' | 'warning' | 'danger' | 'critical' | 'unknown';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export type RiskAssessment = {
  riskIndex: number | null;
  level: RiskLevelKey;
  confidence: ConfidenceLevel;
  reasons: string[];
  recommendedActions: string[];
  dataFreshness: DataFreshness;
  soilFactor: number | null;
  terrainFactor: number | null;
  alertEligible: boolean;
};
