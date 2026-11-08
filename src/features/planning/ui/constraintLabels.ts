/** Spanish names for the row labels the model builder gives to each constraint. */
export function constraintLabel(label: string): string {
  if (label.startsWith('min:')) return `Mínimo de ${label.slice(4)}`;
  if (label.startsWith('max:')) return `Máximo de ${label.slice(4)}`;
  switch (label) {
    case 'total':
      return 'Total de porciones (suma = D)';
    case 'kcalMin':
      return 'Kcal promedio mínimo';
    case 'kcalMax':
      return 'Kcal promedio máximo';
    case 'proteinMin':
      return 'Proteína promedio mínima';
    case 'chickenCap':
      return 'Tope de pollo';
    case 'beefCap':
      return 'Tope de res';
    case 'glutenFree':
      return 'Porciones sin gluten (al menos G)';
    case 'costOptimum':
      return 'Costo igual al óptimo (desempate por proteína)';
    default:
      return label;
  }
}
