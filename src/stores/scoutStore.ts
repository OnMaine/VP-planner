import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as XLSX from 'xlsx'

// ──────────────────────────────────────────────────────────────────────────
// Scout store — парсит «анализатор атак» (xlsx, лист "Data") и выделяет
// офф-атаки с красным/коричневым засветом. Точка выхода (origin) и точка
// цели (target) материализованы в листе "Data" (в отличие от листа "Цели",
// где координаты — разлитые array-формулы и в xlsx-экспорте отсутствуют).
// ──────────────────────────────────────────────────────────────────────────

export interface ScoutAttack {
  oCoords: string; ox: number; oy: number       // откуда (точка выхода)
  tCoords: string; tx: number; ty: number       // куда (цель)
  reds: number; brown: number                    // засвет деры-источника (shows red/brown) — для фильтра/агрегата
  aRed: boolean; aBrown: boolean                 // пометка КОНКРЕТНОЙ атаки из листов засветов
  victim: string; attacker: string; unit: string
  arrival: string                                // время прихода "ЧЧ:ММ:СС:мс" — различает нобли в цепочке
}

/** Цвет пометки конкретной атаки. */
export type AtkFlag = 'red' | 'brown' | 'none'
export function atkFlag(a: ScoutAttack): AtkFlag {
  return a.aRed ? 'red' : a.aBrown ? 'brown' : 'none'
}

export interface ScoutPoint {
  coords: string; x: number; y: number
  count: number                                  // число реальных атак
  reds: number; brown: number
  victim?: string                                // для цели — терпила
  attacker?: string                              // для origin — атакующий игрок
  targets?: Set<string>                          // для origin — по каким целям бьёт
}

export type VillageKind = 'off' | 'def' | 'def?'

/** Деревня врага из листа «Заметки» (реестр всех дер из слитой инфы). */
export interface EnemyVillage {
  coords: string; x: number; y: number
  kind: VillageKind
}

const LS_KEY = 'vp_scout'

function parseCoord(s: unknown): [number, number] | null {
  const m = /^(\d{1,3})\|(\d{1,3})$/.exec(String(s).trim())
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10)]
}

/** Достаёт число N из строки вида "красных (N)" / "коричневых (N)". */
function parseShow(v: unknown): number {
  const m = /\((\d+)\)/.exec(String(v))
  return m ? parseInt(m[1], 10) : 0
}

/** Нормализует время прихода до "ЧЧ:ММ:СС:мс" (мс различают нобли в цепочке). */
function arrivalKey(s: unknown): string {
  const m = /(\d{1,2}:\d{2}:\d{2}:\d{1,3})/.exec(String(s))
  return m ? m[1] : ''
}

/** Нормализует расстояние до одного знака (форматы в Data и засветах совпадают). */
function distKey(v: unknown): string {
  const n = Number(String(v).replace(',', '.'))
  return isNaN(n) ? '' : n.toFixed(1)
}

/** Ключ конкретной атаки: откуда>куда@времяПрихода#расстояние. */
function attackKey(oCoords: string, tCoords: string, arrival: unknown, dist: unknown): string {
  return `${oCoords}>${tCoords}@${arrivalKey(arrival)}#${distKey(dist)}`
}

/**
 * Парсит лист засветов («Красные засветы!» / «коричневые засветы»).
 * Каждая строка = засвеченная атака: col1 «Пункт назначения», col2 «Происхождение»
 * (формат «Название (x|y) K44»), col4 «Расстояние», col5 «Прибытие». Матчим
 * ПОШТУЧНО по откуда+куда+время прихода+расстояние (id из «search ids» —
 * ненадёжная формула, часто #N/A).
 */
function parseFlagSheet(ws: XLSX.WorkSheet | undefined): Set<string> {
  const keys = new Set<string>()
  if (!ws) return keys
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
  const re = /\((\d{1,3})\|(\d{1,3})\)/
  for (const r of rows) {
    const t = re.exec(String(r[1]))
    const o = re.exec(String(r[2]))
    const at = arrivalKey(r[5])
    if (!t || !o || !at) continue
    keys.add(attackKey(`${o[1]}|${o[2]}`, `${t[1]}|${t[2]}`, r[5], r[4]))
  }
  return keys
}

// Версия схемы парсинга. Бампается при добавлении новых полей в ScoutAttack —
// старый кеш в localStorage тогда сбрасывается, чтобы не показывать данные без
// новых полей (пользователь переимпортирует файл).
const SCHEMA_VERSION = 7

function loadJSON<T>(key: string): T | null {
  try {
    if (parseInt(localStorage.getItem(LS_KEY + '_ver') || '0', 10) !== SCHEMA_VERSION) return null
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch { /* ignore */ }
  return null
}

export const useScoutStore = defineStore('scout', () => {
  const stored = loadJSON<ScoutAttack[]>(LS_KEY) ?? []
  const attacks = ref<ScoutAttack[]>(stored)
  const enemyVillages = ref<EnemyVillage[]>(loadJSON<EnemyVillage[]>(LS_KEY + '_enemy') ?? [])
  const lastFile = ref<string>(stored.length ? localStorage.getItem(LS_KEY + '_file') || '' : '')

  function save() {
    localStorage.setItem(LS_KEY, JSON.stringify(attacks.value))
    localStorage.setItem(LS_KEY + '_enemy', JSON.stringify(enemyVillages.value))
    localStorage.setItem(LS_KEY + '_file', lastFile.value)
    localStorage.setItem(LS_KEY + '_ver', String(SCHEMA_VERSION))
  }

  /**
   * Парсит xlsx-книгу анализатора. Берёт лист "Data" (или первый, где есть
   * нужные колонки), фильтрует: Метка == "офф" И (reds > 0 ИЛИ brown > 0),
   * дедуплицирует до уровня атаки по origin|dest|id|arrival.
   */
  function parseWorkbook(wb: XLSX.WorkBook): { attacks: number; targets: number; origins: number } {
    const sheet = wb.Sheets['Data'] ?? wb.Sheets[wb.SheetNames[0]]
    if (!sheet) throw new Error('Лист "Data" не найден в книге')

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })
    if (!rows.length) throw new Error('Лист "Data" пуст')

    const H = (rows[0] as unknown[]).map((h) => String(h).trim())
    const col = (name: string) => H.indexOf(name)
    const cOrig = col('start xxx|yyy')
    const cDest = col('final xxx|yyy')
    const cMark = col('Метка')
    // засветы по конкретной атаке (абсолютные, по всем терпилам):
    // "shows red"/"shows brown" = "красных (N)"/"коричневых (N)".
    // ВАЖНО: числовые колонки reds/brown привязаны к выбранному на листе
    // терпиле и дают только его — поэтому берём именно shows red/brown.
    const cRed = col('shows red')
    const cBrown = col('shows brown')
    const cId = col('id')
    const cArr = col('arrival')
    const cArrStr = col('Прибытие')
    const cDist = col('Удалённость')
    const cVic = col('Терпила')
    const cAtk = col('Игрок')
    const cUnit = col('unit')

    if (cOrig < 0 || cDest < 0 || cMark < 0) {
      throw new Error('Лист "Data" не содержит колонок start/final xxx|yyy или Метка — это не анализатор атак')
    }

    // Точная пометка атак берётся из отдельных листов «Красные засветы!» /
    // «коричневые засветы» (по всем терпилам), матчинг поштучно по
    // откуда+куда+время прихода+расстояние.
    const redKeys = parseFlagSheet(wb.Sheets['Красные засветы!'])
    const brownKeys = parseFlagSheet(wb.Sheets['коричневые засветы'])

    const seen = new Set<string>()
    const parsed: ScoutAttack[] = []

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i] as unknown[]
      if (String(r[cMark]).trim() !== 'офф') continue

      const o = parseCoord(r[cOrig])
      const t = parseCoord(r[cDest])
      if (!o || !t) continue

      const reds = cRed >= 0 ? parseShow(r[cRed]) : 0
      const brown = cBrown >= 0 ? parseShow(r[cBrown]) : 0
      if (reds <= 0 && brown <= 0) continue      // только красные/коричневые засветы

      const oCoords = `${o[0]}|${o[1]}`
      const tCoords = `${t[0]}|${t[1]}`
      const key = `${oCoords}>${tCoords}@${cId >= 0 ? r[cId] : ''}|${cArr >= 0 ? r[cArr] : ''}`
      if (seen.has(key)) continue
      seen.add(key)

      parsed.push({
        oCoords, ox: o[0], oy: o[1],
        tCoords, tx: t[0], ty: t[1],
        reds, brown,
        aRed: redKeys.has(attackKey(oCoords, tCoords, r[cArrStr], r[cDist])),
        aBrown: !redKeys.has(attackKey(oCoords, tCoords, r[cArrStr], r[cDist])) && brownKeys.has(attackKey(oCoords, tCoords, r[cArrStr], r[cDist])),
        victim: cVic >= 0 ? String(r[cVic]).trim() : '',
        attacker: cAtk >= 0 ? String(r[cAtk]).trim() : '',
        unit: cUnit >= 0 ? String(r[cUnit]).trim() : '',
        arrival: cArrStr >= 0 ? arrivalKey(r[cArrStr]) : '',
      })
    }

    attacks.value = parsed
    enemyVillages.value = parseNotes(wb)
    save()
    const targets = new Set(parsed.map((a) => a.tCoords)).size
    const origins = new Set(parsed.map((a) => a.oCoords)).size
    return { attacks: parsed.length, targets, origins }
  }

  /**
   * Парсит лист «Заметки» — реестр всех деревень врага (из слитой инфы):
   * col0 = координаты "x|y", col1 = тип деревни (офф / деф / деф??).
   */
  function parseNotes(wb: XLSX.WorkBook): EnemyVillage[] {
    const ws = wb.Sheets['Заметки']
    if (!ws) return []
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
    const out: EnemyVillage[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const c = parseCoord(r[0])
      if (!c) continue
      const coords = `${c[0]}|${c[1]}`
      if (seen.has(coords)) continue
      seen.add(coords)
      const raw = String(r[1] ?? '').trim().toLowerCase()
      const kind: VillageKind = raw.startsWith('офф') ? 'off' : raw.startsWith('деф?') ? 'def?' : 'def'
      out.push({ coords, x: c[0], y: c[1], kind })
    }
    return out
  }

  async function importFile(file: File): Promise<{ attacks: number; targets: number; origins: number; enemies: number }> {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    lastFile.value = file.name
    const res = parseWorkbook(wb)
    return { ...res, enemies: enemyVillages.value.length }
  }

  function clear() {
    attacks.value = []
    enemyVillages.value = []
    lastFile.value = ''
    filterVictim.value = ''
    filterAttacker.value = ''
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_KEY + '_enemy')
    localStorage.removeItem(LS_KEY + '_file')
  }

  // ── Фильтры по терпиле и по атакующему ─────────────────────────────────
  const filterVictim = ref<string>('')
  const filterAttacker = ref<string>('')

  function countBy(pick: (a: ScoutAttack) => string): Array<{ name: string; count: number }> {
    const m = new Map<string, number>()
    for (const a of attacks.value) {
      const v = pick(a) || '—'
      m.set(v, (m.get(v) ?? 0) + 1)
    }
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
  }

  /** Список терпил с числом атак (для селектора). */
  const victims = computed(() => countBy((a) => a.victim))
  /** Список атакующих с числом атак (для селектора). */
  const attackers = computed(() => countBy((a) => a.attacker))

  const filteredAttacks = computed<ScoutAttack[]>(() =>
    attacks.value.filter(
      (a) =>
        (!filterVictim.value || (a.victim || '—') === filterVictim.value) &&
        (!filterAttacker.value || (a.attacker || '—') === filterAttacker.value),
    ),
  )

  // ── Агрегация по целям (куда) ──────────────────────────────────────────
  // Засвет (красный/коричневый) — свойство деревни-ИСТОЧНИКА, одинаковое для
  // всех её атак. Поэтому для цели считаем засветы по УНИКАЛЬНЫМ источникам,
  // а не по атакам (иначе 4 атаки с одной красной деры дают 4 вместо 1).
  const targets = computed<ScoutPoint[]>(() => {
    const m = new Map<string, ScoutPoint>()
    const seenOrigin = new Map<string, Set<string>>() // target → учтённые источники
    for (const a of filteredAttacks.value) {
      let p = m.get(a.tCoords)
      if (!p) {
        p = { coords: a.tCoords, x: a.tx, y: a.ty, count: 0, reds: 0, brown: 0, victim: a.victim }
        m.set(a.tCoords, p)
        seenOrigin.set(a.tCoords, new Set())
      }
      p.count++
      const origins = seenOrigin.get(a.tCoords)!
      if (!origins.has(a.oCoords)) {
        origins.add(a.oCoords)
        p.reds += a.reds > 0 ? 1 : 0
        p.brown += a.brown > 0 ? 1 : 0
      }
      if (!p.victim && a.victim) p.victim = a.victim
    }
    return [...m.values()].sort((x, y) => y.count - x.count)
  })

  // ── Агрегация по точкам выхода (откуда) ────────────────────────────────
  const origins = computed<ScoutPoint[]>(() => {
    const m = new Map<string, ScoutPoint>()
    for (const a of filteredAttacks.value) {
      let p = m.get(a.oCoords)
      if (!p) {
        p = { coords: a.oCoords, x: a.ox, y: a.oy, count: 0, reds: 0, brown: 0, attacker: a.attacker, targets: new Set() }
        m.set(a.oCoords, p)
      }
      if (!p.attacker && a.attacker) p.attacker = a.attacker
      p.count++
      // засвет один на деревню — берём максимум, а не сумму по атакам
      p.reds = Math.max(p.reds, a.reds)
      p.brown = Math.max(p.brown, a.brown)
      p.targets!.add(a.tCoords)
    }
    return [...m.values()].sort((x, y) => y.count - x.count)
  })

  const maxTargetCount = computed(() => targets.value.reduce((m, t) => Math.max(m, t.count), 1))

  // ── Деревни врага из «Заметок» ─────────────────────────────────────────
  const enemyByCoords = computed(() => {
    const m = new Map<string, EnemyVillage>()
    for (const v of enemyVillages.value) m.set(v.coords, v)
    return m
  })

  /** Тип деревни по «Заметкам» (офф/деф/деф?) или null, если нет в реестре. */
  function kindOf(coords: string): VillageKind | null {
    return enemyByCoords.value.get(coords)?.kind ?? null
  }

  // Все засвеченные точки выхода (по ВСЕМ атакам, без учёта фильтров).
  const allOriginCoords = computed(() => new Set(attacks.value.map((a) => a.oCoords)))

  /** Офф-деревни врага, из которых НЕ было засвеченных атак — потенциальные резервы. */
  const offReserves = computed<EnemyVillage[]>(() =>
    enemyVillages.value.filter((v) => v.kind === 'off' && !allOriginCoords.value.has(v.coords)),
  )

  /** Деф-деревни врага, из которых ВСЁ ЖЕ была засвеченная атака (отвлечение / скрытый офф). */
  const defDecoys = computed<EnemyVillage[]>(() =>
    enemyVillages.value.filter((v) => v.kind !== 'off' && allOriginCoords.value.has(v.coords)),
  )

  const hasNotes = computed(() => enemyVillages.value.length > 0)

  return {
    attacks, enemyVillages, lastFile,
    importFile, parseWorkbook, clear,
    filterVictim, victims, filterAttacker, attackers, filteredAttacks,
    targets, origins, maxTargetCount,
    enemyByCoords, kindOf, offReserves, defDecoys, hasNotes,
  }
})
