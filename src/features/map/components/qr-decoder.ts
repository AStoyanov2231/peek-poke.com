import jsQR from "jsqr";

export class QrDecoderUnavailableError extends Error {
  constructor() {
    super("QR decoder is unavailable");
    this.name = "QrDecoderUnavailableError";
  }
}

export function decodeQrVideoFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement): string | null {
  const sourceWidth = video.videoWidth || video.clientWidth || 0;
  const sourceHeight = video.videoHeight || video.clientHeight || 0;
  if (!sourceWidth || !sourceHeight) return null;

  const scale = Math.min(1, 720 / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new QrDecoderUnavailableError();

  canvas.width = width;
  canvas.height = height;
  context.drawImage(video, 0, 0, width, height);
  const result = jsQR(
    context.getImageData(0, 0, width, height).data,
    width,
    height,
    { inversionAttempts: "attemptBoth" },
  );
  return result?.data ?? null;
}
