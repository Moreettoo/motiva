import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Limita um numero a uma faixa. */
export function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

/** Mapeia um valor de um intervalo para outro, sem extrapolar. */
export function scale(v: number, dIn: [number, number], dOut: [number, number]) {
  const [a, b] = dIn;
  const [c, d] = dOut;
  if (b === a) return c;
  return c + ((clamp(v, Math.min(a, b), Math.max(a, b)) - a) / (b - a)) * (d - c);
}

/** Agrupa por chave preservando a ordem de aparicao. */
export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K) {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const bucket = out.get(k);
    if (bucket) bucket.push(item);
    else out.set(k, [item]);
  }
  return out;
}

export function sum(ns: number[]) {
  return ns.reduce((a, b) => a + b, 0);
}

/** Raio medio da Terra, em km. */
const RAIO_TERRA_KM = 6371;

/**
 * Distancia em linha reta entre dois pontos, pela formula de haversine.
 *
 * O simulador usa para achar o trecho da malha mais proximo de uma coordenada
 * qualquer. Nas distancias em jogo aqui, dezenas a centenas de km dentro do
 * Sudeste, a diferenca para uma geodesica de elipsoide fica bem abaixo do erro
 * de arredondar a coordenada, entao haversine basta e nao traz dependencia.
 */
export function distanciaKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * RAIO_TERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
