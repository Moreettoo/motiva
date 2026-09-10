import { LIMITES } from "./contratos";

/**
 * Foto de campo entra pela camera nativa (`<input capture>`, que funciona sem
 * sinal) e sai daqui com o lado maior em 1600 px e JPEG 0,82 — o suficiente para
 * ler a regua na foto e pequeno o bastante para subir em rede de beira de
 * estrada. Uma foto de celular de 4 MB vira uns 300 KB.
 */

/* `ladoMaximo: number` explicito: `LIMITES` e `as const`, entao o valor padrao
   sozinho estreitaria o parametro para o literal 1600 e nenhum outro numero
   passaria. */
export function dimensoesReduzidas(largura: number, altura: number, ladoMaximo: number = LIMITES.ladoMaximoPx) {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura, altura };
  const fator = ladoMaximo / maior;
  return { largura: Math.round(largura * fator), altura: Math.round(altura * fator) };
}

/** `createImageBitmap` respeita a orientacao EXIF nos Chromes atuais; o canvas grava JPEG sem EXIF (a posicao vai em colunas proprias). */
export async function comprimirFoto(arquivo: File): Promise<{ blob: Blob; largura: number; altura: number }> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
  const { largura, altura } = dimensoesReduzidas(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(largura, altura);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Sem contexto 2D para comprimir a foto.");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: LIMITES.qualidadeJpeg });
  return { blob, largura, altura };
}

/**
 * GPS no momento da captura. Devolve `null` em vez de levantar: sem sinal de
 * satelite a foto vale do mesmo jeito, e a tela avisa que ela foi sem posicao.
 */
export function capturarPosicao(): Promise<{ latitude: number; longitude: number; precisao_m: number } | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao_m: p.coords.accuracy }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: LIMITES.gpsTimeoutMs, maximumAge: 30_000 },
    );
  });
}
