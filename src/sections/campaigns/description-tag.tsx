"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Globe, X, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DescriptionTag } from "@/state/graph-description";
import { conditionTriggerLabel } from "@/state/node-sublabel";
import type { ConditionParams, NodeParams, WaitParams, WorkflowNodeType } from "@/types/workflow";
import type { DomainStatus } from "@/types/account-settings";
import type { WizardStepId } from "@/sections/campaigns/wizard/wizard-steps";
import { useAppState, useAppDispatch } from "@/state/app-state-context";
import { useChat } from "@/state/chat-context";
import {
  channelForNodeKind,
  templateOptionsForKind,
  templateParamKeyForKind,
} from "@/state/node-template-options";
import { STEP_ICON, STEP_LABELS } from "./wizard/campaign-stepper";
import { NODE_ICON, NODE_STYLES } from "./node-visuals";
import { NodeTemplateList } from "./node-template-select";
import { WaitFields } from "./wait-fields";
import { NodeFieldCombobox } from "./node-field-combobox";
import { DomainStatusBadge } from "@/sections/settings/domains-block";

/**
 * Общая геометрия пилюли. `items-baseline`+`align-baseline` — пилюля сидит НА
 * строке текста, а не плавает над/под ней.
 *
 * `my-[2px]` (владелец продукта) — вертикальный зазор МЕЖДУ пилюлями соседних
 * обёрнутых строк. Пилюля наследует line-height контейнера, поэтому её высота
 * растёт вместе с `leading`; поднимать `leading`, чтобы развести строки, было
 * бесполезно — раздувало и саму пилюлю (line-height остаётся прежним). Вместо
 * этого добавляем пилюле собственный вертикальный отступ: как atomic
 * inline-flex, её margin-box участвует в высоте строки, поэтому 2px сверху и
 * снизу дают ~4px чистого зазора между пилюлями верхней и нижней строк, не
 * трогая общий межстрочный интервал прозы.
 */
const PILL_BASE =
  "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0 my-[2px] align-baseline text-[0.95em] font-semibold";

/**
 * Тег читается как отдельный элемент, а не как часть карточки: серая
 * подложка макета (`--scenario-tag-bg`, Task 1) с серой обводкой
 * (`--scenario-tag-border`, правка 2 владельца продукта: белая обводка макета
 * читалась слишком контрастно рядом с приглушённым фоном) — не светлая
 * заливка Task 6. Радиус/паддинг переопределены под макет (7px) — `cn` в
 * `pillClass` ниже мёржит их через `twMerge`, поэтому `rounded-md`/`px-1.5` из
 * `PILL_BASE` не остаются в финальном классе. Демоция в `none` (кампания
 * запущена / шага нет в визарде) остаётся ЭТИМ ЖЕ классом у ШАГОВЫХ тегов
 * («Режим», «Бюджет») — она снимает интерактив, а не цвет: серая
 * read-only-пилюля прятала бы значение ровно там, где его только и можно
 * прочитать. У типизированных узлов (шаблон/пауза/условие) демоция цвет тоже
 * не гасит, но там он свой — из `NODE_STYLES` (см. `resolveVisual`).
 */
const NEUTRAL_CLASS =
  "rounded-[7px] border border-scenario-tag-border bg-scenario-tag-bg px-[7px] text-white";

/**
 * Hover-подсветка нейтральной пилюли — ТОЛЬКО у кликабельного пути. Не часть
 * `NEUTRAL_CLASS`, потому что тот же класс несёт и демотированная в `none`
 * пилюля (см. выше): она больше не кнопка, курсор над ней ничего не нажимает,
 * и подсвечивать её как «можно нажать» было бы враньём.
 */
const NEUTRAL_HOVER_CLASS = "hover:bg-scenario-tag-hover";

interface ResolvedVisual {
  className: string;
  style?: CSSProperties;
  Icon?: LucideIcon;
}

/**
 * Визуал пилюли по цели тега. `wizard-step`/`domains`/`none` — нейтральные
 * Tailwind-классы; `template`/`node-fields` красятся под ноду графа из
 * `NODE_STYLES`/`NODE_ICON` — источник истины для цвета нод (см. node-visuals.ts).
 * Тип ноды тег не хранит, поэтому приходит пропом; без него — нейтральный вид.
 *
 * `none` (кампания запущена, либо граф больше не правится) снимает ТОЛЬКО
 * интерактив — ни цвет, ни иконку (визуальная спека §4: «цвет остаётся, клик
 * пропадает»). Личность демоции хранит сам таргет: `step` — шаговый тег
 * («Режим», «Бюджет»), у него собственного цвета узла нет и не было, остаётся
 * серый вид макета плюс `STEP_ICON`; `nodeId` — узел (шаблон/пауза/условие),
 * его `nodeType` приходит пропом тем же лукапом, что и у живой цели, и даёт
 * ту же пару `NODE_STYLES`/`NODE_ICON`. Серый для типизированного узла делал
 * бы пилюли ЗАПУЩЕННОЙ кампании непохожими на её же узлы графом ниже —
 * рассинхрон «тег ↔ узел», который визуальная спека §3 прямо запрещает.
 * Разница между демотированной и живой цветной пилюлей — не в цвете, а в
 * отсутствии кнопки/поповера/курсора (hover-подсветки нет ни у той, ни у
 * другой: `NEUTRAL_HOVER_CLASS` — только нейтральный путь).
 */
function resolveVisual(tag: DescriptionTag, nodeType: WorkflowNodeType | undefined): ResolvedVisual {
  const target = tag.target;
  switch (target.kind) {
    case "wizard-step":
      return { className: cn(NEUTRAL_CLASS, NEUTRAL_HOVER_CLASS), Icon: STEP_ICON[target.step] };
    case "template":
    case "node-fields": {
      if (!nodeType) return { className: cn(NEUTRAL_CLASS, NEUTRAL_HOVER_CLASS) };
      const s = NODE_STYLES[nodeType];
      return {
        className: "",
        style: { borderColor: s.border, backgroundColor: s.bg, color: s.color },
        Icon: NODE_ICON[nodeType],
      };
    }
    case "domains":
      return { className: cn(NEUTRAL_CLASS, NEUTRAL_HOVER_CLASS), Icon: Globe };
    case "triggers":
      // Триггеры скоринга: нейтральная кликабельная пилюля с иконкой шага
      // «Интересы». Клик не раскрывает поповер, а поднимается через onActivate
      // (экран кампании открывает боковой дровер триггеров) — поэтому цель
      // проваливается в общий фолбэк-путь ниже, к кнопке-тултипу.
      return { className: cn(NEUTRAL_CLASS, NEUTRAL_HOVER_CLASS), Icon: STEP_ICON.interests };
    case "none": {
      // Шаговый тег — вид макета (своего цвета у него нет), но без
      // hover-подсветки: нажимать больше нечего.
      if (target.step) return { className: NEUTRAL_CLASS, Icon: STEP_ICON[target.step] };
      // Демотированный узел красится ровно как живой — та же ветка
      // `NODE_STYLES`/`NODE_ICON`, что у `template`/`node-fields` выше, только
      // без кнопки и поповера вокруг неё.
      if (!nodeType) return { className: NEUTRAL_CLASS };
      const s = NODE_STYLES[nodeType];
      return {
        className: "",
        style: { borderColor: s.border, backgroundColor: s.bg, color: s.color },
        Icon: NODE_ICON[nodeType],
      };
    }
  }
}

interface DescriptionTagPillProps {
  tag: DescriptionTag;
  onActivate?: (tag: DescriptionTag) => void;
  /** Тип ноды для целей `template`/`node-fields` — сам тег его не знает. */
  nodeType?: WorkflowNodeType;
  /**
   * Параметры ноды ожидания для цели `node-fields` (Task 8) — резолвятся
   * вызывающим (`CampaignScreen`, из `launchGraph.nodes`) ТЕМ ЖЕ путём, что и
   * `nodeType` выше, а не самой пилюлей: она не лезет в кэш графа напрямую.
   * Без пропа (нода не нашлась) или при несовпадении `kind` (`params.kind !==
   * "wait"`) пилюля деградирует к обычной кнопке-тултипу ниже — без пустого
   * поповера.
   */
  waitParams?: WaitParams;
  /**
   * Параметры ноды условия для цели `node-fields` (Task 3) — резолвятся
   * вызывающим ТЕМ ЖЕ путём, что и `waitParams` выше (`workflow-description.tsx`,
   * `nodeParams: Map<string, NodeParams>` из `launchGraph.nodes`). Без пропа
   * (нода не нашлась) или при несовпадении `kind` (`params.kind !==
   * "condition"`) пилюля деградирует к обычной кнопке-тултипу — как и
   * `waitParams` без резолва.
   */
  conditionParams?: ConditionParams;
  /** Все домены триггеров кампании со статусами — содержимое поповера цели
   *  `domains` (Task 8). Приходит от `WorkflowDescription` (тот же проп, что
   *  описание уже несёт как `facts.domains`), не читается пилюлей из module
   *  state. Без пропа (или пустого списка) — деградация к обычной
   *  кнопке-тултипу, как и `node-fields` без резолвнутых params. */
  domains?: { domain: string; status: DomainStatus }[];
}

/**
 * Подсказка на наведении: «Нажмите для изменения» плюс — если есть — само
 * значение. Одна композиция на оба пути (поповерная пилюля и обычная
 * кнопка-тултип): разъехавшись, они дали бы усечённой пилюле подсказку с
 * именем в одном месте и без имени в другом.
 */
function tooltipBody(hint: string | undefined) {
  if (!hint) return "Нажмите для изменения";
  return (
    <div className="flex flex-col gap-0.5">
      <span>{hint}</span>
      <span className="text-background/70">Нажмите для изменения</span>
    </div>
  );
}

/**
 * Значение параметра кампании, вынесенное из текста описания в пилюлю
 * (Task 4 → `describeWorkflow`). Цель `none` — носитель значения без клика:
 * запущенная кампания или шаг, которого нет в её визарде (спека §2.12).
 * Отдельной read-only-ветки поэтому не требуется — это она и есть.
 */
export function DescriptionTagPill({
  tag,
  onActivate,
  nodeType,
  waitParams,
  conditionParams,
  domains,
}: DescriptionTagPillProps) {
  const { className, style, Icon } = resolveVisual(tag, nodeType);
  // Правка 4 (владелец продукта): усечение теперь ЛЮБОЙ пилюли, а не только
  // табличной — `truncateLabel`-флаг убран, механика (max-width + truncate +
  // подсказка с полным значением) стала постоянным поведением. Подсказка
  // обычно — остаток схлопнутого перечисления (`hoverList`); без него —
  // ПОЛНОЕ значение тега, иначе усечённый многоточием текст нечем прочитать
  // целиком ни в прозе, ни в таблице.
  const hint = tag.hoverList?.join(", ") ?? tag.label;
  // Правка 4: 20 символов текущего шрифта пилюли — общий потолок ширины для
  // ВСЕХ целей (прежде это была табличная особенность `max-w-full`, завязанная
  // на ширину колонки). `min-w-0` на span ниже обязателен — без него
  // флекс-элемент не сжимается уже своего содержимого, и `truncate` не
  // срабатывает вовсе.
  const pillClass = cn(PILL_BASE, className, "max-w-[20ch]");

  const content = (
    <>
      {Icon && <Icon className="h-3 w-3 shrink-0 self-center" aria-hidden />}
      <span className="min-w-0 truncate">{tag.label}</span>
    </>
  );

  if (tag.target.kind === "none") {
    return (
      <span className={pillClass} style={style} title={hint}>
        {content}
      </span>
    );
  }

  // База кампании (Task 12): единственный шаговый тег, чей поповер редактирует
  // ЦЕЛИКОМ на месте (список загруженных файлов — добавить/удалить), а не
  // подтверждает уход на шаг визарда. Перехватывает ветку `wizard-step`
  // раньше общего случая ниже — остальные шаговые теги («Режим», «Интересы»,
  // «Бюджет» …) в неё не попадают, для них поведение не меняется.
  if (tag.target.kind === "wizard-step" && tag.target.step === "file") {
    return (
      <BaseFilesTagPopover className={pillClass} style={style} hint={hint}>
        {content}
      </BaseFilesTagPopover>
    );
  }

  // Настройка шага визарда (Task 2): раньше клик по тегу сразу звал
  // onActivate и уводил с карточки — случайный клик (например, промах при
  // попытке навести и прочитать тултип) необратимо снимал карточку. Поповер
  // добавляет подтверждающий шаг — и только его кнопка «Изменить» поднимает
  // клик наверх.
  if (tag.target.kind === "wizard-step") {
    return (
      <WizardStepTagPopover
        tag={tag}
        step={tag.target.step}
        onActivate={onActivate}
        className={pillClass}
        style={style}
        hint={hint}
      >
        {content}
      </WizardStepTagPopover>
    );
  }

  // Шаблон (Task 7): поповер раскрывается прямо у пилюли, клик наверх
  // (onActivate) не поднимается — спека §2.12 велит `template` оставаться на
  // карточке. Без известного nodeType (лукап не нашёл ноду) деградируем к
  // обычной кнопке-тултипу ниже — она хотя бы не выглядит сломанной.
  if (tag.target.kind === "template" && nodeType) {
    return (
      <TemplateTagPopover
        nodeId={tag.target.nodeId}
        nodeType={nodeType}
        selectedName={tag.label}
        className={pillClass}
        style={style}
        hint={hint}
      >
        {content}
      </TemplateTagPopover>
    );
  }

  // Пауза (Task 8): содержимое поповера — тот же WaitFields, что нодо-блок
  // графа несёт внутри себя (самодостаточен, диспатчит workflow_node_field_set
  // сам). Без резолвнутых waitParams (нода не найдена, либо это не wait-нода —
  // params.kind !== "wait") падаем ниже, к обычной кнопке-тултипу без
  // поповера, а не открываем пустой поповер.
  if (tag.target.kind === "node-fields" && waitParams) {
    return (
      <WaitFieldsTagPopover
        nodeId={tag.target.nodeId}
        params={waitParams}
        className={pillClass}
        style={style}
        hint={hint}
      >
        {content}
      </WaitFieldsTagPopover>
    );
  }

  // Условие (Task 3): содержимое поповера — тот же NodeFieldCombobox над
  // полем «Событие», что нодо-блок графа несёт для condition
  // (NODE_FIELD_EDITABILITY.condition). Без резолвнутых conditionParams (нода
  // не найдена, либо это не condition-нода — params.kind !== "condition")
  // падаем ниже, к обычной кнопке-тултипу без поповера — тот же приём, что и
  // у node-fields без waitParams выше.
  if (tag.target.kind === "node-fields" && conditionParams) {
    return (
      <ConditionTagPopover
        nodeId={tag.target.nodeId}
        params={conditionParams}
        className={pillClass}
        style={style}
        hint={hint}
      >
        {content}
      </ConditionTagPopover>
    );
  }

  // Домены (Task 8): чисто информационный поповер — список ВСЕХ доменов
  // триггеров кампании (не только «на проверке») с их статусом модерации.
  // Единственное место продукта, где одобренные/отклонённые домены вообще
  // видны. Без списка (проп не пришёл или пуст) — деградация к обычной
  // кнопке-тултипу ниже, как и у node-fields без params.
  if (tag.target.kind === "domains" && domains && domains.length > 0) {
    return (
      <DomainsTagPopover
        domains={domains}
        className={pillClass}
        style={style}
        hint={hint}
      >
        {content}
      </DomainsTagPopover>
    );
  }

  // Общий фолбэк: прямая кнопка-тултип БЕЗ поповера — сюда доходят только
  // деградации template/node-fields/domains (нода не нашлась / params не
  // резолвнулись / список пуст). `wizard-step` сюда больше не попадает (Task 2
  // выше перехватывает её своим поповером) — эта ветка их не обрабатывает.
  //
  // Item 4 (финальное ревью): раньше `hint` (остаток схлопнутого
  // перечисления, «ещё N триггерам») сидел на ТОМ ЖЕ узле, что оборачивает
  // base-ui's Tooltip — наведение показывало ДВА конкурирующих оверлея:
  // нативный `title` браузера и тултип «Нажмите для изменения». Остаток
  // теперь живёт ВНУТРИ содержимого тултипа — единственная поверхность на
  // наведение, несущая оба факта; нативный `title` на кнопке больше не
  // задаётся.
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className={pillClass}
            style={style}
            onClick={() => onActivate?.(tag)}
          />
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>{tooltipBody(hint)}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Общая оболочка «поповер у пилюли» (Task 7 → факторизовано в Task 8, когда
 * появились ещё два поповера — пауза и домены — и копировать композицию в
 * третий раз стало неоправданно). Стекует тултип «Нажмите для изменения» и
 * сам поповер на ОДНОМ DOM-узле триггера: `TooltipTrigger render={<PopoverTrigger
 * …/>}` — приём, которым уже пользуется `prompt-input.tsx` для
 * `DropdownMenuTrigger render={<PromptInputButton/>}`. Открытость поповера
 * остаётся у КАЖДОГО конкретного поповера (`useState` снаружи), а не внутри
 * оболочки — иначе `TemplateTagPopover` не смог бы закрывать поповер из своих
 * колбэков выбора/создания (`onSelect`/`onCreate`), а превью специально не
 * закрывает. Задержку тултипа в 1с отдельно не задаём — она приходит от
 * единственного `TooltipProvider delay={1000}`, которым `WorkflowDescription`
 * оборачивает всё описание целиком (спека §2.4/AC17 — тултип обязателен у
 * ЛЮБОГО интерактивного тега, поповерные — не исключение).
 *
 * `hint` (полное значение усечённой пилюли) идёт в СОДЕРЖИМОЕ тултипа, а не в
 * нативный `title` триггера: на этом узле уже висит тултип, и второй,
 * браузерный, оверлей поверх него — ровно тот дефект, который Item 4 закрыл в
 * соседней ветке рендера.
 *
 * `tooltipContent` (fix round, V-Task 2, Important) переопределяет содержимое
 * тултипа для тех целей, кому дефолтная подпись «Нажмите для изменения» стала
 * неправдой (шаг визарда — клик теперь раскрывает поповер-подтверждение, а не
 * сразу редактор): `null` снимает тултип ЦЕЛИКОМ (триггер рендерится без
 * Tooltip-обёртки — заменить подпись нечем и незачем), любой другой ReactNode
 * замещает `tooltipBody(hint)` содержимым вызывающего (например, только
 * остатком свёрнутого перечисления, без строки-подтверждения). Не передан
 * (`undefined`, три существующих поповера — шаблон/пауза/домены) —
 * поведение прежнее: `tooltipBody(hint)`.
 *
 * `side` (финальный фикс-раунд) — сторона раскрытия. По умолчанию `"bottom"`,
 * как у самого `PopoverContent`; тег-настройка просит `"top"` (спека 2 §2 —
 * «поповер НАД тегом»): настройки шага идут плотным списком строк, и
 * раскрытый вниз поповер закрывал бы соседние строки того же списка.
 * Автопереворот base-ui при этом никуда не девается — когда сверху не
 * помещается, поповер по-прежнему уходит вниз сам.
 */
function TagPopoverShell({
  open,
  onOpenChange,
  className,
  style,
  hint,
  children,
  contentClassName,
  content,
  tooltipContent,
  side,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
  contentClassName: string;
  content: ReactNode;
  tooltipContent?: ReactNode | null;
  side?: "top" | "bottom";
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltipContent === null ? (
        <PopoverTrigger className={className} style={style}>
          {children}
        </PopoverTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger render={<PopoverTrigger className={className} style={style} />}>
            {children}
          </TooltipTrigger>
          <TooltipContent>{tooltipContent ?? tooltipBody(hint)}</TooltipContent>
        </Tooltip>
      )}
      <PopoverContent align="start" side={side} className={contentClassName}>
        {content}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Поповер тега-настройки шага визарда (Task 2). Клик по тегу раньше сразу
 * звал `onActivate` — необратимо уводил с карточки на промах-клик (например,
 * при попытке навести и прочитать тултип). Поповер добавляет подтверждающий
 * шаг: подпись «Настройка · <шаг>» + кнопка «Изменить» — и ТОЛЬКО она зовёт
 * `onActivate(tag)` и закрывает поповер. Собран через `TagPopoverShell`, как и
 * три соседних поповера (шаблон/пауза/домены) — четвёртой композиции
 * тултип+поповер не заводим.
 *
 * Название шага — из `STEP_LABELS` (`campaign-stepper.tsx`), парного
 * `STEP_ICON`, который файл уже импортирует оттуда же (единственный источник
 * подписей шагов визарда — вторую карту не заводим).
 *
 * `tooltipContent` (fix round, V-Task 2, Important): подпись «Нажмите для
 * изменения» тут стала неправдой — клик больше не ведёт сразу к правке, а
 * раскрывает вот этот самый поповер-подтверждение. Но `tag.hoverList`
 * (остаток свёрнутого перечисления — «ещё N триггерам» → «Вторичка, Аренда»)
 * кроме тултипа читать НЕГДЕ, поэтому снимаем не тултип целиком, а только
 * строку-подтверждение: с `hoverList` тултип остаётся и несёт ТОЛЬКО остаток;
 * без него (обычный шаговый тег) тултипа нет вовсе — его роль полностью взял
 * поповер.
 */
function WizardStepTagPopover({
  tag,
  step,
  onActivate,
  className,
  style,
  hint,
  children,
}: {
  tag: DescriptionTag;
  step: WizardStepId;
  onActivate?: (tag: DescriptionTag) => void;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tooltipContent =
    tag.hoverList && tag.hoverList.length > 0 ? tag.hoverList.join(", ") : null;

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      tooltipContent={tooltipContent}
      // Спека 2 §2 — поповер НАД тегом: настройки шага стоят плотным списком,
      // и раскрытый вниз поповер перекрывал бы соседние строки настроек.
      side="top"
      contentClassName="w-64 p-2.5"
      content={
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">
            Настройка · {STEP_LABELS[step]}
          </span>
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={() => {
              onActivate?.(tag);
              setOpen(false);
            }}
          >
            Изменить
          </Button>
        </div>
      }
    >
      {children}
    </TagPopoverShell>
  );
}

/**
 * Поповер базы кампании у тега «База» (Task 12). В отличие от соседних
 * шаговых тегов («Режим», «Интересы» — `WizardStepTagPopover` выше), этот НЕ
 * уводит на шаг визарда: список загруженных файлов правится ЦЕЛИКОМ внутри
 * поповера (добавить/удалить) — тот же принцип «поповер и есть редактор»,
 * что уже несут поповеры шаблона/паузы/условия (Task 7/8/3). `onActivate`
 * поэтому не зовётся вовсе — пропа для него нет.
 *
 * Кампанию/файлы читает сама из `useAppState()` по текущему `view` (карточка
 * открыта → `view.kind === "campaign"`), а не пропом сверху — единственный
 * поповер описания, которому нужен весь список файлов кампании целиком, а не
 * кусок, резолвнутый вызывающим (как `waitParams`/`conditionParams`/`domains`
 * у соседних поповеров, где резолвер живёт в `CampaignScreen`).
 *
 * Удаление — `campaign_file_removed` по ИНДЕКСУ (тот же ключ, что и в
 * редьюсере — имена файлов не гарантированно уникальны, см. его комментарий в
 * `app-state.ts`). Кнопка «Удалить файл: …» рендерится, только когда файлов
 * больше одного: единственную/последнюю базу снять нельзя — кампании нужен
 * хотя бы один файл.
 *
 * Добавление — через скрытый `<input type="file">`: кнопка «+ Добавить файл»
 * лишь открывает системный пикер (`inputRef.current?.click()`), `onChange`
 * дописывает `CampaignFile` через `campaign_file_added`. Это прототип (см.
 * PRODUCT.md — «AI работает по regex, кейсы ошибок описаны минимально»):
 * реального парсинга содержимого файла нет, `rowCount` — детерминированная
 * заглушка от длины имени файла, а не разбор строк.
 */
function BaseFilesTagPopover({
  className,
  style,
  hint,
  children,
}: {
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const state = useAppState();
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement>(null);

  const campaignId = state.view.kind === "campaign" ? state.view.campaign.id : undefined;
  const campaign = campaignId ? state.campaigns.find((c) => c.id === campaignId) : undefined;
  const files = campaign?.files ?? [];

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      // Та же сторона, что и у общего WizardStepTagPopover выше — тег «База»
      // стоит в том же плотном списке строк настроек, раскрытый вниз поповер
      // перекрывал бы соседние строки.
      side="top"
      contentClassName="w-72 p-2.5"
      content={
        <div className="flex flex-col gap-2">
          <span className="text-xs text-muted-foreground">База кампании</span>
          <div className="flex flex-col gap-1">
            {files.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-xs text-foreground">{file.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    ~{file.rowCount.toLocaleString("ru-RU")} строк
                  </span>
                </div>
                {files.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Удалить файл: ${file.name}`}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      if (!campaignId) return;
                      dispatch({ type: "campaign_file_removed", campaignId, index });
                    }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => inputRef.current?.click()}
          >
            + Добавить файл
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.txt"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f && campaignId) {
                // Прототип: реального парсинга файла нет — rowCount
                // детерминированно выводится из длины имени, а не из
                // содержимого.
                dispatch({
                  type: "campaign_file_added",
                  campaignId,
                  file: { name: f.name, rowCount: 1000 + ((f.name.length * 137) % 99000) },
                });
              }
              e.target.value = "";
            }}
          />
        </div>
      }
    >
      {children}
    </TagPopoverShell>
  );
}

/**
 * Поповер выбора шаблона у тега названия (Task 7). Список — тот же
 * `NodeTemplateList`, что карточка узла графа использует внутри
 * `NodeTemplateSelect`: одна и та же «сходимость» списка, что и раньше была у
 * значения (правка 9).
 *
 * Выбор шаблона пишет в тот же params-ключ, что резолвит имя шаблона в тексте
 * описания (`templateParamKeyForKind` — единый источник с `graph-description.ts`,
 * никакой третьей копии карты). Дальше всё как и с любой другой правкой поля
 * ноды: `workflow_node_field_set` уходит в mailbox-слот AppState, который
 * headless-апплаер карточки (`useCampaignGraphApplier`, уже смонтирован в
 * `CampaignScreen`) применяет к durable-кэшу графа и бампает его версию —
 * `useCachedGraphVersion` в `CampaignScreen` перерисовывает описание.
 *
 * Превью НЕ закрывает поповер (глазик в списке); «Создать новый шаблон»
 * закрывает — оба поведения зеркалят `NodeTemplateSelect`.
 */
function TemplateTagPopover({
  nodeId,
  nodeType,
  selectedName,
  className,
  style,
  hint,
  children,
}: {
  nodeId: string;
  nodeType: WorkflowNodeType;
  selectedName: string;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { templates } = useAppState();
  const dispatch = useAppDispatch();
  const { openTemplatePreview, openTemplateCreate, openSidebar } = useChat();

  const channel = channelForNodeKind(nodeType);
  const paramKey = templateParamKeyForKind(nodeType);
  const options = templateOptionsForKind(templates, nodeType);

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      contentClassName="w-72 p-0"
      content={
        <NodeTemplateList
          templates={options}
          selectedName={selectedName}
          onSelect={(t) => {
            if (!paramKey) return;
            const next = (t.content as Record<string, unknown>)[paramKey];
            dispatch({
              type: "workflow_node_field_set",
              nodeId,
              patch: {
                [paramKey]: typeof next === "string" ? next : t.name,
              } as Partial<NodeParams>,
            });
            setOpen(false);
          }}
          onPreview={(templateId) => openTemplatePreview(templateId)}
          onCreate={() => {
            // Item 4 (финальная полировка): без openSidebar() вопрос намерения
            // утекал в НЕОТКРЫТЫЙ нижний промпт-бар — тот же приём, что уже
            // работает у сплиттера графа (handleSplitAiField в
            // node-card-content.tsx), открываем боковую панель ИИ ПЕРЕД
            // хендоффом канала.
            if (channel) {
              openSidebar();
              openTemplateCreate(channel);
            }
            setOpen(false);
          }}
        />
      }
    >
      {children}
    </TagPopoverShell>
  );
}

/**
 * Поповер паузы у тега длительности (Task 8). Содержимое — РОВНО тот же
 * `WaitFields`, что нодо-блок графа несёт внутри себя: компонент
 * самодостаточен (сам диспатчит `workflow_node_field_set`, сам несёт режим +
 * длительность/событие), поэтому оболочке достаточно передать ему `nodeId` +
 * `params` — никакой собственной логики правки здесь нет. Тот же
 * headless-апплаер (`useCampaignGraphApplier`) и та же цепочка
 * версия-кэша→редрей описания, что и у поповера шаблона выше — правка не
 * заводит второй путь применения.
 *
 * `onEventAiHandoff` НЕ передаётся вовсе (round 1, Finding 2): на карточке нет
 * сайдбара ИИ-редактирования поля (это функция канвасной ноды), а
 * `onEventAiHandoff` у `WaitFields`/`NodeFieldCombobox` опционален ровно
 * затем, чтобы отсутствие колбэка само было сигналом «передать некуда» —
 * пункт «Сформировать с помощью ИИ» в комбобоксе «Событие» тогда не
 * рендерится вовсе, а не рендерится кнопкой, которая молча ничего не делает
 * по клику (заглушка `() => {}` — ровно такая кнопка — была первой версией
 * этого поповера и найденным багом). Поповер не закрывается сам — правки
 * полей внутри WaitFields не одноразовый выбор (как шаблон), а серия
 * независимых полей, каждое со своим собственным поповером-подменю.
 */
function WaitFieldsTagPopover({
  nodeId,
  params,
  className,
  style,
  hint,
  children,
}: {
  nodeId: string;
  params: WaitParams;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      contentClassName="w-72 p-2.5"
      content={
        <div className="flex flex-col gap-0.5">
          <WaitFields nodeId={nodeId} params={params} readOnly={false} />
        </div>
      }
    >
      {children}
    </TagPopoverShell>
  );
}

/**
 * Поповер условия у тега значения развилки (Task 3). Содержимое — тот же
 * `NodeFieldCombobox` над полем «Событие», что нодо-блок графа несёт для
 * condition (`NODE_FIELD_EDITABILITY.condition`: `optionsKey: "eventCatalog"`,
 * `paramKey: "trigger"`) — единый контрол поля, не собственная форма. Выбор
 * диспатчит `workflow_node_field_set` напрямую (компонент самодостаточен, как
 * и поповер паузы выше) — та же цепочка headless-апплаер→версия кэша→редрей
 * описания, что и у поповеров шаблона/паузы, второго пути применения нет.
 *
 * `onAiHandoff` НЕ передаётся вовсе — тот же принцип, что и `onEventAiHandoff`
 * у поповера паузы (round 1, Finding 2): на карточке кампании нет сайдбара
 * ИИ-редактирования поля (это функция канвасной ноды), поэтому отсутствие
 * колбэка само сигналит `NodeFieldCombobox` «передать некуда» — пункт
 * «Сформировать с помощью ИИ» тогда не рендерится вовсе, а не рендерится
 * кнопкой, которая молча ничего не делает по клику.
 *
 * Деление на потоки (`split`) СВОЕГО поповера не получает — и не получит:
 * `NODE_FIELD_EDITABILITY.split` помечает поля сплиттера `editability: "ai"`,
 * правит их только ИИ-дровер, которого на карточке нет (см. комментарий в
 * `graph-description.ts` у `forkBody`) — заводить здесь второй компонент
 * поповера было бы нечем наполнить.
 *
 * `value={conditionTriggerLabel(params.trigger)}` (V-Task 3 review, Important
 * — было найдено на канвасе, а не тут: `trigger` во всех живых шаблонах хранит
 * легаси-код события («opened», «clicked», …), не готовую фразу. Тот же
 * комбобокс на канвасе (`node-card-content.tsx`) уже переводит значение перед
 * показом — без перевода здесь поповер оказался бы единственным местом
 * продукта, где сквозь русский интерфейс проступает английский технический
 * код (нарушает и «магия скрыта», и «кириллица first-class» из PRODUCT.md).
 * `conditionTriggerLabel` — общая с `node-sublabel.ts`/`node-card-content.tsx`
 * функция (третьей копии не заведено, вторая, бывшая в `node-card-content.tsx`,
 * удалена в этом же раунде). Перевод — только для ОТОБРАЖЕНИЯ: `onSelect`
 * пишет выбранное значение как есть (`next`) — справочник `eventCatalog` и так
 * выдаёт готовую русскую фразу («Письмо открыто»), переводить нечего.
 */
function ConditionTagPopover({
  nodeId,
  params,
  className,
  style,
  hint,
  children,
}: {
  nodeId: string;
  params: ConditionParams;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dispatch = useAppDispatch();

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      contentClassName="w-72 p-2.5"
      content={
        <NodeFieldCombobox
          label="Событие"
          value={conditionTriggerLabel(params.trigger)}
          optionsKey="eventCatalog"
          isDirty={false}
          onSelect={(next) =>
            dispatch({
              type: "workflow_node_field_set",
              nodeId,
              patch: { trigger: next } as Partial<NodeParams>,
            })
          }
        />
      }
    >
      {children}
    </TagPopoverShell>
  );
}

/**
 * Поповер доменов (Task 8) — чисто информационный, правок не производит.
 * Перечисляет ВСЕ домены триггеров кампании (не только «на проверке» —
 * одобренные и отклонённые сегодня больше нигде не видны) с их статусом
 * модерации через `DomainStatusBadge` из реестра настроек
 * (`src/sections/settings/domains-block.tsx`) — тот же компонент, что и там,
 * чтобы формулировка статуса не могла разойтись между реестром и карточкой.
 */
function DomainsTagPopover({
  domains,
  className,
  style,
  hint,
  children,
}: {
  domains: { domain: string; status: DomainStatus }[];
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
      contentClassName="w-72 p-2"
      content={
        <div className="flex flex-col gap-1.5">
          {domains.map((d) => (
            <div
              key={d.domain}
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2.5 py-1.5"
            >
              <span className="truncate font-mono text-xs text-foreground">
                {d.domain}
              </span>
              <DomainStatusBadge status={d.status} />
            </div>
          ))}
        </div>
      }
    >
      {children}
    </TagPopoverShell>
  );
}
