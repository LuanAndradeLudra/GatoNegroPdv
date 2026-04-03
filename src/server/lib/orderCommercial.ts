import type { CommercialChargeMode } from "@prisma/client";

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type CommercialFields = {
  couvertEnabled: boolean;
  couvertMode: CommercialChargeMode;
  couvertValue: number;
  serviceFeeEnabled: boolean;
  serviceFeeMode: CommercialChargeMode;
  serviceFeeValue: number;
};

/** Base para % = somente subtotal dos itens. Fixos em R$. */
export function computeCommercialAmounts(itemsSubtotal: number, f: CommercialFields) {
  const sub = round2(itemsSubtotal);
  let couvertAmount = 0;
  if (f.couvertEnabled) {
    couvertAmount =
      f.couvertMode === "PERCENT"
        ? round2((sub * f.couvertValue) / 100)
        : round2(f.couvertValue);
  }
  let serviceFeeAmount = 0;
  if (f.serviceFeeEnabled) {
    serviceFeeAmount =
      f.serviceFeeMode === "PERCENT"
        ? round2((sub * f.serviceFeeValue) / 100)
        : round2(f.serviceFeeValue);
  }
  const totalDue = round2(sub + couvertAmount + serviceFeeAmount);
  return { subtotal: sub, couvertAmount, serviceFeeAmount, totalDue };
}
