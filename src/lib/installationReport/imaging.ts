// Client-side image helpers for the Installation Report tool. Every photo
// stays on the operator's machine — a <input type="file"> reads it locally,
// this module resizes/crops it on an offscreen <canvas>, and pdfBuild.ts
// embeds the resulting JPEG bytes directly into the PDF being assembled in
// the browser. Nothing here ever uploads a photo anywhere.

export interface PreparedImage {
  /** JPEG bytes, already cropped to the target box's aspect ratio ("cover" — fills the box edge to edge, no letterboxing) and capped in resolution so a 12MP phone photo doesn't bloat the PDF. */
  bytes: Uint8Array;
  widthPx: number;
  heightPx: number;
}

const MAX_OUTPUT_DIM = 1600; // px on the longer edge — plenty for a full-page report photo, keeps file size sane

/** For on-screen thumbnails only — caller is responsible for revoking this when the slot's file changes or unmounts. */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Couldn't read ${file.name} as an image`));
    };
    img.src = url;
  });
}

/**
 * Crops + scales `file` to exactly fill a box with aspect ratio
 * boxWidth:boxHeight ("cover" behavior, like CSS object-fit: cover) so
 * every photo in the exported report fills its slot edge-to-edge with no
 * white bars — matching the reference report's cropped photo boxes.
 */
export async function prepareCoverImage(file: File, boxWidth: number, boxHeight: number): Promise<PreparedImage> {
  const img = await loadHtmlImage(file);
  try {
    const boxAspect = boxWidth / boxHeight;
    const srcAspect = img.naturalWidth / img.naturalHeight;

    let sx = 0;
    let sy = 0;
    let sw = img.naturalWidth;
    let sh = img.naturalHeight;
    if (srcAspect > boxAspect) {
      // Source is relatively wider than the box — crop left/right.
      sw = img.naturalHeight * boxAspect;
      sx = (img.naturalWidth - sw) / 2;
    } else {
      // Source is relatively taller than the box — crop top/bottom.
      sh = img.naturalWidth / boxAspect;
      sy = (img.naturalHeight - sh) / 2;
    }

    const scale = Math.min(1, MAX_OUTPUT_DIM / Math.max(sw, sh));
    const outW = Math.max(1, Math.round(sw * scale));
    const outH = Math.max(1, Math.round(sh * scale));

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable");
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);

    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/jpeg", 0.85)
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return { bytes, widthPx: outW, heightPx: outH };
  } finally {
    URL.revokeObjectURL(img.src);
  }
}
