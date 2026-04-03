/** Máscara monetária BR: armazene só dígitos (centavos acumulados) e exiba com `formatDigitsAsBRL`. */

export function formatDigitsAsBRL(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (!d) {
    return "";
  }
  const cents = parseInt(d, 10);
  if (!Number.isFinite(cents)) {
    return "";
  }
  const n = cents / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Converte valor em reais para string de dígitos (centavos) para a máscara. */
export function reaisToDigits(reais: number): string {
  if (!Number.isFinite(reais) || reais < 0) {
    return "";
  }
  return String(Math.round(reais * 100));
}

/** Converte string de dígitos (ou valor já formatado) em reais. */
export function parseDigitsToReais(digits: string): number | null {
  const d = digits.replace(/\D/g, "");
  if (!d) {
    return null;
  }
  const cents = parseInt(d, 10);
  if (!Number.isFinite(cents)) {
    return null;
  }
  return cents / 100;
}
