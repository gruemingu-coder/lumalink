export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));

  if (diffSec < 60) return "방금 전";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.round(diffHour / 24);
  return `${diffDay}일 전`;
}

export function latencyTone(latencyMs: number): "success" | "warning" | "danger" {
  if (latencyMs <= 25) return "success";
  if (latencyMs <= 60) return "warning";
  return "danger";
}

export function latencyLabel(latencyMs: number): string {
  if (latencyMs <= 25) return "매우 낮음";
  if (latencyMs <= 60) return "보통";
  return "높음";
}

export function formatHours(hours: number): string {
  if (hours <= 0) return "플레이 기록 없음";
  if (hours < 1) return "1시간 미만";
  return `${Math.round(hours)}시간`;
}
