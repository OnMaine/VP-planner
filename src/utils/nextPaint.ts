// Ждём два кадра отрисовки — чтобы лоадер/спиннер успел появиться на экране
// ДО синхронной тяжёлой работы (парсинг xlsx/csv, экспорт), которая блокирует поток.
export const nextPaint = (): Promise<void> =>
  new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
