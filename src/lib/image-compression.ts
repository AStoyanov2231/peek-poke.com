import imageCompression from "browser-image-compression";

export async function compressImage(file: File, maxSizeMB = 0.5) {
  if (file.size < 100 * 1024) return file;

  return imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
  });
}

export async function createThumbnail(file: File) {
  return imageCompression(file, {
    maxSizeMB: 0.05,
    maxWidthOrHeight: 300,
    useWebWorker: true,
  });
}
