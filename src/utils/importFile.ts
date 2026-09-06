import * as XLSX from 'xlsx'

/**
 * Read a user-selected file into CSV-like text that the existing CSV parsers
 * can consume. `.xlsx`/`.xls` files are converted (first sheet → CSV); anything
 * else (`.csv`, `.txt`, …) is read as plain UTF-8 text.
 */
export async function readTabularFile(file: File): Promise<string> {
  if (/\.xlsx?$/i.test(file.name)) {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const first = wb.SheetNames[0]
    if (!first) return ''
    return XLSX.utils.sheet_to_csv(wb.Sheets[first])
  }
  return file.text()
}

/** True when the file is a spreadsheet we convert rather than read as text. */
export function isSpreadsheet(file: File): boolean {
  return /\.xlsx?$/i.test(file.name)
}
