import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import * as Crypto from "expo-crypto";
import { isPhotoKind, type DraftPhoto, type PhotoKind } from "./types";

/**
 * Capture/pick a photo for one slot (store-level or per-site), resize it, and
 * persist it locally under Paths.document so it survives the app being
 * backgrounded/killed before Submit runs -- same durability requirement as
 * the draft JSON itself (plan section 3).
 *
 * NATIVE (iOS/Android): the only path actually exercised on a device. Resize
 * to ~1600px longest edge, JPEG quality 0.7 (expo-image-manipulator saves to
 * its own cache dir with no way to redirect that -- see the API docs -- so
 * the result is copied into Paths.document/installation-drafts/<draftId>/photos/
 * immediately after).
 *
 * WEB: expo-file-system's File/Directory/Paths API has no web backing at all
 * (confirmed against the SDK 57 docs), and there is no camera to test against
 * in a browser anyway. The web branch below exists only so the surrounding
 * form/draft/submit plumbing can be exercised in the web preview with a
 * picked (not captured) image -- it keeps the photo as a self-contained
 * data: URI rather than resizing/persisting to a filesystem that doesn't
 * exist here. This is NOT the shipped behaviour; native is. See the photo
 * capture verification note in the final report for what is and isn't
 * confirmed working.
 */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.7;

/**
 * Thrown by ensurePermission when camera/library access isn't granted --
 * callers (the PhotoSlot UI) catch this specifically to show a message
 * pointing at Settings instead of letting a raw native exception surface
 * as an unhandled rejection (the exact failure this replaces: launching
 * the camera with no permission granted throws
 * MissingCameraPermissionException from ImagePickerModule.swift with no
 * prior prompt, since nothing had ever requested permission first).
 */
export class PhotoPermissionDeniedError extends Error {
  constructor(
    public readonly source: "camera" | "library",
    // false once the OS will no longer show its own prompt (denied twice on
    // iOS, or "don't ask again" on Android) -- re-requesting at that point
    // just silently re-resolves to denied, so the UI should send the person
    // to Settings instead of retrying.
    public readonly canAskAgain: boolean
  ) {
    super(
      source === "camera"
        ? "Camera access is off for this app. Turn it on in Settings to take photos."
        : "Photo library access is off for this app. Turn it on in Settings to choose photos."
    );
    this.name = "PhotoPermissionDeniedError";
  }
}

// Checks current status first and only calls the request*Async variant when
// canAskAgain is true -- once denied permanently, requesting again shows no
// system prompt at all and just re-resolves to denied, so there's no point
// re-asking (and doing so anyway would mask that Settings is now the only
// way forward).
async function ensurePermission(source: "camera" | "library"): Promise<void> {
  const current =
    source === "camera" ? await ImagePicker.getCameraPermissionsAsync() : await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return;
  if (!current.canAskAgain) throw new PhotoPermissionDeniedError(source, false);

  const requested =
    source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!requested.granted) throw new PhotoPermissionDeniedError(source, requested.canAskAgain);
}

async function pickAsset(source: "camera" | "library"): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = { quality: 1, mediaTypes: "images" };
  const result =
    source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
}

async function resizeAndPersistNative(asset: ImagePicker.ImagePickerAsset, draftId: string, photoId: string): Promise<string> {
  const width = asset.width || 0;
  const height = asset.height || 0;
  const longestEdge = Math.max(width, height) || MAX_EDGE;
  const target = Math.min(longestEdge, MAX_EDGE);

  const context = ImageManipulator.manipulate(asset.uri);
  // Constrain by whichever axis is longest so the resize preserves aspect
  // ratio without upscaling an already-small photo past its own resolution.
  if (width >= height) context.resize({ width: target });
  else context.resize({ height: target });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });

  let dir = new Directory(Paths.document, "installation-drafts");
  if (!dir.exists) dir.create({ idempotent: true });
  dir = new Directory(dir, draftId);
  if (!dir.exists) dir.create({ idempotent: true });
  dir = new Directory(dir, "photos");
  if (!dir.exists) dir.create({ idempotent: true });

  const dest = new File(dir, `${photoId}.jpg`);
  const src = new File(saved.uri);
  await src.copy(dest);
  return dest.uri;
}

async function toDataUriWeb(asset: ImagePicker.ImagePickerAsset): Promise<string> {
  if (asset.uri.startsWith("data:")) return asset.uri;
  const res = await fetch(asset.uri);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Pick/capture + process a photo for the given kind. Throws if `kind` isn't
 * one of the ten values installation_report_photos.kind's CHECK constraint
 * allows -- a bad kind must fail loudly here, not silently reach the upload
 * route (see ALL_PHOTO_KINDS in types.ts for why this list exists at all).
 */
export async function capturePhoto(
  source: "camera" | "library",
  kind: PhotoKind,
  draftId: string
): Promise<DraftPhoto | null> {
  if (!isPhotoKind(kind)) {
    throw new Error(`capturePhoto: "${kind}" is not one of the ten allowed photo kinds -- refusing to proceed.`);
  }

  // Web has no OS-level permission prompt for either source (camera isn't
  // supported there at all; the library path is a plain browser file input) --
  // this only matters on native, where iOS/Android both require an explicit
  // grant before launchCameraAsync/launchImageLibraryAsync will succeed.
  if (Platform.OS !== "web") await ensurePermission(source);

  const asset = await pickAsset(source);
  if (!asset) return null;

  const photoId = Crypto.randomUUID();
  const uri = Platform.OS === "web" ? await toDataUriWeb(asset) : await resizeAndPersistNative(asset, draftId, photoId);

  return {
    id: photoId,
    kind,
    uri,
    status: "local",
    relativePath: null,
    capturedAt: new Date().toISOString(),
  };
}

export function deletePhotoFile(uri: string): void {
  if (Platform.OS === "web" || uri.startsWith("data:")) return;
  const file = new File(uri);
  if (file.exists) file.delete();
}
