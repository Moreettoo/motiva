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
