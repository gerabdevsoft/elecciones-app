// Comprime cliente-side a max 1024x1024 en escala de grises, JPEG q=0.82
export async function comprimirImagenActa(archivo, opciones = {}) {
  const { maxDim = 1024, calidad = 0.82 } = opciones;
  const bitmap = await createImageBitmap(archivo);
  let { width: w, height: h } = bitmap;
  const ratio = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * ratio);
  h = Math.round(h * ratio);

  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, w, h);

  // Escala de grises
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
  }
  ctx.putImageData(imgData, 0, 0);

  return await new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob], `acta-comprimida-${Date.now()}.jpg`, { type: "image/jpeg" })),
      "image/jpeg",
      calidad
    );
  });
}
