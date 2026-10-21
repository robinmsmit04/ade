// Decode orientation once, then store plain JPEG pixels without EXIF or an automatic mirror.
export async function prepareImage(
  file: File,
  options: {
    maxEdge?: number;
    square?: boolean;
    flip?: boolean;
    maxBytes?: number;
  } = {},
): Promise<File> {
  if (!file.size) throw new Error("De foto is leeg.");
  if (file.size > (options.maxBytes || 25 * 1024 * 1024))
    throw new Error(
      `Kies een foto van maximaal ${(options.maxBytes || 25 * 1024 * 1024) / 1024 / 1024} MB.`,
    );
  const photoType =
    /^(image\/(jpeg|png|webp|heic|heif))$/i.test(file.type) ||
    (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
  if (!photoType)
    throw new Error("Kies een JPG, PNG, WebP of een ondersteunde HEIC-foto.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "Je browser kan deze foto niet openen. Exporteer hem als JPG of gebruik de cameraknop.",
      );
    }
    const edge = options.maxEdge || 1920;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sourceWidth = options.square ? side : img.naturalWidth;
    const sourceHeight = options.square ? side : img.naturalHeight;
    const scale = Math.min(1, edge / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Je browser kan de foto niet verwerken.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (options.flip) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(
      img,
      options.square ? (img.naturalWidth - side) / 2 : 0,
      options.square ? (img.naturalHeight - side) / 2 : 0,
      sourceWidth,
      sourceHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Foto verwerken mislukt."))),
        "image/jpeg",
        0.88,
      ),
    );
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`,
      { type: "image/jpeg", lastModified: Date.now() },
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
