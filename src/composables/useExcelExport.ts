import * as XLSX from 'xlsx'
import type { Attack } from '@/stores/planStore'
import { CAT_TARGET_LABELS } from '@/stores/presetsStore'

// ── BB helpers ─────────────────────────────────────────────────────────────

function bbDate(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const dy = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${dy}`
}

function bbTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}.000`
}

function attackUnit(atk: Attack): string {
  // speedUnit is already the slowest unit key ('ram', 'catapult', 'spear', etc.)
  return atk.speedUnit
}

function attackLabelAndColor(atk: Attack): { label: string; color: string } {
  const baseColor: Record<string, string> = {
    off:            '#ff0000',
    paladin_off:    '#ff00ff',
    mid_off:        '#c87d3e',
    mini_off:       '#b8a832',
    cat:            '#89b4fa',
    spam:           '#888888',
    spam_noble:     '#666688',
  }
  const baseLabel: Record<string, string> = {
    off:            'ФУЛЛ_ОФФ',
    paladin_off:    'ФУЛЛ_ОФФ_(+ПАЛ)',
    mid_off:        'МИД_ОФФ',
    mini_off:       'МИНИ_ОФФ',
    cat:            'КАТЫ',
    spam:           'СПАМ',
    spam_noble:     'СПАМ_ДВОР',
  }

  let label: string
  if (atk.type === 'cat') {
    const b = atk.catTarget ? `_(${CAT_TARGET_LABELS[atk.catTarget].toUpperCase()})` : ''
    label = `КАТЫ${b}`
  } else {
    const raw = atk.label ?? baseLabel[atk.type] ?? atk.type.toUpperCase()
    const catSuffix = atk.catTarget ? `_(${CAT_TARGET_LABELS[atk.catTarget].toUpperCase()})` : ''
    label = (raw + catSuffix).toUpperCase().replace(/ /g, '_')
  }

  const color = atk.color ?? baseColor[atk.type] ?? '#e94560'
  return { label, color }
}

// ── Main export ─────────────────────────────────────────────────────────────

type IdLookup = (coords: string) => number | null

function attacksToRows(attacks: Attack[], idLookup: IdLookup): string[][] {
  const rows: string[][] = []

  const sorted = [...attacks].sort((a, b) => a.sendTime.getTime() - b.sendTime.getTime())

  for (const atk of sorted) {
    const { label, color } = attackLabelAndColor(atk)
    const unit = attackUnit(atk)

    const vid = atk.fromVillage.villageId ?? idLookup(atk.fromVillage.coords)
    const tid = atk.target.villageId      ?? idLookup(atk.target.coords)
    const link = vid !== null && tid !== null
      ? `[url=game.php?village=${vid}&screen=place&target=${tid}]Attack[/url]`
      : `(нет ID: ${atk.fromVillage.coords}→${atk.target.coords})`

    rows.push([
      atk.fromVillage.player,
      `[unit]${unit}[/unit]`,
      `[b][color=${color}]${label}[/color][/b]`,
      '|',
      bbDate(atk.sendTime),
      `[b]${bbTime(atk.sendTime)}[/b]`,
      '|',
      bbDate(atk.arrivalTime),
      bbTime(atk.arrivalTime),
      '|',
      atk.fromVillage.coords,
      '->',
      atk.target.coords,
      '|',
      link,
    ])
  }

  return rows
}

const HEADERS = [
  'Игрок', 'Юнит', 'Картинка', '|',
  'Дата отправки', 'Время отправки', '|',
  'Дата прихода', 'Время прихода', '|',
  'Откуда', '->', 'Куда', '|', 'Ссылка',
]

export function exportAttacksToXlsx(
  attacks: Attack[],
  idLookup: IdLookup,
  filterPlayer = '',
  filename = 'mass_plan.xlsx',
): void {
  const active = attacks.filter(a =>
    !a.excluded && (filterPlayer ? a.fromVillage.player === filterPlayer : true)
  )

  const main = active.filter(a => !a.catMass)
  const cats = active.filter(a =>  a.catMass)

  const wb = XLSX.utils.book_new()

  if (main.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...attacksToRows(main, idLookup)])
    setColumnWidths(ws)
    XLSX.utils.book_append_sheet(wb, ws, 'Отправки')
  }

  if (cats.length > 0) {
    const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...attacksToRows(cats, idLookup)])
    setColumnWidths(ws)
    XLSX.utils.book_append_sheet(wb, ws, 'Отправки каты')
  }

  if (main.length === 0 && cats.length === 0) return

  XLSX.writeFile(wb, filename)
}

function setColumnWidths(ws: XLSX.WorkSheet): void {
  ws['!cols'] = [
    { wch: 18 }, // A: Игрок
    { wch: 22 }, // B: Юнит
    { wch: 35 }, // C: Картинка
    { wch: 3  }, // D: |
    { wch: 12 }, // E: Дата отправки
    { wch: 18 }, // F: Время отправки
    { wch: 3  }, // G: |
    { wch: 12 }, // H: Дата прихода
    { wch: 14 }, // I: Время прихода
    { wch: 3  }, // J: |
    { wch: 10 }, // K: Откуда
    { wch: 4  }, // L: ->
    { wch: 10 }, // M: Куда
    { wch: 3  }, // N: |
    { wch: 55 }, // O: Ссылка
  ]
}
