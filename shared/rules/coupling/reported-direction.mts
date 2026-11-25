import type { ReportedDirection } from '../typed/coupling-report-types.mts';
import type { StabilityDirection } from '../stability/stability-types.mts';

export function reportedDirection({
  source,
  target,
  delta,
  cause,
  path,
  message,
}: StabilityDirection): ReportedDirection {
  return {
    source,
    target,
    delta,
    cause,
    ...(path === undefined ? {} : { path }),
    ...(message === undefined ? {} : { message }),
  };
}
