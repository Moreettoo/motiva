import { writeFileSync } from "node:fs";
import sharp from "sharp";
import QRCode from "qrcode";

/**
 * Toda a identidade visual do produto sai de uma unica arte fonte: a folha
 * dupla de `docs/highwai-logo.webp`, copiada para public/icones/highwai-logo.webp.
 * Favicon, icones do app instalavel (PWA "Campo"), icone da Apple e o logo
 * que vai nos e-mails sao todos gerados daqui — trocar a arte fonte e rodar
 * `npm run icones` de novo propaga para os sete arquivos.
 */
const raiz = (caminho) => new URL(caminho, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const logo = raiz("../public/icones/highwai-logo.webp");

const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 };

async function pngQuadrado(tamanho, { fundo = null, margem = 0 } = {}) {
  const util = Math.round(tamanho * (1 - 2 * margem));
  const icone = await sharp(logo).resize(util, util, { fit: "contain", background: TRANSPARENTE }).png().toBuffer();
  if (fundo === null && margem === 0) return icone;
  return sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: fundo ?? TRANSPARENTE } })
    .composite([{ input: icone, gravity: "center" }])
    .png()
    .toBuffer();
}

/** ICO com PNG embutido (suportado desde o Windows Vista) — sem depender de outro pacote. */
function montarIco(entradas) {
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0);
  cabecalho.writeUInt16LE(1, 2);
  cabecalho.writeUInt16LE(entradas.length, 4);

  let deslocamento = 6 + entradas.length * 16;
  const diretorio = Buffer.alloc(entradas.length * 16);
  entradas.forEach(({ tamanho, buffer }, i) => {
    const base = i * 16;
    diretorio.writeUInt8(tamanho >= 256 ? 0 : tamanho, base + 0);
    diretorio.writeUInt8(tamanho >= 256 ? 0 : tamanho, base + 1);
    diretorio.writeUInt8(0, base + 2);
    diretorio.writeUInt8(0, base + 3);
    diretorio.writeUInt16LE(1, base + 4);
    diretorio.writeUInt16LE(32, base + 6);
    diretorio.writeUInt32LE(buffer.length, base + 8);
    diretorio.writeUInt32LE(deslocamento, base + 12);
    deslocamento += buffer.length;
  });

  return Buffer.concat([cabecalho, diretorio, ...entradas.map((e) => e.buffer)]);
}

// Favicon da aba do navegador: multi-resolução, fundo transparente.
const tamanhosFavicon = [16, 32, 48];
const favicon = montarIco(
  await Promise.all(tamanhosFavicon.map(async (tamanho) => ({ tamanho, buffer: await pngQuadrado(tamanho) }))),
);
writeFileSync(raiz("../src/app/favicon.ico"), favicon);
console.log("ok favicon.ico");

// Icone moderno (Next.js detecta app/icon.png sozinho) e o da Apple, que não aceita transparência bem.
writeFileSync(raiz("../src/app/icon.png"), await pngQuadrado(512));
writeFileSync(raiz("../src/app/apple-icon.png"), await pngQuadrado(180, { fundo: "#f7f7f4" }));
console.log("ok icon.png, apple-icon.png");

// Icones do app instalável (manifest.ts, PWA "Campo"), sobre o fundo escuro do manifesto.
for (const [nome, tamanho, margem] of [
  ["highwai-192.png", 192, 0.08],
  ["highwai-512.png", 512, 0.08],
  ["highwai-512-maskable.png", 512, 0.18],
]) {
  writeFileSync(raiz(`../public/icones/${nome}`), await pngQuadrado(tamanho, { fundo: "#0a0d0c", margem }));
  console.log("ok", nome);
}

// Logo para o cabeçalho dos e-mails (BaseEmail lê por URL absoluta, via APP_URL).
writeFileSync(raiz("../public/icones/highwai-logo.png"), await pngQuadrado(256));
console.log("ok highwai-logo.png");

// QR do APK: o link e fixo por nome de arquivo, entao o QR pode ser estatico.
const link = "https://github.com/Moreettoo/motiva/releases/latest/download/campo.apk";
writeFileSync(raiz("../public/icones/qr-apk.svg"), await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#0c100e", light: "#ffffff" } }));
console.log("ok qr-apk.svg");
