import { writeFileSync, readFileSync } from "node:fs";
import sharp from "sharp";
import QRCode from "qrcode";

const svg = readFileSync(new URL("../public/icones/campo.svg", import.meta.url));
for (const [nome, tamanho, margem] of [["campo-192.png", 192, 0], ["campo-512.png", 512, 0], ["campo-512-maskable.png", 512, 0.12]]) {
  const util = Math.round(tamanho * (1 - 2 * margem));
  const icone = await sharp(svg).resize(util, util).png().toBuffer();
  await sharp({ create: { width: tamanho, height: tamanho, channels: 4, background: "#0a0d0c" } })
    .composite([{ input: icone, gravity: "center" }])
    .png()
    .toFile(new URL(`../public/icones/${nome}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
  console.log("ok", nome);
}

// QR do APK: o link e fixo por nome de arquivo, entao o QR pode ser estatico.
const link = "https://github.com/Moreettoo/motiva/releases/latest/download/campo.apk";
writeFileSync(new URL("../public/icones/qr-apk.svg", import.meta.url), await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#0c100e", light: "#ffffff" } }));
console.log("ok qr-apk.svg");
