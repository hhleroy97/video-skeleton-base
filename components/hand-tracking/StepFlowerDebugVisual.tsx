'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getFlowerMarkerLifecycleFrame } from '@/lib/flowerMarkerLifecycle';
import { generateStepFlowerShape, generateStepFlowerSprite3D, getStepFlowerVariant } from '@/lib/stepFlowerAsset';

type DebugMarkerStyle = 'flowers' | 'flowers-3d';
type DebugToonTextureMode = 'none' | 'stipple' | 'hatch';
type DebugFoot = 'left' | 'right';

interface DebugMarker {
  spawnedAt: number;
  x: number;
  y: number;
  foot: DebugFoot;
  stepMagnitude: number;
}

interface StepFlowerDebugVisualProps {
  className?: string;
}

export function StepFlowerDebugVisual({ className = '' }: StepFlowerDebugVisualProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const markersRef = useRef<DebugMarker[]>([]);
  const lastSpawnRef = useRef<number>(0);
  const nextFootRef = useRef<DebugFoot>('left');

  const [markerStyle, setMarkerStyle] = useState<DebugMarkerStyle>('flowers-3d');
  const [stepMagnitude, setStepMagnitude] = useState(0.58);
  const [pointScale, setPointScale] = useState(1.0);
  const [bloomSeconds, setBloomSeconds] = useState(0.4);
  const [decaySeconds, setDecaySeconds] = useState(1.12);
  const [spawnIntervalSeconds, setSpawnIntervalSeconds] = useState(0.34);
  const [whimsyIntensity, setWhimsyIntensity] = useState(1.0);
  const [toonTextureMode, setToonTextureMode] = useState<DebugToonTextureMode>('stipple');

  const maxMarkerAgeSeconds = useMemo(() => {
    const grow = Math.max(0.05, bloomSeconds);
    const hold = 0.22;
    const shrink = Math.max(0.2, decaySeconds);
    return grow + hold + shrink;
  }, [bloomSeconds, decaySeconds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    setCanvasSize();
    const supportsResizeObserver = typeof ResizeObserver !== 'undefined';
    const resizeObserver = supportsResizeObserver ? new ResizeObserver(setCanvasSize) : null;
    if (resizeObserver) {
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', setCanvasSize);
    }

    let raf = 0;
    const animate = () => {
      const now = performance.now() / 1000;
      const displayWidth = canvas.clientWidth;
      const displayHeight = canvas.clientHeight;

      if (now - lastSpawnRef.current >= spawnIntervalSeconds) {
        lastSpawnRef.current = now;
        const lane = nextFootRef.current === 'left' ? 0.34 : 0.66;
        const jitterX = (Math.random() - 0.5) * 0.08;
        markersRef.current.push({
          spawnedAt: now,
          x: displayWidth * Math.max(0.12, Math.min(0.88, lane + jitterX)),
          y: displayHeight * (0.84 + Math.random() * 0.07),
          foot: nextFootRef.current,
          stepMagnitude: stepMagnitude * (0.82 + Math.random() * 0.35),
        });
        nextFootRef.current = nextFootRef.current === 'left' ? 'right' : 'left';
      }

      ctx.clearRect(0, 0, displayWidth, displayHeight);
      const bg = ctx.createLinearGradient(0, 0, 0, displayHeight);
      bg.addColorStop(0, '#030712');
      bg.addColorStop(1, '#0f172a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(displayWidth * 0.1, displayHeight * 0.9);
      ctx.lineTo(displayWidth * 0.9, displayHeight * 0.9);
      ctx.stroke();

      markersRef.current = markersRef.current.filter((marker) => {
        const markerAge = Math.max(0, now - marker.spawnedAt);
        if (markerAge > maxMarkerAgeSeconds + 0.1) {
          return false;
        }

        const lifecycle = getFlowerMarkerLifecycleFrame(
          markerAge,
          {
            growSeconds: bloomSeconds,
            holdSeconds: 0.22,
            decaySeconds: Math.max(0.2, decaySeconds),
          },
          whimsyIntensity
        );
        const lifeScale = lifecycle.lifeScale;
        if (lifeScale <= 0.001) {
          return true;
        }

        const seed = Math.floor(marker.spawnedAt * 1000 + marker.stepMagnitude * 1000);
        const variant = getStepFlowerVariant(seed);
        const palette = variant.palette;
        const markerScale = marker.stepMagnitude * pointScale * 0.9;
        const sprite3d =
          markerStyle === 'flowers-3d' ? generateStepFlowerSprite3D(seed, lifeScale, markerScale) : null;
        const flowerShape = sprite3d ? sprite3d.shape : generateStepFlowerShape(seed, lifeScale, markerScale);
        const depthScale = sprite3d?.depthScale ?? 1;
        const whimsy = Math.max(0, whimsyIntensity);
        const squashX = lifecycle.transform.scaleX;
        const stretchY = lifecycle.transform.scaleY;
        const offsetY = lifecycle.transform.offsetY;
        const sway = lifecycle.transform.sway;
        const droop = lifecycle.transform.droop;
        const bloomBoost = 1 + lifecycle.stateProgress * 0.18;
        const seqProgress =
          lifecycle.state === 'growing'
            ? lifecycle.stateProgress
            : lifecycle.state === 'holding'
              ? 1
              : 1 - lifecycle.stateProgress * 0.18;
        const decayProgress = lifecycle.state === 'decaying' ? lifecycle.stateProgress : 0;
        const segmentRamp = (start: number, end: number) => {
          if (end <= start) return seqProgress >= end ? 1 : 0;
          const t = Math.max(0, Math.min(1, (seqProgress - start) / (end - start)));
          return t * t * (3 - 2 * t);
        };
        const stemReveal = segmentRamp(0.02, 0.48);
        const leafReveal = segmentRamp(0.34, 0.7);
        const pollenReveal = segmentRamp(0.56, 0.82);
        const petalReveal = segmentRamp(0.7, 1);

        const mapPoint = (point: { x: number; y: number }) => ({
          x:
            marker.x +
            point.x * depthScale * squashX +
            point.y * depthScale * sway * 0.35,
          y:
            marker.y +
            offsetY +
            point.y * depthScale * stretchY +
            Math.abs(point.y) * droop * 0.05,
        });
        const toOpaqueTone = (hex: string, lift: number) => {
          const clean = hex.trim().replace('#', '');
          const expanded =
            clean.length === 3
              ? `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`
              : clean;
          if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return 'rgb(24, 24, 32)';
          const r = parseInt(expanded.slice(0, 2), 16);
          const g = parseInt(expanded.slice(2, 4), 16);
          const b = parseInt(expanded.slice(4, 6), 16);
          if (lift >= 0) {
            const k = Math.min(1, lift);
            return `rgb(${Math.round(r + (255 - r) * k)}, ${Math.round(g + (255 - g) * k)}, ${Math.round(b + (255 - b) * k)})`;
          }
          const k = Math.max(0, 1 + lift);
          return `rgb(${Math.round(r * k)}, ${Math.round(g * k)}, ${Math.round(b * k)})`;
        };
        const mixOpaqueHex = (fromHex: string, toHex: string, t: number) => {
          const from = fromHex.trim().replace('#', '');
          const to = toHex.trim().replace('#', '');
          const expand = (v: string) =>
            v.length === 3 ? `${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}` : v;
          const a = expand(from);
          const b = expand(to);
          if (!/^[0-9a-fA-F]{6}$/.test(a) || !/^[0-9a-fA-F]{6}$/.test(b)) return fromHex;
          const p = Math.max(0, Math.min(1, t));
          const ar = parseInt(a.slice(0, 2), 16);
          const ag = parseInt(a.slice(2, 4), 16);
          const ab = parseInt(a.slice(4, 6), 16);
          const br = parseInt(b.slice(0, 2), 16);
          const bg = parseInt(b.slice(2, 4), 16);
          const bb = parseInt(b.slice(4, 6), 16);
          return `rgb(${Math.round(ar + (br - ar) * p)}, ${Math.round(ag + (bg - ag) * p)}, ${Math.round(ab + (bb - ab) * p)})`;
        };
        const stemDecayColor =
          decayProgress < 0.38
            ? mixOpaqueHex('#16a34a', '#f59e0b', decayProgress / 0.38)
            : mixOpaqueHex('#f59e0b', '#4a1f0f', (decayProgress - 0.38) / 0.62);
        const botanicalLineColor = lifecycle.state === 'decaying' ? stemDecayColor : toOpaqueTone('#16a34a', 0.08);

        const strokeOutlined = (points: Array<{ x: number; y: number }>, color: string, lineWidth: number) => {
          if (whimsy > 0.01) {
            const outlineAlphaBase = lifecycle.state === 'decaying' ? 0.16 : 0.34;
            const outlineAlphaWhimsy = lifecycle.state === 'decaying' ? 0.24 : 0.44;
            const outlineWidthWhimsy = lifecycle.state === 'decaying' ? 0.72 : 1.45;
            ctx.strokeStyle = `rgba(2, 6, 23, ${outlineAlphaBase + whimsy * outlineAlphaWhimsy})`;
            ctx.lineWidth = lineWidth * (1 + whimsy * outlineWidthWhimsy);
            ctx.beginPath();
            points.forEach((point, idx) => {
              const p = mapPoint(point);
              if (idx === 0) {
                ctx.moveTo(p.x, p.y);
              } else {
                ctx.lineTo(p.x, p.y);
              }
            });
            ctx.stroke();
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = lineWidth;
          ctx.beginPath();
          points.forEach((point, idx) => {
            const p = mapPoint(point);
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.stroke();
        };
        const fillPetalGradient = (points: Array<{ x: number; y: number }>, petalColor: string) => {
          if (points.length < 3) return;
          const first = points[0];
          const last = points[points.length - 1];
          const tip = points[Math.floor(points.length / 2)];
          const baseMapped = mapPoint({
            x: (first.x + last.x) * 0.5,
            y: (first.y + last.y) * 0.5,
          });
          const tipMapped = mapPoint(tip);
          const darkBase = toOpaqueTone(petalColor, -0.48);
          const brightTip = toOpaqueTone(petalColor, 0.62);
          const gradient = ctx.createLinearGradient(baseMapped.x, baseMapped.y, tipMapped.x, tipMapped.y);
          gradient.addColorStop(0, darkBase);
          gradient.addColorStop(0.58, petalColor);
          gradient.addColorStop(1, brightTip);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          points.forEach((point, idx) => {
            const p = mapPoint(point);
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.fill();
        };
        const applyToonTexture = (points: Array<{ x: number; y: number }>, shadeColor: string, strength: number) => {
          if (toonTextureMode === 'none') return;
          if (strength <= 0.01 || points.length < 3) return;
          const mapped = points.map(mapPoint);
          const minX = Math.min(...mapped.map((p) => p.x));
          const maxX = Math.max(...mapped.map((p) => p.x));
          const minY = Math.min(...mapped.map((p) => p.y));
          const maxY = Math.max(...mapped.map((p) => p.y));
          const spacing = Math.max(3.2, 7.2 - strength * 2.4);

          ctx.save();
          ctx.beginPath();
          mapped.forEach((p, idx) => {
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.clip();

          const phase = Math.abs(seed % 97);
          if (toonTextureMode === 'hatch') {
            ctx.strokeStyle = shadeColor;
            ctx.lineWidth = Math.max(0.45, 0.35 + strength * 0.6);
            const span = Math.max(maxX - minX, maxY - minY) + spacing * 3;
            for (let x = minX - span; x <= maxX + span; x += spacing) {
              ctx.beginPath();
              ctx.moveTo(x + phase, minY - spacing);
              ctx.lineTo(x + span * 0.7 + phase, maxY + spacing);
              ctx.stroke();
            }
          } else {
            const dotSize = 0.7 + strength * 0.85;
            ctx.fillStyle = shadeColor;
            for (let y = minY - spacing; y <= maxY + spacing; y += spacing) {
              for (let x = minX - spacing; x <= maxX + spacing; x += spacing) {
                const checker = (Math.floor((x + phase) / spacing) + Math.floor((y + phase) / spacing)) % 2;
                if (checker !== 0) continue;
                ctx.beginPath();
                ctx.arc(x, y, dotSize, 0, Math.PI * 2);
                ctx.fill();
              }
            }
          }
          ctx.restore();
        };
        const fillLeafGradient = (points: Array<{ x: number; y: number }>) => {
          if (points.length < 3) return;
          const mapped = points.map(mapPoint);
          const minY = Math.min(...mapped.map((p) => p.y));
          const maxY = Math.max(...mapped.map((p) => p.y));
          const centerX = mapped.reduce((sum, p) => sum + p.x, 0) / mapped.length;
          const leafBaseColor = mixOpaqueHex(palette.leafStroke, '#b45309', decayProgress * 0.92);
          const gradient = ctx.createLinearGradient(centerX, maxY, centerX, minY);
          gradient.addColorStop(0, toOpaqueTone(leafBaseColor, -0.45));
          gradient.addColorStop(0.6, leafBaseColor);
          gradient.addColorStop(1, toOpaqueTone(leafBaseColor, 0.45));
          ctx.fillStyle = gradient;
          ctx.beginPath();
          mapped.forEach((p, idx) => {
            if (idx === 0) {
              ctx.moveTo(p.x, p.y);
            } else {
              ctx.lineTo(p.x, p.y);
            }
          });
          ctx.closePath();
          ctx.fill();
        };
        const trimStrokeByReveal = (points: Array<{ x: number; y: number }>, reveal: number) => {
          if (reveal <= 0.001 || points.length <= 1) return [] as Array<{ x: number; y: number }>;
          if (reveal >= 0.999) return points;
          const idx = Math.max(1, Math.floor((points.length - 1) * reveal));
          return points.slice(0, idx + 1);
        };

        const primaryLineWidth = 1.2 + lifeScale * 0.95;
        const detailLineWidth = 1 + lifeScale * 0.75;

        ctx.save();
        const visibleAlpha =
          lifecycle.state === 'decaying'
            ? Math.max(0.18, lifeScale * 0.95 + 0.12)
            : Math.max(0.1, lifeScale);
        ctx.globalAlpha *= visibleAlpha;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (sprite3d) {
          const shadowY = marker.y + lifecycle.transform.offsetY + sprite3d.shadowOffsetY;
          const shadowGrad = ctx.createRadialGradient(
            marker.x,
            shadowY,
            sprite3d.shadowRadius * 0.15,
            marker.x,
            shadowY,
            sprite3d.shadowRadius
          );
          shadowGrad.addColorStop(0, palette.shadowInner);
          shadowGrad.addColorStop(1, palette.shadowOuter);
          ctx.fillStyle = shadowGrad;
          ctx.beginPath();
          ctx.ellipse(
            marker.x,
            shadowY,
            sprite3d.shadowRadius * squashX * 1.08,
            sprite3d.shadowRadius * 0.42 * Math.max(0.72, 1 - lifecycle.transform.droop * 0.9),
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        const stemShrink = Math.max(0.14, 1 - decayProgress * 0.78);
        const animateStemStroke = (
          points: Array<{ x: number; y: number }>,
          parentShift: { x: number; y: number } = { x: 0, y: 0 }
        ) => {
          const visibleBase = trimStrokeByReveal(points, stemReveal);
          const stemRoot = visibleBase[0] ?? { x: 0, y: 0 };
          const visible = visibleBase.map((p) => ({
            x: stemRoot.x + (p.x - stemRoot.x) * stemShrink + parentShift.x,
            y:
              stemRoot.y +
              (p.y - stemRoot.y) * stemShrink +
              decayProgress * Math.abs(p.y - stemRoot.y) * 0.34 +
              parentShift.y,
          }));
          return { visibleBase, visible };
        };

        const mainStem = animateStemStroke(flowerShape.stem.points);
        const stemStrokes = [flowerShape.stem, ...(flowerShape.branches ?? [])];
        const animatedStemRecords: Array<{
          visibleBase: Array<{ x: number; y: number }>;
          visible: Array<{ x: number; y: number }>;
          baseTip: { x: number; y: number };
          animatedTip: { x: number; y: number };
          shift: { x: number; y: number };
        }> = [];
        for (let idx = 0; idx < stemStrokes.length; idx += 1) {
          const stemStroke = stemStrokes[idx];
          let parentShift = { x: 0, y: 0 };
          if (idx > 0) {
            const stemRoot = stemStroke.points[0] ?? { x: 0, y: 0 };
            let bestDist = Number.POSITIVE_INFINITY;
            let bestShift = { x: 0, y: 0 };
            for (const parentStem of animatedStemRecords) {
              for (let i = 0; i < parentStem.visibleBase.length; i += 1) {
                const basePoint = parentStem.visibleBase[i];
                const animatedPoint = parentStem.visible[i] ?? basePoint;
                const dx = stemRoot.x - basePoint.x;
                const dy = stemRoot.y - basePoint.y;
                const d2 = dx * dx + dy * dy;
                if (d2 < bestDist) {
                  bestDist = d2;
                  bestShift = { x: animatedPoint.x - basePoint.x, y: animatedPoint.y - basePoint.y };
                }
              }
            }
            parentShift = bestShift;
          }
          const animated = idx === 0 ? mainStem : animateStemStroke(stemStroke.points, parentShift);
          const baseTip =
            animated.visibleBase[animated.visibleBase.length - 1] ??
            stemStroke.points[stemStroke.points.length - 1] ?? { x: 0, y: 0 };
          const animatedTip = animated.visible[animated.visible.length - 1] ?? baseTip;
          animatedStemRecords.push({
            visibleBase: animated.visibleBase,
            visible: animated.visible,
            baseTip,
            animatedTip,
            shift: { x: animatedTip.x - baseTip.x, y: animatedTip.y - baseTip.y },
          });
        }
        for (const stemRecord of animatedStemRecords) {
          if (stemRecord.visible.length > 1) {
            strokeOutlined(
              stemRecord.visible,
              botanicalLineColor,
              Math.max(0.65, primaryLineWidth * (1 - decayProgress * 0.28))
            );
          }
        }
        const mainStemRecord = animatedStemRecords[0];
        const animatedTip = mainStemRecord?.animatedTip ?? { x: 0, y: 0 };
        const getClosestStemRecord = (point: { x: number; y: number }) => {
          let bestRecord = mainStemRecord;
          let bestDist = Number.POSITIVE_INFINITY;
          for (const stemRecord of animatedStemRecords) {
            const dx = point.x - stemRecord.baseTip.x;
            const dy = point.y - stemRecord.baseTip.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) {
              bestDist = d2;
              bestRecord = stemRecord;
            }
          }
          return bestRecord ?? {
            visible: [] as Array<{ x: number; y: number }>,
            baseTip: { x: 0, y: 0 },
            animatedTip: { x: 0, y: 0 },
            shift: { x: 0, y: 0 },
          };
        };

        const getClosestStemPointShift = (point: { x: number; y: number }) => {
          let bestShift = { x: 0, y: 0 };
          let bestDist = Number.POSITIVE_INFINITY;
          for (const stemRecord of animatedStemRecords) {
            for (let i = 0; i < stemRecord.visibleBase.length; i += 1) {
              const basePoint = stemRecord.visibleBase[i];
              const animatedPoint = stemRecord.visible[i] ?? basePoint;
              const dx = point.x - basePoint.x;
              const dy = point.y - basePoint.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < bestDist) {
                bestDist = d2;
                bestShift = { x: animatedPoint.x - basePoint.x, y: animatedPoint.y - basePoint.y };
              }
            }
          }
          return bestShift;
        };

        for (const leaf of flowerShape.leaves) {
          const base = leaf.points[0] ?? { x: 0, y: 0 };
          const stemPointShift = getClosestStemPointShift(base);
          const leafDroop = decayProgress * (0.9 + droop * 2.6);
          const animated = leaf.points.map((p) => ({
            x:
              base.x +
              stemPointShift.x +
              (p.x - base.x) * leafReveal * (1 - decayProgress * 0.48) -
              (p.x - base.x) * leafDroop * 0.22,
            y:
              base.y +
              stemPointShift.y +
              (p.y - base.y) * leafReveal * (1 - decayProgress * 0.24) +
              decayProgress * (0.9 + Math.abs(p.x - base.x) * 0.18) +
              leafDroop * (0.55 + Math.abs(p.x - base.x) * 0.24 + Math.max(0, -(p.y - base.y)) * 0.28),
          }));
          fillLeafGradient(animated);
          applyToonTexture(animated, toOpaqueTone('#3f1d0d', -0.15), whimsy * 0.35 * leafReveal);
          strokeOutlined(animated, botanicalLineColor, detailLineWidth);
        }

        const petalPalette = palette.petalLayerStrokes?.length ? palette.petalLayerStrokes : [palette.petalStroke];
        for (const petal of flowerShape.petals) {
          const petalBaseColor = petalPalette[petal.colorIndex % petalPalette.length] ?? palette.petalStroke;
          const petalToGold = mixOpaqueHex(petalBaseColor, '#d97706', Math.min(1, decayProgress * 1.25));
          const petalColor = mixOpaqueHex(petalToGold, '#7c2d12', Math.max(0, (decayProgress - 0.4) / 0.6));
          const layeredWidth = Math.max(0.7, detailLineWidth * (1 - Math.min(0.35, petal.layer * 0.09)));
          const base = petal.points[0] ?? { x: 0, y: 0 };
          const gravityDrop = (1 - petalReveal) * (0.6 + whimsy * 0.35) * (1 + petal.layer * 0.2);
          const bloomT = petalReveal * petalReveal * (3 - 2 * petalReveal);
          const spread = 0.03 + bloomT * 1.02;
          const lift = 0.08 + bloomT * 0.92;
          const budPull = (1 - bloomT) * 0.34;
          const petalDroop = decayProgress * (0.65 + droop * 2.4);
          const animated = petal.points.map((p, idx) => {
            const relX = p.x - base.x;
            const relY = p.y - base.y;
            const tipBias = idx / Math.max(1, petal.points.length - 1);
            const stemRecord = getClosestStemRecord(base);
            const stemShift = stemRecord.shift;
            const anchorX = base.x + stemShift.x;
            const anchorY = base.y + stemShift.y;
            const bloomX = relX * spread * (1 - decayProgress * 0.22) - relX * budPull;
            const bloomY =
              relY * lift * (1 - decayProgress * 0.14) +
              gravityDrop * (0.4 + tipBias * 0.9) +
              Math.abs(relX) * (1 - petalReveal) * 0.12 +
              decayProgress * (0.16 + tipBias * 0.36);
            const wiltCollapse = 1 - Math.min(0.7, petalDroop * (0.5 + tipBias * 0.7));
            const wiltTilt = petalDroop * (0.35 + tipBias * 0.95);
            const wiltX = bloomX * wiltCollapse;
            const wiltY =
              bloomY +
              petalDroop * (0.55 + tipBias * 1.45 + Math.abs(relX) * 0.45) +
              Math.abs(wiltX) * wiltTilt * 0.9;
            const centerDx = base.x - stemRecord.animatedTip.x;
            const centerSign =
              Math.abs(centerDx) > 0.001 ? Math.sign(centerDx) : Math.sign(relX || 1);
            const rotateAway =
              centerSign *
              petalDroop *
              (0.22 + tipBias * 0.55 + Math.min(0.3, Math.abs(centerDx) * 0.08));
            const cosRot = Math.cos(rotateAway);
            const sinRot = Math.sin(rotateAway);
            const rotatedX = wiltX * cosRot - wiltY * sinRot;
            const rotatedY = wiltX * sinRot + wiltY * cosRot;
            return {
              x: anchorX + rotatedX - relX * petalDroop * 0.22,
              y: anchorY + rotatedY,
            };
          });
          fillPetalGradient(animated, petalColor);
          applyToonTexture(animated, toOpaqueTone(petalColor, -0.62), whimsy * (0.45 + petal.layer * 0.08) * petalReveal);
          strokeOutlined(animated, petalColor, layeredWidth);
        }

        const blossomCenter = mapPoint(animatedTip);
        const pollenRadius =
          (sprite3d ? sprite3d.coreRadius * 0.85 : 1.5 + markerScale * 1.35) *
          (0.82 + lifeScale * 0.35) *
          pollenReveal *
          (lifecycle.state === 'decaying' ? Math.max(0, 1 - decayProgress * 2.6) : 1);
        ctx.fillStyle = palette.pollenFill;
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.72)';
        ctx.lineWidth = Math.max(0.7, 0.55 + whimsy * 0.5);
        if (pollenRadius > 0.01) {
          ctx.beginPath();
          ctx.arc(blossomCenter.x, blossomCenter.y, pollenRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        if (sprite3d) {
          const blossomY = marker.y + animatedTip.y * sprite3d.depthScale * stretchY;
          const blossomGrad = ctx.createRadialGradient(
            marker.x,
            blossomY,
            sprite3d.coreRadius * 0.2,
            marker.x,
            blossomY,
            sprite3d.blossomRadius * bloomBoost
          );
          blossomGrad.addColorStop(0, palette.glowInner);
          blossomGrad.addColorStop(1, palette.glowOuter);
          ctx.fillStyle = blossomGrad;
          ctx.beginPath();
          ctx.ellipse(
            marker.x,
            blossomY,
            sprite3d.blossomRadius * squashX * bloomBoost,
            sprite3d.blossomRadius * stretchY * bloomBoost,
            0,
            0,
            Math.PI * 2
          );
          ctx.fill();
        }

        ctx.restore();
        return true;
      });

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', setCanvasSize);
      }
    };
  }, [
    bloomSeconds,
    decaySeconds,
    markerStyle,
    maxMarkerAgeSeconds,
    pointScale,
    spawnIntervalSeconds,
    stepMagnitude,
    whimsyIntensity,
    toonTextureMode,
  ]);

  return (
    <div className={`relative h-full w-full overflow-hidden rounded-xl bg-black ${className}`}>
      <canvas ref={canvasRef} className="h-full w-full" />

      <div className="absolute left-3 top-3 rounded bg-black/65 px-3 py-2 text-xs text-white/90">
        Step Flower Marker Lab (viz9 marker renderer)
      </div>

      <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-white/20 bg-black/65 p-3 text-xs text-white/90">
        <div className="mb-2 font-medium">Debug Controls</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-8">
          <label className="flex flex-col gap-1">
            <span>Style</span>
            <select
              value={markerStyle}
              onChange={(event) => setMarkerStyle(event.target.value as DebugMarkerStyle)}
              className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
            >
              <option value="flowers">Growing flowers</option>
              <option value="flowers-3d">Growing flowers (3D)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Step magnitude: {stepMagnitude.toFixed(2)}</span>
            <input
              type="range"
              min="0.2"
              max="10"
              step="0.01"
              value={stepMagnitude}
              onChange={(event) => setStepMagnitude(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Point scale: {pointScale.toFixed(2)}</span>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.01"
              value={pointScale}
              onChange={(event) => setPointScale(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Bloom timing: {bloomSeconds.toFixed(2)}s</span>
            <input
              type="range"
              min="0.05"
              max="3"
              step="0.01"
              value={bloomSeconds}
              onChange={(event) => setBloomSeconds(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Decay timing: {decaySeconds.toFixed(2)}s</span>
            <input
              type="range"
              min="0.2"
              max="5"
              step="0.01"
              value={decaySeconds}
              onChange={(event) => setDecaySeconds(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Spawn interval: {spawnIntervalSeconds.toFixed(2)}s</span>
            <input
              type="range"
              min="0.15"
              max="1.2"
              step="0.01"
              value={spawnIntervalSeconds}
              onChange={(event) => setSpawnIntervalSeconds(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Whimsy intensity: {whimsyIntensity.toFixed(2)}x</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={whimsyIntensity}
              onChange={(event) => setWhimsyIntensity(parseFloat(event.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Toon texture</span>
            <select
              value={toonTextureMode}
              onChange={(event) => setToonTextureMode(event.target.value as DebugToonTextureMode)}
              className="rounded border border-white/20 bg-slate-900 px-2 py-1 text-xs text-white"
            >
              <option value="none">None</option>
              <option value="stipple">Stipple</option>
              <option value="hatch">Hatch</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}
