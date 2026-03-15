function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function drawFootShadow(ctx2d, cx, footY, width, height, alpha = 0.4) {
  if (!ctx2d) return;
  const shadowW = Math.max(4, Math.floor(width || 4));
  const shadowH = Math.max(2, Math.floor(height || 2));
  ctx2d.save();
  ctx2d.fillStyle = `rgba(0,0,0,${clampNum(alpha, 0.05, 0.9, 0.4)})`;
  ctx2d.beginPath();
  ctx2d.ellipse(Math.round(cx), Math.round(footY), shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}

export function drawTargetRing(ctx2d, cx, footY, radius, color = "#ffd166") {
  if (!ctx2d) return;
  const ringRadius = Math.max(8, Math.floor(radius || 8));
  ctx2d.save();
  ctx2d.lineWidth = Math.max(2, Math.floor(ringRadius * 0.12));
  ctx2d.strokeStyle = color;
  ctx2d.beginPath();
  ctx2d.arc(Math.round(cx), Math.round(footY), ringRadius, 0, Math.PI * 2);
  ctx2d.stroke();
  ctx2d.globalAlpha = 0.18;
  ctx2d.fillStyle = color;
  ctx2d.beginPath();
  ctx2d.arc(Math.round(cx), Math.round(footY), ringRadius * 0.8, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.restore();
}

export function drawIntentBadge(ctx2d, cx, topY, label = "!", color = "#ff835a") {
  if (!ctx2d) return;
  const text = String(label || "!").slice(0, 2) || "!";
  const radius = 13;
  const x = Math.round(cx);
  const y = Math.round(topY);
  ctx2d.save();
  ctx2d.fillStyle = "rgba(12,16,22,0.88)";
  ctx2d.beginPath();
  ctx2d.arc(x, y, radius, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.lineWidth = 2;
  ctx2d.strokeStyle = color;
  ctx2d.stroke();
  ctx2d.fillStyle = color;
  ctx2d.font = "bold 14px ui-sans-serif, system-ui, sans-serif";
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  ctx2d.fillText(text, x, y + 0.5);
  ctx2d.restore();
}

export function drawLineTelegraph(ctx2d, fromX, fromY, toX, toY, options = {}) {
  if (!ctx2d) return;
  const color = String(options.color ?? "#ff8b66");
  const width = Math.max(2, Math.floor(Number(options.lineWidth ?? 6) || 6));
  ctx2d.save();
  ctx2d.setLineDash([width * 1.2, width * 0.9]);
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = width;
  ctx2d.globalAlpha = clampNum(options.alpha, 0.08, 0.92, 0.34);
  ctx2d.beginPath();
  ctx2d.moveTo(Math.round(fromX), Math.round(fromY));
  ctx2d.lineTo(Math.round(toX), Math.round(toY));
  ctx2d.stroke();
  ctx2d.restore();
}

export function drawCellHighlight(ctx2d, cx, cy, size, color = "#ff8b66", alpha = 0.18) {
  if (!ctx2d) return;
  const boxSize = Math.max(6, Math.floor(size || 6));
  const x = Math.round(cx - boxSize / 2);
  const y = Math.round(cy - boxSize / 2);
  ctx2d.save();
  ctx2d.fillStyle = color;
  ctx2d.globalAlpha = clampNum(alpha, 0.05, 0.8, 0.18);
  ctx2d.fillRect(x, y, boxSize, boxSize);
  ctx2d.globalAlpha = clampNum(alpha * 2, 0.08, 0.95, 0.36);
  ctx2d.lineWidth = Math.max(2, Math.floor(boxSize * 0.08));
  ctx2d.strokeStyle = color;
  ctx2d.strokeRect(x, y, boxSize, boxSize);
  ctx2d.restore();
}
