import { computeDotLayout, rectPolygon, rotatePolygon, polygonBounds, translatePolygon } from "./src/lib/cutfile/geometry";
import { nestPieces } from "./src/lib/cutfile/nesting";

// Simulate the exact real scenario: a 600x800 rectangular piece (default
// canvas outline) and a 600x600 star piece (tight traced outline), nested
// together with all rotations allowed -- then replicate pdfIO.ts's toSheet
// transform exactly to check whether dots end up outside the design content
// for EVERY placement (including rotated ones), which is what "dots coming
// inside the print area" would mean if there's a real transform bug.

const rectLayout = computeDotLayout({
  trimWidthMm: 600, trimHeightMm: 800, bleedMm: 14,
  dotDiameterMm: 6, dotHaloMm: 2, haloClearanceMm: 2, marginMm: 4,
  topCount: 3, bottomCount: 3, leftCount: 2, rightCount: 2,
});
console.log("rect canvas:", rectLayout.canvasWidthMm, rectLayout.canvasHeightMm, "offset:", rectLayout.contentOffsetMm);

const starLayout = computeDotLayout({
  trimWidthMm: 600, trimHeightMm: 600, bleedMm: 14,
  dotDiameterMm: 6, dotHaloMm: 2, haloClearanceMm: 2, marginMm: 4,
  topCount: 3, bottomCount: 3, leftCount: 2, rightCount: 2,
});
console.log("star canvas:", starLayout.canvasWidthMm, starLayout.canvasHeightMm, "offset:", starLayout.contentOffsetMm);

// A simple 5-point star inscribed in the 600x600 content box (content-local,
// then shifted into canvas-local via +contentOffsetMm, matching autoTraceOutline).
function star(cx: number, cy: number, rOuter: number, rInner: number, points = 5) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = (Math.PI / points) * i - Math.PI / 2;
    pts.push({ x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) });
  }
  return pts;
}
const rawStar = star(300, 300, 290, 130); // inscribed within 600x600
const starOutline = rawStar.map((p) => ({ x: p.x + starLayout.contentOffsetMm, y: p.y + starLayout.contentOffsetMm }));

const rectOutline = rectPolygon(rectLayout.canvasWidthMm, rectLayout.canvasHeightMm);

const result = nestPieces({
  sheetWidthMm: 1400,
  sheetHeightMm: 1400,
  spacingMm: 10,
  resolutionMm: 4,
  pieces: [
    { pieceId: "rect", label: "rect", outline: rectOutline, quantity: 1, allowRotationsDeg: [0, 90, 180, 270] },
    { pieceId: "star", label: "star", outline: starOutline, quantity: 1, allowRotationsDeg: [0, 90, 180, 270] },
  ],
});
console.log("\nplacements:", result.placements.map(p => ({ id: p.pieceId, rot: p.rotationDeg, x: p.x.toFixed(1), y: p.y.toFixed(1) })));

// Replicate pdfIO.ts's toSheet exactly for each placement, for both pieces,
// and check: is the DESIGN's own bounding box (rect: full content; star: the
// 600x600 content box) always outside the dots by at least haloClearance?
function checkPiece(pieceId: string, srcOutline: {x:number,y:number}[], contentOffsetMm: number, contentW: number, contentH: number, dots: {x:number,y:number}[]) {
  const placement = result.placements.find(p => p.pieceId === pieceId)!;
  const rot = placement.rotationDeg;
  const rotatedLocalOutline = rotatePolygon(srcOutline, rot);
  const constX = placement.outline[0].x - rotatedLocalOutline[0].x;
  const constY = placement.outline[0].y - rotatedLocalOutline[0].y;
  const toSheet = (p: {x:number,y:number}) => { const [r] = rotatePolygon([p], rot); return { x: r.x + constX, y: r.y + constY }; };

  // Design content corners (canvas-local, before transform)
  const designLocal = [
    { x: contentOffsetMm, y: contentOffsetMm },
    { x: contentOffsetMm + contentW, y: contentOffsetMm },
    { x: contentOffsetMm + contentW, y: contentOffsetMm + contentH },
    { x: contentOffsetMm, y: contentOffsetMm + contentH },
  ];
  const designOnSheet = designLocal.map(toSheet);
  const designBounds = polygonBounds(designOnSheet);
  const dotsOnSheet = dots.map(toSheet);

  console.log(`\n${pieceId} rot=${rot} designBounds=`, { minX: designBounds.minX.toFixed(1), maxX: designBounds.maxX.toFixed(1), minY: designBounds.minY.toFixed(1), maxY: designBounds.maxY.toFixed(1) });
  for (const d of dotsOnSheet) {
    const inside = d.x > designBounds.minX && d.x < designBounds.maxX && d.y > designBounds.minY && d.y < designBounds.maxY;
    if (inside) console.log(`  DOT INSIDE DESIGN BOUNDS at (${d.x.toFixed(1)}, ${d.y.toFixed(1)})`);
  }
  console.log(`  all ${dotsOnSheet.length} dots outside design bounds: ${dotsOnSheet.every(d => !(d.x > designBounds.minX && d.x < designBounds.maxX && d.y > designBounds.minY && d.y < designBounds.maxY))}`);
}

checkPiece("rect", rectOutline, rectLayout.contentOffsetMm, 600, 800, rectLayout.dots);
checkPiece("star", starOutline, starLayout.contentOffsetMm, 600, 600, starLayout.dots);
