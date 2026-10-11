import {
  studioVersion,
  studioBuildTimestamp,
  studioVersionMarker,
} from "../shared/version";

export function VersionBadge() {
  return (
    <span
      className="studio-version"
      aria-label={`工作台版本 ${studioVersionMarker}`}
      title={`Open Game Studio ${studioVersionMarker} · 构建时间（台北）`}
    >
      <span>v{studioVersion}</span>
      <span className="studio-version-build">-{studioBuildTimestamp}</span>
    </span>
  );
}
