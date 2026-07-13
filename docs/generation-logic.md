# Логика генерации атак (`planStore.generate()`)

## Обзор

Генерация — синхронная функция. При каждом запуске **полностью сбрасывает** предыдущие результаты (`attacks`, `noblePlacements`, `generationIssues`) и строит новый план с нуля.

Вся конфигурация берётся из активного `MassConfig` — набора слотов, каждый из которых ссылается на пресет по `presetId`.

---

## Ключевые типы

### AttackType — что попадает в план

```ts
type AttackType =
  | 'off'            // обычный офф (топоры + ЛК + тараны)
  | 'paladin_off'    // офф с паладином (приоритет пробоя стены)
  | 'split_off_rams' // часть 1 сплита — тараны + половина войск
  | 'split_off_rest' // часть 2 сплита — остаток без таранов (летит быстрее)
  | 'spam'           // фейк-атака (мин. войск + 1 таран)
  | 'spam_noble'     // дворянин на отвлекающую цель
```

### VillageRoleType — типы пресетов

```ts
type VillageRoleType =
  | 'full_off'   // все офф войска (топоры+ЛК+тараны), фильтр по offFarm
  | 'half_off'   // средний офф — offFarm между halfOff и fullOff порогами
  | 'mini_off'   // мини офф — offFarm между smallOff и halfOff порогами
  | 'cat_squad'  // кат-отряд (⚠️ тип определён, в generate() не обрабатывается — заглушка)
  | 'spam'       // спам/паровоз
  | 'custom_off' // кастомный состав
```

### MassSlot — один слот масс-конфига

```ts
interface MassSlot {
  presetId:        string   // ссылка на пресет
  count:           number   // атак на каждую цель
  offsetMs:        number   // сдвиг времени прилёта (мс, может быть < 0)
  enabled:         boolean
  windowBeforeMin?: number  // спам: рандомное окно до arrivalTime (мин)
  windowAfterMin?:  number  // спам: рандомное окно после arrivalTime (мин)
}
```

---

## Шаг 1 — Пул войск

```ts
pool[coords] = { ...village.troops }  // shallow copy
```

Войска из пула **вычитаются** по мере назначения атак. Одни войска не могут уйти дважды. Исходные данные деревни (`village.troops`) не мутируются.

---

## Шаг 2 — Виртуальный пул дворян

Управляется `noblePollMode` из настроек мира:

| Режим | Источник |
|---|---|
| `'real'` (по умолчанию) | сумма `snob` по деревням игрока из CSV |
| `'virtual'` | `playerData[player].totalNobles` — полностью из ручного поля |

```ts
virtualNoblePool[player] = sum(village.troops.snob) for all villages of player
// если режим 'virtual' — перезаписывается значением из playerData.totalNobles
```

Пул убывает по мере назначения атак с дворянами. Это позволяет учитывать дворян ещё не построенных в конкретных деревнях.

---

## Шаг 3 — Pool tags (приоритет пал/пробой)

`buildPoolTags()` анализирует оригинальные войска и назначает тег каждой деревне игрока:

| Тег | Условие |
|---|---|
| `'breach+pal'` | ram ≥ breachMinRams, есть офф + есть паладин |
| `'pal_off'`    | полный офф, есть паладин (нет пробоя) |
| `'breach_off'` | ram ≥ breachMinRams, есть офф, без паладина |
| `'full_off'`   | просто полный офф |

Паладины распределяются по игрокам: сначала на breach-деревни (сильнейшие первые), потом на обычные full-off.

Все деревни с тегом отличным от `'full_off'` попадают в `dedicatedVillages` — зарезервированы исключительно для слота `full_off`. Другие типы слотов (`half_off`, `mini_off`, `custom_off`) не могут взять эти деревни.

---

## Шаг 4 — Pre-compute per-target data

Для каждой цели заранее считаются:

- **`byDist`** — все деревни, отсортированные по `watchtowerScore + distance` (безопасные ближние первые)
- **`byDistFar`** — деревни без засвета башней сортируются дальние первые; деревни под засветом — в конце
- **`nobleVillages`** — `byDist`, отфильтрованные по `snobMaxDist`
- **`distMap`**, **`wtMap`** — кэш дистанций и башенных штрафов

`pairScore(village, target) = wtScore + distance` — используется в greedy-распределении.

---

## Шаг 5 — Сортировка слотов

Слоты сортируются по `slotPoolPriority()` перед обработкой:

| Приоритет | Тип |
|---|---|
| 0 | `custom_off` с дворянами + сопровождением (noble-офф) |
| 1 | `custom_off` с дворянами без сопровождения |
| 2 | `full_off` |
| 3 | `half_off` |
| 6 | прочие `custom_off` |
| 10 | `spam` (своя очередь, не конкурирует с оффами) |

Noble-custom_off слоты идут первыми — они частично резервируют войска, но не выводят деревню из пула целиком. Если после резервирования топоры+ЛК всё ещё выше порога, деревня доступна для `full_off`.

---

## Шаг 6 — Основной цикл (`globalAssignSlot` + spam-ветка)

### Оффы — `globalAssignSlot()`

Обрабатывает: `full_off`, `half_off`, `mini_off`, `custom_off`.

Поведение определяется `offDistribution`:

| Режим | Алгоритм |
|---|---|
| `'default'` | Greedy: строим все пары `(деревня, цель)`, сортируем по `pairScore`, назначаем жадно |
| `'fair'` | Round-robin: в каждом раунде каждая цель берёт 1 деревню по указателю |
| `'far_first'` | Как `'fair'`, но список кандидатов = `byDistFar` (дальние ближние) |

#### `full_off`

Фильтр: `offFarm ≥ fullOffMinOffFarm`.

Состав атаки: все `axe + light + heavy + ram` (полное потребление).

Если паладин (`paladinMode !== 'none'`): деревни с тегом `breach+pal` / `pal_off` / `breach_off` получают соответствующий `AttackType` (`paladin_off`, `off`).

Кандидаты приоритизируются: breach+pal → pal → breach → обычные.

#### `half_off`

Фильтр: `halfOffMinOffFarm ≤ offFarm < fullOffMinOffFarm`.

Состав: все `axe + light + heavy + ram`.

Если `halfFixedComp = true` — фиксированный состав (axe/light/heavy/ram из настроек пресета).

Если нет — все офф войска деревни.

Поддерживает `minRams`.

#### `mini_off`

Фильтр: `smallOffMinOffFarm ≤ offFarm < halfOffMinOffFarm`.

Состав: все `axe + light + heavy + ram`.

#### `custom_off`

Самый гибкий тип. Состав задаётся через `customUnits` и `customUnitPct`:

| Значение | Поведение |
|---|---|
| `0` | не брать этот юнит |
| `-1` | взять всё доступное в пуле |
| `> 0` | взять ровно N (если pct не задан) |
| pct override | взять X% от пула |

Фильтр по `customUnitMin`: деревня должна иметь в оригинальных войсках не менее указанного кол-ва каждого юнита. Для `snob` проверяется `virtualNoblePool[player]`, а не деревня напрямую.

**Noble-слот** (`customUnits.snob > 0`): использует `usedNobleVillages` — одна деревня может дать дворян только на одну цель.

Потребление пула: частичное (только указанные юниты). Деревня остаётся в пуле для других слотов.

---

### Спам — отдельная ветка

Обрабатывается последовательно по целям (не через `globalAssignSlot`).

#### Обычный спам (`spamTrainSize = 0`)

`buildSpamComp()` строит минимальный состав:
- 1 таран (или 1 катапульта если тарана нет)
- пехота для добивки до `minAttackSize` по усадьбе

Таран/катапульта вычитается из пула. Пехота — нет.

Поддерживает рандомное окно (`windowBeforeMin` / `windowAfterMin`).

#### Спам-паровоз (`spamTrainSize > 0`)

`pickNobleVillage()` выбирает деревню с `trainSize` дворянами.

Генерирует:
- `spamCount` фейк-атак типа `spam` (из одной деревни)
- `trainSize` дворянских атак типа `spam_noble` с интервалом `snobIntervalMs`

---

## Фильтры (не пускают деревню в план)

| Условие | Где |
|---|---|
| `sendExcludeEnabled` + ночное окно отправки | `pushAtk()` → `return false` |
| Ночное окно заранее (до мутации пула) | `nightExcludes()` перед выбором |
| Дистанция дворян > `snobMaxDist` | фильтр `nobleVillages` |
| offFarm вне диапазона пресета | проверка внутри `globalAssignSlot` |
| `customUnitMin` не выполнен | `meetsUnitMin()` в custom_off блоке |
| Деревня уже использована | `usedVillages.has()` |
| Деревня в `dedicatedVillages` | зарезервирована под `full_off` |

## Предупреждения (только флаг на атаке, не фильтруют)

| Код | Условие |
|---|---|
| `SEND_IN_PAST` | `sendTime < now` |
| `NIGHT_ARRIVAL` | прилёт в ночное окно |
| `NIGHT_SEND` | отправка в ночное окно (при `nightActive`) |
| `WATCHTOWER_HIT` | маршрут пересекает радиус башни наблюдения |
| `SNOB_TOO_FAR` | дворянин > `snobMaxDist` от цели |
| `MORALE_HIGH_RISK` | очки атакер/защитник < 1.0 |
| `MORALE_MEDIUM` | очки атакер/защитник < 1.5 |

---

## Башня наблюдения (`calcWatchtowerExposure`)

Геометрия: пересечение отрезка маршрута с окружностью башни через дискриминант.

Входные данные хранятся в `watchtowerVillages` (localStorage `vp_watchtower`).

Проверяется только башня целевого игрока (`tower.player === target.enemyPlayer`).

Результат — `{ detected: boolean, chord: number }`. Chord (длина хорды) используется для скоринга: деревни с меньшей хордой предпочтительнее (засвет позже = меньше времени у врага).

Скоринг кандидатов: `score = (detected ? 1_000_000 + chord : 0) + distance`.

Итог: `[без засвета, ближние] → [без засвета, дальние] → [засвет мин.хорда] → [засвет макс.хорда]`.

---

## Рекомендации по строительству (`noblePlacements`)

`trackNoble(village)` вызывается каждый раз когда деревня получает дворянина в атаку. Накапливает `{ village, count }`.

`nobleRecommendations` — Map `player → usedNobles`: сколько дворян игрок использует в плане. UI использует для советов по строительству.

---

## Открытие приказов (`openOrdersTo`)

Computed на основе `attacks.value`. Для каждой цели собирает игроков с **реальными** (не спам) атаками. Если два игрока атакуют одну цель реальными атаками — они попадают в список приказов друг другу.

Спам (`type === 'spam'` / `'spam_noble'`) **не учитывается**.

---

## `pickNobleVillage()` — выбор деревни для дворян

Принимает отсортированный по дистанции список кандидатов (`nobleVillages`).

Ранжирование: `rank = distanceIndex × 2` (построены) или `distanceIndex × 2 + 1` (виртуальные).

Результат: ближайшая виртуальная бьёт дальнюю с готовыми дворянами.

При виртуальном назначении: `pool[v].snob += budgetNeeded`, `virtualNobleBudget[player] -= budgetNeeded`.

Одна деревня не может дать дворян двум разным целям (`usedNobleVillages`).

---

## Проблемы генерации (`GenerationIssue`)

После генерации собирается список проблем:

| Тип | Когда |
|---|---|
| `OFFS_SHORT` | запрошено N офф-атак на цель, сгенерировано меньше |
| `NOBLES_SHORT` | (не реализовано) |
| `SPAM_SHORT` | спам-слот не добрал нужное кол-во |

`offsReason` для `OFFS_SHORT` при `generated === 0`: `'pool_depleted'` / `'night_excluded'` / `'no_eligible'`.
