import { buildShoppingList } from '../shoppingList';
import { buildShoppingCsv, CSV_BOM } from '../shoppingCsv';

const RECIPES = [
  { code: 'R1', chickenG: 180, beefG: 0 },
  { code: 'R2', chickenG: 0, beefG: 160 },
  { code: 'R3', chickenG: 0, beefG: 110 },
  { code: 'R4', chickenG: 140, beefG: 0 },
  { code: 'R5', chickenG: 0, beefG: 0 },
  { code: 'R6', chickenG: 120, beefG: 0 },
];

describe('buildShoppingCsv', () => {
  it('writes the briefing case 1 shopping list as semicolon separated rows', () => {
    const list = buildShoppingList(RECIPES, { R1: 79, R2: 39, R3: 64, R4: 58, R5: 30, R6: 30 });
    expect(buildShoppingCsv('2026-11-15', list).split('\r\n')).toEqual([
      'Semana de entrega;2026-11-15',
      'Insumo;Gramos;Tamaño de paquete (g);Paquetes;Costo (MXN);Sobrante (g)',
      'Pollo;25940;2000;13;3874,00;60',
      'Res;13280;1000;14;3066,00;720',
      'Total;;;27;6940,00;',
    ]);
  });

  it('exposes the UTF-8 byte order mark used by the download', () => {
    expect(CSV_BOM).toBe('﻿');
  });
});
