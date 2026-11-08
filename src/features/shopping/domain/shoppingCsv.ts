import type { ShoppingList } from './shoppingList';

/** Excel needs the BOM to read the accents as UTF-8. */
export const CSV_BOM = '﻿';

const money = (cents: number): string => (cents / 100).toFixed(2).replace('.', ',');

/** `;` separated (Spanish locale spreadsheets), decimal comma, CRLF rows. */
export function buildShoppingCsv(weekId: string, list: ShoppingList): string {
  const line = (name: string, l: ShoppingList['chicken']): string =>
    [name, l.grams, l.packageSizeG, l.packages, money(l.costCents), l.leftoverGrams].join(';');
  return [
    `Semana de entrega;${weekId}`,
    'Insumo;Gramos;Tamaño de paquete (g);Paquetes;Costo (MXN);Sobrante (g)',
    line('Pollo', list.chicken),
    line('Res', list.beef),
    `Total;;;${list.chicken.packages + list.beef.packages};${money(list.totalCostCents)};`,
  ].join('\r\n');
}
