# Редизайн системы пресетов/масса → плоская модель

Статус: **черновик / на паузе** (2026-09-06). Код не менять до отдельного решения.

Мотивация: текущая система «пресеты войск + пресеты масса + train-пресеты (custom_off слоты)»
переусложнена и багованна из-за вложенности. За образец взята плоская модель
Devilicious Advanced Planner (`https://devilicious.dev/planner/advanced`):
роль источника + формула нобля `N×M` + глобальные констрейнты.

---

## 1. Диагноз (почему сейчас сложно)

Три ортогональные вещи **перепутаны** в одной модели:

- **`AttackPreset` → `VillageRole`** (`src/stores/presetsStore.ts`) — «мешок» из ~30 опциональных
  полей (`customUnits`, `customUnitPct/Min`, `halfMin/Max/FixedComp`, `catTarget/MinCats`,
  `spamCount/Strength/NobleCount/TrainSize`, `combined`…). Роль тащит и состав, и деление,
  и нобля, и трейн одновременно.
- **`MassConfig` → `MassSlot[]`** (`src/stores/massConfigStore.ts`) — слот ссылается на пресет
  (`presetId`) и добавляет `count` + `offsetMs` + `windowBefore/AfterMin`.
- Итог: «N атак × M ноблей» выражается **в 3 местах** — `spamCount/spamNobleCount/spamTrainSize`
  внутри пресета, `count` слота, и «custom_off-пресеты как слоты внутри train-пресета»
  (см. память `project_custom_presets` + «защита от вложенных циклов»). Три способа = баги.

---

## 2. Ключевая идея: разнести 3 независимых понятия

| Понятие      | Что это                                              | Сейчас размазано по |
|--------------|------------------------------------------------------|---------------------|
| **Роль**     | что берём из деревни (чистая функция от войск деры)   | `VillageRole.type` + куча полей |
| **Паттерн**  | как размножаем/делим: `N команд × M ноблей` (+ трейн) | `count` + `spamTrainSize` + `spamNobleCount` + custom_off-слоты |
| **Тайминг**  | когда: offset от прилёта + глобальные констрейнты     | `offsetMs` + окна + (частично отсутствует) |

---

## 3. Новые сущности (плоские)

```ts
type Role = 'off' | 'cat' | 'fake' | 'def' | 'noble'   // фикс. enum, 0–2 параметра
//  off:  { size: 'full' | 'mid' | 'mini' }            // пороги offFarm — из настроек (как сейчас)
//  cat:  { target: CatTarget }
//  fake: {}                                           // минимум войск (имитация)
//  def:  {}                                           // антиснайп (деф в подмогу)
//  noble:{}                                           // нобельный стек

interface SendPattern { commands: number; per: number; train: boolean }
//  Split 4×1 = {4,1,false}; Train 1×4 = {1,4,true}; Pairs 2×2 = {2,2,false} …
//  Именованные варианты — просто ЯРЛЫКИ к {N,M,train}, НЕ вложенный граф пресетов.

interface MassLine {
  role: Role
  roleParam?: { size?: 'full'|'mid'|'mini'; target?: CatTarget }
  pattern: SendPattern
  arrivalOffsetMs: number
  window?: { beforeMin: number; afterMin: number }
  enabled: boolean
}

interface Mass { name: string; lines: MassLine[] }     // плоский список строк, БЕЗ ссылок на пресеты

interface Constraints {                                // глобально, на план/масс
  maxDistance?: number
  minSecondsBetween?: number
  zeroDuplicateSendTimes?: boolean
  excludeWindows?: { from: string; to: string }[]
  uniqueSrcTargetCoord?: boolean
  uniqueSrcTargetPlayer?: boolean
  arrival?: { earliest?: string; latest?: string }
}
```

Роли — **фикс. дропдаун**, никакого CRUD троп-пресетов. «Custom» уходит из масс-пути
(при желании — отдельная одиночная роль, но НЕ как слот трейна).

---

## 4. Маппинг старое → новое (миграция данных)

| Старое | Новое |
|--------|-------|
| `full_off / half_off / mini_off` | `role:off` + `size` (пороги те же) |
| `cat_squad` (+`catTarget`) | `role:cat` (+`target`) |
| `spam` (`spamCount`,`spamNobleCount`,`spamTrainSize`,`strength`) | `role:fake` + `pattern:{ N=spamCount, M=spamNobleCount, train=spamTrainSize>0 }` |
| `custom_off` | `role:off/custom` (разовый конвертер), **не** как слот трейна |
| `MassSlot{presetId,count,offsetMs,window}` | `MassLine{ role+param из пресета, pattern.N=count, arrivalOffsetMs=offsetMs, window }` |
| «custom_off как слоты в train-пресете» | схлопывается в **одну** `MassLine` с `pattern.train + M` |

Идея `project_split_mass` (офф-деры делятся на N атак по 1 нобелю) = ровно `pattern {N, per:1}`
= devilicious **Split 4×1**. Становится встроенной, а не отдельной веткой.

---

## 5. UI

- **Убрать 2 страницы** «Пресеты войск» + «Пресеты масса» → одна **«Масс»**: таблица строк.
  Строка = `[Роль ▾] [размер/цель] [N×M ▾] [offset] [окно] [вкл]` + «добавить строку».
- Отдельная панель **Constraints** (глоб. галочки/поля).
- Планер: `Targets` (← прямой вход: **донор-деры** из вкладки «Аналитика») ·
  `Sources` (наши деры, авто-роль) · выбор Масса · **планирование от времени прилёта**
  (задаёшь окно прилёта → считаем время выхода, как в их Command Generator).

Мокап редактора (черновик):

```
Масс: "Ночной снос K55"                         [Constraints ▾]
┌ Роль ───── Параметр ── Паттерн ── Offset ─ Окно ─ Вкл ┐
│ Офф        full        4×1        +0s      —      [x] │
│ Кат        Стена       1×1        -2s      —      [x] │
│ Фейк       —           10×0       —        ±30m   [x] │
│ Нобль      —           1×4 trn    +0s      —      [x] │
└──────────────────────────────────────────────────────┘  [+ строка]
Constraints: maxDist 30 · minGap 1s · zeroDupSend ✓ · exclude 02:00–06:00 · uniqueSrc/Tgt ✓
```

---

## 6. Почему это чинит баги
- **Один канон** для «N×M» (паттерн) → нет расхождения preset-параметров vs `slot.count`.
- **Нет рекурсии** (пресет не ссылается на пресет; нет custom_off-как-слот) → удаляется весь
  код защиты от циклов.
- **Роль = чистый состав** (без тайминга/кол-ва) → `generate()` получает чистые входы.
- Троп-математику (offFarm-пороги, cat-таблицы `CATS_TO_DESTROY_LEVEL`) **не трогаем** —
  только переупаковываем вход.

---

## 7. План миграции (поэтапно, без большого взрыва)
1. Ввести новые типы рядом со старыми + **конвертер** старое→новое
   (читает `vp_presets_v2` / `vp_mass_configs_v3`).
2. Новый редактор **«Масс»** (одна страница), пишет новую модель.
3. Тонкий адаптер `MassLine[] → нынешний generate()` (сначала без переписывания ядра).
4. Автомиграция сохранённых конфигов при загрузке; старые страницы — deprecated.
5. Удалить custom_off-как-слот + guard'ы циклов; вычистить `VillageRole` до 5 ролей.

---

## 8. Открытые вопросы (решить перед стартом)
- **custom_off**: сохраняем ли произвольный состав? Если да — как отдельная роль `custom`
  с per-unit полями, но без участия в трейнах/слотах.
- **Кат-волна** (`MassConfig.catMassEnabled`, `activeCatConfig` в massConfigStore): встраиваем
  как роль `cat` в общий Масс, или оставляем отдельным проходом?
- **spam strength** (`weak/strong/full`): оставить как параметр роли `fake` (сила фейка),
  или убрать (фейк = всегда минимум)?
- Куда вешать **Constraints** — на Масс (переиспользуемо) или на конкретный запуск плана?

---

## Ссылки
- Образец плоской модели: Devilicious Advanced Planner — роли (Nuke/Fake/Anti-Snipe/Noble),
  дропдаун нобля `N×M` (Split/Train/Pairs), глобальные констрейнты, планирование от прилёта.
  Плюс их пайплайн: Off Pack (данные армии) → Planner → Command Generator → конвертеры (TW/DS).
- Текущий код: `src/stores/presetsStore.ts`, `src/stores/massConfigStore.ts`, `src/stores/planStore.ts`.
