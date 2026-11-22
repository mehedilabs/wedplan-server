export interface ImageValidationResult {
  isValid: boolean;
  error?: string;
  detectedType?: "jpeg" | "png" | "webp" | "gif";
}

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Validates an image file by checking MIME type, size limit,
 * inspecting magic bytes to detect real file content, and ensuring
 * the declared MIME matches the detected binary format.
 */
export function validateImageFile(
  file: Express.Multer.File | undefined,
  maxSize: number = MAX_IMAGE_SIZE,
): ImageValidationResult {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return {
      isValid: false,
      error: "Please select an image file to upload",
    };
  }

  // Check file size
  if (file.buffer.length > maxSize) {
    const sizeInMb = Math.round(maxSize / (1024 * 1024));
    return {
      isValid: false,
      error: `File size exceeds the allowed limit of ${sizeInMb}MB`,
    };
  }

  // Check reported MIME type
  const normalizedMime = (file.mimetype || "").toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return {
      isValid: false,
      error: "Invalid file type. Only JPEG, PNG, WebP, and GIF images are allowed",
    };
  }

  // Inspect magic bytes from buffer
  const buf = file.buffer;
  if (buf.length < 12) {
    return {
      isValid: false,
      error: "Corrupted or truncated image file",
    };
  }

  let detectedType: "jpeg" | "png" | "webp" | "gif" | null = null;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    detectedType = "jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    detectedType = "png";
  }
  // GIF: 47 49 46 38 (GIF8)
  else if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  ) {
    detectedType = "gif";
  }
  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  else if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    detectedType = "webp";
  }

  if (!detectedType) {
    return {
      isValid: false,
      error: "File content does not match a valid image format (JPEG, PNG, WebP, GIF)",
    };
  }

  // Cross-validate declared MIME against detected format
  const mimeMatches =
    (detectedType === "jpeg" &&
      (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg")) ||
    (detectedType === "png" && normalizedMime === "image/png") ||
    (detectedType === "gif" && normalizedMime === "image/gif") ||
    (detectedType === "webp" && normalizedMime === "image/webp");

  if (!mimeMatches) {
    return {
      isValid: false,
      error: `Mismatched file type. Header declares '${normalizedMime}' but content signature is ${detectedType.toUpperCase()}`,
    };
  }

  return { isValid: true, detectedType };
}
