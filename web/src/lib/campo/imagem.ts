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

export type Posicao = { latitude: number; longitude: number; precisao_m: number };

/**
 * Resolve `null` se a promessa nao responder no prazo.
 *
 * Existe por causa de UMA armadilha concreta da Geolocation API: o `timeout`
 * dela conta a partir da PERMISSAO CONCEDIDA, e nao da chamada. Enquanto o
 * prompt do Android estiver na tela sem resposta — a pessoa nao tocou, ou o
 * prompt ficou atras do app da camera — `getCurrentPosition` nao chama callback
 * nenhum, nem o de sucesso nem o de erro, e o `timeout: 8000` nao serve para
 * nada. Medido: a tela ficou em "Preparando a foto…" por 24 s e nao ia parar;
 * sem foto, sem botao, sem erro, sem saida a nao ser fechar o app. E o primeiro
 * uso num aparelho novo, que e exatamente o teste de sabado.
 */
function comPrazo<T>(promessa: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolver) => {
    const relogio = setTimeout(() => resolver(null), ms);
    void promessa.then(
      (v) => {
        clearTimeout(relogio);
        resolver(v);
      },
      () => {
        clearTimeout(relogio);
        resolver(null);
      },
    );
  });
}

/**
 * GPS no momento da captura. Devolve `null` em vez de levantar: sem sinal de
 * satelite a foto vale do mesmo jeito, e a tela avisa que ela foi sem posicao.
 *
 * O prazo e do APP, e vale mesmo quando o do navegador nao vale. Ver `comPrazo`.
 */
export function capturarPosicao(): Promise<Posicao | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  const doNavegador = new Promise<Posicao | null>((resolver) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolver({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao_m: p.coords.accuracy }),
      () => resolver(null),
      { enableHighAccuracy: true, timeout: LIMITES.gpsTimeoutMs, maximumAge: 30_000 },
    );
  });
  /* Uma folga em cima do prazo do navegador: quando ELE funciona, quem responde
     e ele, com posicao de verdade; o prazo daqui so entra quando o dele nunca
     chega. */
  return comPrazo(doNavegador, LIMITES.gpsTimeoutMs + 2_000).then((p) => p ?? null);
}

/** Exportado so para o teste: o prazo e a parte que nao da para ver na tela. */
export const _comPrazo = comPrazo;
