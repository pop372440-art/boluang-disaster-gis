export type EnvironmentalSourceKind = 'satellite' | 'model' | 'citizen_report';
export type EnvironmentalAlertLevel = 'watch' | 'warning' | 'critical';

/**
 * Routine alerts go to exactly one operational/public destination. The staff
 * LINE group is an escalation channel only; all candidates remain visible in
 * Staff Portal regardless of whether a staff LINE message is created.
 */
export function notificationAudiencesForCandidate(
  sourceKind: EnvironmentalSourceKind,
  level: EnvironmentalAlertLevel,
): ReadonlyArray<'staff' | 'public'> {
  if (sourceKind === 'model') return level === 'critical' ? ['staff'] : [];
  return level === 'critical' ? ['public', 'staff'] : ['public'];
}
