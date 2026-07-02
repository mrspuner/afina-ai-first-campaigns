# План улучшений анимаций

Аудит motion-слоя Afina на 2026-04-30. Цель — снять дрейф от брендового ТЗ
(«точно и редко · exponential ease-out · без bounce · только opacity/transform ·
staggered page-entrance · маскот функционален») и закрыть пару performance-багов.

## Общее ощущение vs бренд

Большая часть кода уже идёт в правильную сторону: используются кёрвы
`[0.32, 0.72, 0, 1]` (iOS-drawer) и `[0.23, 1, 0.32, 1]` (ease-out-quart) в чатах,
hero, prompt-bar; есть `whileTap: 0.97` на чипах; layout-анимации сделаны через
motion корректно.

Дрейф в трёх местах:
1. Layout-properties (`bottom`, `width`, `font-size`), которые ползут вместо
   transform — триггерят paint+layout каждый кадр.
2. Кёрвы по умолчанию (`ease`, `transition: all`) тянут weak-feel в
   кнопках/таблицах/нодах.
3. Модалки/тултипы из `tw-animate-css` на 100 мс — для дайлогов это уже не
   «плотность Linear», а «дёрнулось и пропало».

---

## P0 — баги и нарушения performance-правил

| Где | Сейчас | Стало | Почему |
| --- | --- | --- | --- |
| `shell-bottom-bar.tsx:233` | `animate={{ bottom: floatBottom }}` | `style={{ bottom: rest }}` без motion + `animate={{ y: floatBottom - rest }}` (transform) | `bottom` — layout-property, триггерит reflow на каждом кадре. `transform: translateY` идёт через GPU. |
| `survey-awaiting.tsx:54` | `animate={{ width: \`${progress}%\` }}` (50 ms tick) | контейнер `w-full`, бар `transform: scaleX(progress)` + `transform-origin: left` | Анимация `width` — layout. При 50 ms tick (20 fps reflow) мерцает на слабых машинах. `scaleX` композитится. |
| `workflow-node.tsx:136` | `transition: "color 0.3s ease, font-size 0.3s ease"` | убрать `font-size`; либо два варианта текста с opacity-кроссфейдом, либо `scale` обёртки | `font-size` пересчитывает layout всего auto-layout графа. Плюс `ease` (default) не попадает в кёрв соседних нод `[0.32, 0.72, 0, 1]`. |
| `statistics-view.tsx:257` | `transition-transform group-data-[popup-open]/title:rotate-180` (без duration) | `transition-transform duration-200 ease-out` | Без `duration-*` Tailwind не задаёт длительность — это **0 мс, шеврон щёлкает мгновенно**. |
| `dialog.tsx:34,56` | `duration-100 data-open:fade-in-0 data-open:zoom-in-95` | `duration-200 [--tw-ease:cubic-bezier(0.32,0.72,0,1)]` | 100 мс на модалку — слишком быстро (бриф: «модалки 200–500 мс»). Сейчас она «выскакивает», ломая «спокойную уверенность». |
| `popover.tsx:40`, `dropdown-menu.tsx:44`, `select.tsx:86`, `tooltip.tsx:53` | все на `duration-100` | `duration-150` или 180 мс с явной кёрв через CSS-vars `--tw-animation-duration` / `--tw-ease` | 100 мс приемлемо для тултипа, но для попа/селекта/меню под Onest на десктопе это блик. |
| `button.tsx:9` | `active:not-aria-[haspopup]:translate-y-px` (только) | добавить `active:scale-[0.98]` (исключая `aria-haspopup`) | Главная кнопка интерфейса не «отзывается» на нажатии — 1 px сдвиг едва ощутим. Бриф «продукт умнее меня» работает только если каждое касание имеет отклик. |

## P1 — кёрвы и токены анимаций

| Где | Сейчас | Стало | Почему |
| --- | --- | --- | --- |
| Десятки `transition-all` (button, badge, accordion, tabs, step-1/2/3 cards, signals/steps, campaign-type-view) | `transition-all` | `transition-[transform,background-color,border-color,box-shadow,opacity] duration-200 ease-out` | `all` стартует transition на любое property change, включая `font-size`, `padding`, `margin` — layout-rectangle. Регрессия пробьёт fps. |
| Множество `transition-colors` без `--ease`/`--duration` | дефолт Tailwind | определить в `globals.css` `@theme`-токены: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-out-strong: cubic-bezier(0.32, 0.72, 0, 1)`, `--duration-fast: 120ms`, `--duration-base: 200ms`. Использовать `transition-* duration-(--duration-base) ease-(--ease-out)` | Сейчас одна и та же кёрв `[0.32, 0.72, 0, 1]` зашита локальной константой в 5 файлах, вторая кёрв `[0.23, 1, 0.32, 1]` — в 4 файлах. Без токенов любая правка кёрв = 20 файлов. |
| `signal-card.tsx:91` `[--tw-ease:cubic-bezier(0.23,1,0.32,1)]` локально | через токен | заменить инлайн-токенами после P1 #2 | Когда токены появятся. |
| `workflow-node.tsx:243` `wf-just-updated 1.2s ease-out` | 600 ms максимум | укоротить | «Только-что-обновлено» — feedback-вспышка. 1.2 с — это уже декорация, а не подтверждение. |

## P2 — дрейф от бренда (motion-language)

| Где | Сейчас | Стало | Почему |
| --- | --- | --- | --- |
| `onboarding-chat-view.tsx:21` typing-dots | `animate={{ y: [0, -3, 0], opacity: [...] }}` | `animate={{ opacity: [0.25, 1, 0.25] }}` (только opacity, тот же staggered delay 0.12 s) | Бриф: «без bounce и elastic». Точки прыгают по y — даже мягко, но это микро-bounce. Чистый opacity-stagger ближе к Linear/Raycast. |
| `welcome-view.tsx:50` hero-exit 0.52 s + чат `layout 0.52 s` | 520 ms | 360 ms exit, 420 ms layout | 520 мс — длинный для перехода, который пользователь видит **сразу после ввода первого сообщения**. Сейчас «думает», потом «двигает мебель». |
| `signal-card.tsx:91` `animate-in fade-in-0 slide-in-from-bottom-2` (одинаково на всех карточках) | без stagger | `style={{ animationDelay: \`${i * 40}ms\` }}` от `index` в родителе | Бриф: «page-entrance — staggered reveal». Сейчас три карточки появляются одновременно — нет каскада, нет «магии скрыта». |
| `OnboardingStepCards` — все три `<div>` появляются одновременно | без stagger | stagger по index 0/60/120 ms через `style={{ animationDelay }}` или `<motion.div delay={i*0.06}>` | Это первый экран — stagger даёт ощущение «продукт раскрывается перед тобой». |
| `survey-section.tsx:66` AnimatePresence step-форм (`mode="wait"`, fade 250 ms) | только fade | `x: 16` → `x: 0` на enter, `x: -16` на exit (forward); инверс на back | Сейчас опросник просто моргает между шагами. Spatial cue даёт чувство «иду вперёд». |
| `campaign-stepper.tsx:51` степ-индикатор `transition-colors` без duration | дефолт | `duration-200 ease-out` | Кружок «1 → 2» меняет цвет мгновенно — тонкий cue потерян. |
| `step-content.tsx:85` `transition={{ duration: 0.35 }}` без ease | дефолтный `easeOut` motion | `duration: 0.28, ease: [0.23, 1, 0.32, 1]` | Дефолтный `ease` после `[0.23, 1, 0.32, 1]` в соседних файлах — вылетает из ритма. |

## P3 — детали, которые компаундируются

| Где | Сейчас | Стало | Почему |
| --- | --- | --- | --- |
| Нигде нет `prefers-reduced-motion` | — | в `globals.css`: блок `@media (prefers-reduced-motion: reduce)` + в motion.div'ах через `useReducedMotion()` оставить только opacity | B2B-аудитория — есть пользователи с motion sickness/триггерами. Сейчас infinite `wf-needs-attention` и `wf-processing` пульсация будут крутиться даже с системным reduce-motion. |
| `tooltip.tsx` `delay={0}` глобально | мгновенный показ | `delay={400}` + поведение «после первого открытия — instant на соседних» | Бриф: «магия скрыта» — а tooltip-bombing на каждом наведении это noise. Linear-паттерн: 400 ms на первый, 0 на второй в течение 600 ms. |
| Множество `:hover` без `@media (hover: hover)` | срабатывает на тач | обернуть в `@media (hover: hover) and (pointer: fine)` | На тачпадах макбуков с touch passthrough случаются false-hover. На прототипе цена низкая. |
| `step-2-interests.tsx:173` `ring-amber-400/70 transition-shadow` | amber-400 | `ring-[#FFEC00]/70` (или token `--brand`) | Бриф: жёлтый = брендовый акцент `#FFEC00`. Amber-400 — серединка тёплого жёлтого, но это не наш жёлтый. |
| `workflow-graph.tsx:67` CSS transition хардкодом `transform 320ms cubic-bezier(0.32, 0.72, 0, 1)` | хардкод | через CSS-variable `--ease-out-strong` | После добавления токенов. |
| `dropdown-menu.tsx:44` open и close одинаковой длительности | симметрично | `data-closed:[--tw-animation-duration:100ms]` | Skill: exit быстрее enter (asymmetric timing). |

---

## Что делать первым (3 правки с наибольшим эффектом)

1. **Токены движения в `globals.css`** (`--ease-out`, `--ease-out-strong`,
   `--duration-base`, `--duration-fast`) — без них любая дальнейшая правка
   будет точечной заплаткой. Сразу же меняет `transition-all duration-100` шум
   на единый язык.
2. **`Button: active:scale-[0.98]`** — самое касаемое изменение, ощущение
   «продукт умнее меня» рождается именно тут.
3. **`shell-bottom-bar` `animate bottom` → `transform: translateY`** +
   **`survey-awaiting` `width %` → `scaleX`** — два самых дорогих по перформансу
   места, которые сейчас триггерят layout-recalc на каждом кадре.

После — `dialog` 100 → 200 ms, ChevronDown duration-200, stagger по index в
карточках сигналов и onboarding, prefers-reduced-motion блок.
