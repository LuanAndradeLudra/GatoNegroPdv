/** Valores de cédulas/moedas BRL para conferência (chave = valor unitário em reais). */
export const BRL_DENOMINATION_VALUES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05] as const;

export function sumDenominationMap(m: Record<string, number>): number {
  let s = 0;
  for (const [k, qty] of Object.entries(m)) {
    const face = Number.parseFloat(k);
    const q = Math.floor(Number(qty)) || 0;
    if (Number.isFinite(face) && q >= 0) {
      s += face * q;
    }
  }
  return Math.round(s * 100) / 100;
}

export function reaisToCentDigits(reais: number): string {
  return String(Math.max(0, Math.round(reais * 100)));
}
