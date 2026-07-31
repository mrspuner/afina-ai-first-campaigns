"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Globe, type LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DescriptionTag } from "@/state/graph-description";
import type { NodeParams, WaitParams, WorkflowNodeType } from "@/types/workflow";
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
import { DomainStatusBadge } from "@/sections/settings/domains-block";

/**
 * Общая геометрия пилюли. `items-baseline`+`align-baseline` — пилюля сидит НА
 * строке текста, а не плавает над/под ней и не раздувает line-height абзаца
 * (спека Task 5: «этот деталь легче всего сломать»).
 */
const PILL_BASE =
  "inline-flex items-baseline gap-1 rounded-md border px-1.5 py-0 align-baseline text-[0.95em] font-semibold";

/**
 * Тег читается как отдельный элемент, а не как часть карточки: серая
 * подложка макета (`--scenario-tag-bg`, Task 1) с белой обводкой — не светлая
 * заливка Task 6. Радиус/паддинг переопределены под макет (7px) — `cn` в
 * `pillClass` ниже мёржит их через `twMerge`, поэтому `rounded-md`/`px-1.5` из
 * `PILL_BASE` не остаются в финальном классе. Демоция в `none` (кампания
 * запущена / шага нет в визарде) остаётся ЭТИМ ЖЕ классом — она снимает
 * интерактив, а не цвет: серая read-only-пилюля прятала бы значение ровно
 * там, где его только и можно прочитать.
 */
const NEUTRAL_CLASS =
  "rounded-[7px] border border-white bg-scenario-tag-bg px-[7px] text-white";

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
 * `none` (кампания запущена, либо граф больше не правится) остаётся
 * нейтральным по фону/бордеру — цвет узла означал бы «кликабельно», а это
 * больше не так (спека §2.12). Но иконку демоция снимать не должна: без неё
 * «12 000 строк» и «разовый» становятся одинаковыми серыми табличками, и
 * прочитать, какой тег о чём, нельзя (fix round 2, Finding 2). Иконку
 * резолвим по личности, которую демоция сохранила на `none` — `step`
 * (шаговый тег → `STEP_ICON`) либо `nodeType`, пришедший пропом по `nodeId`,
 * который тоже пережил демоцию (шаблон/пауза → `NODE_ICON`).
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
    case "none":
      return {
        className: NEUTRAL_CLASS,
        Icon: target.step ? STEP_ICON[target.step] : nodeType ? NODE_ICON[nodeType] : undefined,
      };
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
  /** Все домены триггеров кампании со статусами — содержимое поповера цели
   *  `domains` (Task 8). Приходит от `WorkflowDescription` (тот же проп, что
   *  описание уже несёт как `facts.domains`), не читается пилюлей из module
   *  state. Без пропа (или пустого списка) — деградация к обычной
   *  кнопке-тултипу, как и `node-fields` без резолвнутых params. */
  domains?: { domain: string; status: DomainStatus }[];
  /**
   * Пилюля живёт в ячейке таблицы, а не в строке прозы: имя не переносится, а
   * усекается многоточием по ширине ячейки. Без этого русские названия
   * шаблонов («Персональный оффер», «Push — возвращение») разворачивали пилюлю
   * в двухрядный блок, и она читалась как кнопка, а не как чип строки. Флагом,
   * а не постоянным поведением: в прозе пилюля обязана переноситься вместе с
   * текстом. Полное имя усечённой пилюли уезжает в подсказку (`hint` ниже) —
   * иначе прочитать его было бы негде.
   */
  truncateLabel?: boolean;
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
  domains,
  truncateLabel,
}: DescriptionTagPillProps) {
  const { className, style, Icon } = resolveVisual(tag, nodeType);
  // Обычно подсказка — остаток схлопнутого перечисления (`hoverList`). У
  // усекаемой пилюли она обязана нести ПОЛНОЕ значение: имя, обрезанное
  // многоточием, иначе нечем прочитать целиком.
  const hint = tag.hoverList?.join(", ") ?? (truncateLabel ? tag.label : undefined);
  // `max-w-full` держит пилюлю внутри своей ячейки, `min-w-0` разрешает
  // подписи сжаться (флекс-элемент по умолчанию не уже своего содержимого —
  // без этого `truncate` не сработал бы вовсе).
  const pillClass = cn(PILL_BASE, className, truncateLabel && "max-w-full");

  const content = (
    <>
      {Icon && <Icon className="h-3 w-3 shrink-0 self-center" aria-hidden />}
      <span className={truncateLabel ? "min-w-0 truncate" : undefined}>{tag.label}</span>
    </>
  );

  if (tag.target.kind === "none") {
    return (
      <span className={pillClass} style={style} title={hint}>
        {content}
      </span>
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  style?: CSSProperties;
  hint?: string;
  children: ReactNode;
  contentClassName: string;
  content: ReactNode;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger render={<PopoverTrigger className={className} style={style} />}>
          {children}
        </TooltipTrigger>
        <TooltipContent>{tooltipBody(hint)}</TooltipContent>
      </Tooltip>
      <PopoverContent align="start" className={contentClassName}>
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

  return (
    <TagPopoverShell
      open={open}
      onOpenChange={setOpen}
      className={className}
      style={style}
      hint={hint}
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
