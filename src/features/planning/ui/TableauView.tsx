import { formatDecimal, roundHalfUp } from '@/shared/kernel/numberFormat';
import { Table, TableScroll, TD, TDN, TH, THN } from '@/shared/ui/Table';
import type { TableauSnapshot } from '../domain/simplex';
import { constraintLabel } from './constraintLabels';

/** Up to 4 decimals, trailing zeros dropped (`0,3333`, `12`, `-1,5`). */
export function formatCell(value: number): string {
  const rounded = roundHalfUp(value, 4);
  if (rounded === 0) return '0';
  const text = formatDecimal(rounded, 4);
  return text.replace(/,?0+$/, '');
}

/** Presentational: one simplex tableau; the real numbers of the calculation. */
export function TableauView({ tableau, testId, highlight }: { tableau: TableauSnapshot; testId?: string; highlight?: { row: number; column: number } }) {
  return (
    <TableScroll>
      <Table data-testid={testId} className="text-sm">
        <thead>
          <tr>
            <th className={TH}>Restricción</th>
            <th className={TH}>Base</th>
            {tableau.columns.map((column) => (
              <th key={column} className={THN}>
                {column}
              </th>
            ))}
            <th className={THN}>Lado derecho</th>
          </tr>
        </thead>
        <tbody>
          {tableau.rows.map((row, i) => (
            <tr key={tableau.rowLabels[i] ?? i}>
              <td className={TD}>{constraintLabel(tableau.rowLabels[i] ?? '')}</td>
              <td className={`${TD} font-semibold`}>{tableau.basis[i]}</td>
              {row.map((value, j) => (
                <td
                  key={j}
                  className={`${TDN} ${highlight && highlight.row === i && highlight.column === j ? 'bg-accent font-bold' : ''}`}
                >
                  {formatCell(value)}
                </td>
              ))}
            </tr>
          ))}
          <tr className="bg-neutral font-semibold">
            <td className={TD} colSpan={2}>
              Costos reducidos
            </td>
            {tableau.reducedCosts.map((value, j) => (
              <td key={j} className={TDN}>
                {formatCell(value)}
              </td>
            ))}
            <td className={TDN}>{formatCell(-tableau.objectiveValue)}</td>
          </tr>
        </tbody>
      </Table>
      <p className="px-3 py-2 text-sm">Valor del objetivo de la fase: {formatCell(tableau.objectiveValue)}</p>
    </TableScroll>
  );
}
