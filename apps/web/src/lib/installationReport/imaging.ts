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

/** Pan/zoom the operator applied to a photo before export — focalX/focalY (0-1) is the point of the source image kept centered in its box, zoom (>=1) narrows the crop window around that point. Defaults (0.5, 0.5, 1) reproduce the old always-centered "cover" crop. */
export interface PhotoTransform {
  focalX: number;
  focalY: number;
  zoom: number;
}

/** A photo picked for a slot, plus how the operator has chosen to frame it. */
export interface PhotoValue {
  file: File;
  focalX: number;
  focalY: number;
  zoom: number;
}

export function defaultPhotoTransform(): PhotoTransform {
  return { focalX: 0.5, focalY: 0.5, zoom: 1 };
}

export function photoValueFromFile(file: File): PhotoValue {
  return { file, ...defaultPhotoTransform() };
}

const MAX_OUTPUT_DIM = 1600; // px on the longer edge — plenty for a full-page report photo, keeps file size sane

/** For on-screen thumbnails only — caller is responsible for revoking this when the slot's file changes or unmounts. */
export function createPreviewUrl(file: File): string {
  return URL.createObjectURL(file);
}

/** Natural pixel dimensions of a local image file, without any cropping — used to decide whether a hero photo should get a wide landscape layout box or a taller portrait one. */
export async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const img = await loadHtmlImage(file);
  const dims = { width: img.naturalWidth, height: img.naturalHeight };
  URL.revokeObjectURL(img.src);
  return dims;
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
 *
 * `transform` is the operator's pan/zoom adjustment from the ImageSlot
 * editor: at the default (centered, zoom 1) this crops exactly like plain
 * "cover" did before pan/zoom existed; a higher zoom shrinks the crop
 * window (so the output is more zoomed-in) and focalX/focalY re-centers
 * that window on a different point of the source image, clamped so the
 * crop never runs off the edge of the photo.
 */
export async function prepareCoverImage(
  file: File,
  boxWidth: number,
  boxHeight: number,
  transform?: PhotoTransform
): Promise<PreparedImage> {
  const img = await loadHtmlImage(file);
  try {
    const boxAspect = boxWidth / boxHeight;
    const srcAspect = img.naturalWidth / img.naturalHeight;

    let baseSw = img.naturalWidth;
    let baseSh = img.naturalHeight;
    if (srcAspect > boxAspect) {
      // Source is relatively wider than the box — crop left/right.
      baseSw = img.naturalHeight * boxAspect;
    } else {
      // Source is relatively taller than the box — crop top/bottom.
      baseSh = img.naturalWidth / boxAspect;
    }

    const { focalX, focalY, zoom } = transform ?? defaultPhotoTransform();
    const z = Math.max(1, zoom || 1);
    const sw = baseSw / z;
    const sh = baseSh / z;
    const sx = Math.min(Math.max(focalX * img.naturalWidth - sw / 2, 0), img.naturalWidth - sw);
    const sy = Math.min(Math.max(focalY * img.naturalHeight - sh / 2, 0), img.naturalHeight - sh);

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
