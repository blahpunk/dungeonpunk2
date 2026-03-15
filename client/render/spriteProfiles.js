const DEFAULT_ALPHA_BOUNDS = Object.freeze({
  left: 0,
  top: 0,
  right: 1,
  bottom: 1,
  footX: 0.5,
  footY: 1,
});

function clampNum(value, min, max, fallback = min) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export const SPRITE_PROFILE_VERSION = 2;

export function defaultSpriteProfile(scalePercent = 100) {
  const scale = clampNum(scalePercent, 25, 300, 100);
  return {
    maxHeightPct: scale,
    // Preserve the legacy "large sprite" baseline unless a profile opts into a narrower footprint.
    maxWidthPct: scale,
    combatWidthPct: 100,
    anchorX: 0,
    footOffsetYPct: 0,
    adjacencyNudgePct: 10,
    shadowWidthPct: 44,
    shadowHeightPct: 18,
    trimAlphaThreshold: 10,
  };
}

export function normalizeSpriteProfiles(input = {}, scales = {}) {
  const out = {};
  const src = (input && typeof input === "object") ? input : {};
  const scaleSrc = (scales && typeof scales === "object") ? scales : {};

  for (const spriteId of new Set([...Object.keys(scaleSrc), ...Object.keys(src)])) {
    if (!/^[a-z0-9_]{1,80}$/.test(spriteId)) continue;
    const scale = clampNum(scaleSrc[spriteId], 25, 300, 100);
    const base = defaultSpriteProfile(scale);
    const raw = (src[spriteId] && typeof src[spriteId] === "object") ? src[spriteId] : {};
    out[spriteId] = {
      maxHeightPct: clampNum(raw.maxHeightPct, 25, 300, base.maxHeightPct),
      maxWidthPct: clampNum(raw.maxWidthPct, 25, 220, base.maxWidthPct),
      combatWidthPct: clampNum(raw.combatWidthPct, 55, 140, base.combatWidthPct),
      anchorX: clampNum(raw.anchorX, -50, 50, base.anchorX),
      footOffsetYPct: clampNum(raw.footOffsetYPct, -40, 40, base.footOffsetYPct),
      adjacencyNudgePct: clampNum(raw.adjacencyNudgePct, 0, 25, base.adjacencyNudgePct),
      shadowWidthPct: clampNum(raw.shadowWidthPct, 12, 80, base.shadowWidthPct),
      shadowHeightPct: clampNum(raw.shadowHeightPct, 6, 36, base.shadowHeightPct),
      trimAlphaThreshold: clampNum(raw.trimAlphaThreshold, 1, 255, base.trimAlphaThreshold),
    };
  }

  return out;
}

export function computeSpriteAlphaBounds(img, threshold = 10) {
  const width = Math.max(1, Math.floor(img?.naturalWidth || img?.width || 1));
  const height = Math.max(1, Math.floor(img?.naturalHeight || img?.height || 1));
  if (typeof document === "undefined" || !document?.createElement) return { ...DEFAULT_ALPHA_BOUNDS };

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const cx = canvas.getContext("2d", { alpha: true, willReadFrequently: true });
  if (!cx) return { ...DEFAULT_ALPHA_BOUNDS };

  try {
    cx.clearRect(0, 0, width, height);
    cx.drawImage(img, 0, 0, width, height);
    const pixels = cx.getImageData(0, 0, width, height).data;
    const alphaThreshold = clampNum(threshold, 1, 255, 10);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4 + 3;
        if ((pixels[idx] ?? 0) < alphaThreshold) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) return { ...DEFAULT_ALPHA_BOUNDS };

    const left = minX / width;
    const top = minY / height;
    const right = (maxX + 1) / width;
    const bottom = (maxY + 1) / height;
    return {
      left,
      top,
      right,
      bottom,
      footX: (left + right) / 2,
      footY: bottom,
    };
  } catch {
    return { ...DEFAULT_ALPHA_BOUNDS };
  }
}

export function ensureSpriteBounds(boundsCache, spriteId, img, profile = null) {
  if (!boundsCache || !spriteId || !img) return { ...DEFAULT_ALPHA_BOUNDS };
  if (boundsCache[spriteId]) return boundsCache[spriteId];
  const threshold = clampNum(profile?.trimAlphaThreshold, 1, 255, 10);
  const next = computeSpriteAlphaBounds(img, threshold);
  boundsCache[spriteId] = next;
  return next;
}

export function computeSpriteDrawMetrics({
  img,
  baseTile,
  profile,
  inCombat = false,
  adjacentCount = 0,
  bounds = null,
}) {
  const safeTile = Math.max(1, Number(baseTile) || 1);
  const safeProfile = profile ?? defaultSpriteProfile(100);
  const safeBounds = bounds ?? DEFAULT_ALPHA_BOUNDS;
  const imgW = Math.max(1, Math.floor(img?.naturalWidth || img?.width || 1));
  const imgH = Math.max(1, Math.floor(img?.naturalHeight || img?.height || 1));
  const visibleWNorm = Math.max(0.02, safeBounds.right - safeBounds.left);
  const visibleHNorm = Math.max(0.02, safeBounds.bottom - safeBounds.top);
  const maxHeightPx = safeTile * (clampNum(safeProfile.maxHeightPct, 25, 300, 100) / 100);
  let maxWidthPx = safeTile * (clampNum(safeProfile.maxWidthPct, 25, 220, 100) / 100);

  if (inCombat && adjacentCount > 0) {
    const combatClamp = clampNum(safeProfile.combatWidthPct, 55, 140, 100) / 100;
    maxWidthPx *= combatClamp;
  }

  const visibleWidthPx = imgW * visibleWNorm;
  const visibleHeightPx = imgH * visibleHNorm;
  const scale = Math.min(maxHeightPx / visibleHeightPx, maxWidthPx / visibleWidthPx);
  const drawWidth = Math.max(1, Math.round(imgW * scale));
  const drawHeight = Math.max(1, Math.round(imgH * scale));
  const centerXOffset = Math.round(
    ((0.5 - safeBounds.footX) * drawWidth) + (safeTile * (clampNum(safeProfile.anchorX, -50, 50, 0) / 100))
  );
  const footYOffset = Math.round(safeTile * (clampNum(safeProfile.footOffsetYPct, -40, 40, 0) / 100));
  const shadowWidth = Math.max(4, Math.round(safeTile * (clampNum(safeProfile.shadowWidthPct, 12, 80, 44) / 100)));
  const shadowHeight = Math.max(2, Math.round(safeTile * (clampNum(safeProfile.shadowHeightPct, 6, 36, 18) / 100)));

  return {
    drawWidth,
    drawHeight,
    centerXOffset,
    footYOffset,
    shadowWidth,
    shadowHeight,
    visibleDrawWidth: Math.max(1, Math.round(visibleWidthPx * scale)),
    visibleDrawHeight: Math.max(1, Math.round(visibleHeightPx * scale)),
  };
}

export function buildCombatAdjacencyClusters(entries = []) {
  const live = Array.isArray(entries)
    ? entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          id: String(entry.id ?? ""),
          x: Math.floor(Number(entry.x ?? 0)),
          y: Math.floor(Number(entry.y ?? 0)),
        }))
        .filter((entry) => entry.id)
    : [];
  const byId = new Map(live.map((entry) => [entry.id, entry]));
  const visited = new Set();
  const out = new Map();

  const neighborsOf = (entry) => live.filter((other) =>
    other.id !== entry.id &&
    Math.abs(other.x - entry.x) + Math.abs(other.y - entry.y) <= 1
  );

  for (const entry of live) {
    if (visited.has(entry.id)) continue;
    const queue = [entry];
    const component = [];
    visited.add(entry.id);

    while (queue.length) {
      const cur = queue.shift();
      if (!cur) continue;
      component.push(cur);
      for (const next of neighborsOf(cur)) {
        if (visited.has(next.id)) continue;
        visited.add(next.id);
        queue.push(next);
      }
    }

    if (component.length <= 1) continue;
    component.sort((a, b) => (a.x - b.x) || (a.y - b.y) || a.id.localeCompare(b.id));
    const center = (component.length - 1) / 2;
    for (let i = 0; i < component.length; i++) {
      const cur = component[i];
      out.set(cur.id, {
        slot: i - center,
        count: component.length,
        adjacentCount: component.length - 1,
      });
    }
  }

  for (const entry of live) {
    if (!out.has(entry.id)) out.set(entry.id, { slot: 0, count: 1, adjacentCount: 0 });
  }
  return out;
}

export function getSpriteCombatOffset(entry, clusterMeta = null, profile = null) {
  if (!entry || !clusterMeta) return { xPct: 0, yPct: 0 };
  const safeProfile = profile ?? defaultSpriteProfile(100);
  const xPct = Number(clusterMeta.slot ?? 0) * clampNum(safeProfile.adjacencyNudgePct, 0, 25, 10);
  const yPct = Math.abs(Number(clusterMeta.slot ?? 0)) > 0 ? -Math.min(3, Math.abs(xPct) * 0.18) : 0;
  return { xPct, yPct };
}
