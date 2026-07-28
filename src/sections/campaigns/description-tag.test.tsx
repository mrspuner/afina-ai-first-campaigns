import { beforeAll, describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { DescriptionTagPill } from "./description-tag";
import type { DescriptionTag } from "@/state/graph-description";
import { AppStateProvider } from "@/state/app-state-context";
import { ChatProvider } from "@/state/chat-context";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { WaitParams, WorkflowNodeType } from "@/types/workflow";
import type { DomainStatus } from "@/types/account-settings";

afterEach(cleanup);

// next/image → plain <img>, как в node-template-select.test.tsx — cmdk-пункт
// «Создать новый шаблон» несёт маскот-иконку через next/image, jsdom не тянет
// её оптимизацию.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...(props as Record<string, string>)} />;
  },
}));

// cmdk (Command primitives внутри NodeTemplateList) требует ResizeObserver +
// scrollIntoView — jsdom не несёт ни то, ни другое (тот же шим, что в
// node-template-select.test.tsx).
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (Element.prototype as any).scrollIntoView ??= () => {};
});

/** Дефолтные WaitParams для поповера паузы (target.kind === "node-fields") —
 *  ровно то, что лукап nodeId→params в `CampaignScreen` резолвил бы для
 *  дефолтной wait-ноды повтора (Апсейл: 2 дня). */
const DEFAULT_WAIT_PARAMS: WaitParams = {
  kind: "wait",
  mode: "duration",
  durationHours: 48,
};

/**
 * Поповер шаблона (target.kind === "template") тянет `app-state.templates`
 * (useAppState) и `openTemplatePreview`/`openTemplateCreate` (useChat) —
 * оборачиваем в те же провайдеры, что `use-campaign-graph-applier.test.tsx`
 * использует для headless-хуков. nodeType по умолчанию "sms" — ровно то, что
 * `nodeTypes`-лукап в `CampaignScreen` передал бы для sms-ноды графа.
 * waitParams по умолчанию — `DEFAULT_WAIT_PARAMS` (Task 8): тем же образом
 * дефолтит тесты поповера паузы, не заставляя каждый тест-кейс выписывать
 * фикстуру заново.
 *
 * `TooltipProvider delay={1000}` — та же обёртка, что `WorkflowDescription`
 * реально ставит вокруг всего описания (fix round 1): без неё тест ничего не
 * говорит про задержку в 1с, на которой настаивает спека §2.4/AC17.
 */
function renderPillWithProviders({
  tag,
  nodeType = "sms",
  waitParams = DEFAULT_WAIT_PARAMS,
  domains,
}: {
  tag: DescriptionTag;
  nodeType?: WorkflowNodeType;
  waitParams?: WaitParams;
  domains?: { domain: string; status: DomainStatus }[];
}) {
  return render(
    <AppStateProvider>
      <ChatProvider>
        <TooltipProvider delay={1000}>
          <DescriptionTagPill
            tag={tag}
            nodeType={nodeType}
            waitParams={waitParams}
            domains={domains}
          />
        </TooltipProvider>
      </ChatProvider>
    </AppStateProvider>,
  );
}

const stepTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "wizard-step", step: "file" },
};

const valueTag: DescriptionTag = {
  id: "start-base",
  label: "база на 12 000 строк",
  target: { kind: "none" },
};

describe("DescriptionTagPill", () => {
  it("тег с целью — кнопка, клик поднимает наверх", () => {
    const onActivate = vi.fn();
    render(<DescriptionTagPill tag={stepTag} onActivate={onActivate} />);
    fireEvent.click(screen.getByRole("button", { name: /база на 12 000 строк/ }));
    expect(onActivate).toHaveBeenCalledWith(stepTag);
  });

  it("тег без цели — не кнопка, но значение показывает", () => {
    render(<DescriptionTagPill tag={valueTag} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/база на 12 000 строк/)).toBeInTheDocument();
  });

  // Item 4 (финальное ревью): раньше `title={hoverList.join(", ")}` сидел на
  // ТОМ ЖЕ узле, что base-ui's Tooltip оборачивает — наведение на «ещё N
  // триггерам» показывало ДВА конкурирующих оверлея (нативный title ОС и
  // тултип «Нажмите для изменения»). Остаток теперь живёт ВНУТРИ содержимого
  // тултипа — единственная поверхность на наведение, несущая оба факта.
  it("схлопка перечисления показывает остаток и «Нажмите для изменения» ОДНИМ тултипом, без конкурирующего native title", () => {
    vi.useFakeTimers();
    try {
      renderPillWithProviders({
        tag: { ...stepTag, label: "ещё 2 триггерам", hoverList: ["Вторичка", "Аренда"] },
      });
      const trigger = screen.getByRole("button", { name: /ещё 2 триггерам/ });
      expect(trigger).not.toHaveAttribute("title");

      fireEvent.mouseEnter(trigger);
      fireEvent.mouseMove(trigger);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText("Вторичка, Аренда")).toBeInTheDocument();
      expect(screen.getByText("Нажмите для изменения")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("тег шаблона раскрывает список шаблонов канала прямо у пилюли", async () => {
    renderPillWithProviders({
      tag: { id: "msg-n1-template", label: "Приветствие", target: { kind: "template", nodeId: "n1" } },
    });
    fireEvent.click(screen.getByRole("button", { name: /Приветствие/ }));
    expect(await screen.findByText("Создать новый шаблон")).toBeInTheDocument();
  });
});

describe("DescriptionTagPill — тултип у поповерного тега шаблона (fix round 1: спека §2.4/AC17)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // §2.4: «Тултип с задержкой 1 секунда… Неинтерактивный тег (после запуска)
  // тултипа не несёт.» Только `none` — исключение; поповерный `template` этот
  // тултип обязан нести наравне с обычными кликабельными тегами (AC17).
  // Проверяем именно ЗАДЕРЖКУ (не просто наличие текста рано или поздно) —
  // 999мс тултипа ещё нет, 1000мс — уже есть. Задержка приходит от
  // `TooltipProvider delay={1000}`, которым renderPillWithProviders
  // оборачивает пилюлю (та же обёртка, что реально ставит WorkflowDescription)
  // — не от отдельного таймера здесь.
  it("наведение на интерактивный тег шаблона показывает тултип «Нажмите для изменения» через 1с", () => {
    vi.useFakeTimers();
    renderPillWithProviders({
      tag: { id: "msg-n1-template", label: "Приветствие", target: { kind: "template", nodeId: "n1" } },
    });
    const trigger = screen.getByRole("button", { name: /Приветствие/ });

    // base-ui's Tooltip.Trigger opens on a REST delay, not on `mouseenter`
    // itself — it needs a `mousemove` over the trigger to arm the rest timer
    // (mirrors real cursor movement onto the element), then waits `restMs`
    // (here: the provider's `delay`) with no further movement.
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    expect(screen.queryByText("Нажмите для изменения")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.queryByText("Нажмите для изменения")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("Нажмите для изменения")).toBeInTheDocument();
  });

  it("клик по тегу шаблона всё ещё раскрывает поповер со списком шаблонов — тултип не мешает клику", async () => {
    renderPillWithProviders({
      tag: { id: "msg-n1-template", label: "Приветствие", target: { kind: "template", nodeId: "n1" } },
    });
    fireEvent.click(screen.getByRole("button", { name: /Приветствие/ }));
    expect(await screen.findByText("Создать новый шаблон")).toBeInTheDocument();
  });

  it("none-таргет тега шаблона остаётся без тултипа и без поповера — демоция не регрессирует", () => {
    render(
      <DescriptionTagPill
        tag={{ id: "msg-n1-template", label: "SMS — напоминание", target: { kind: "none", nodeId: "n1" } }}
        nodeType="sms"
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.mouseEnter(screen.getByText("SMS — напоминание"));
    expect(screen.queryByText("Нажмите для изменения")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("SMS — напоминание"));
    expect(screen.queryByText("Создать новый шаблон")).not.toBeInTheDocument();
  });
});

describe("DescriptionTagPill — иконка после демоции не пропадает (fix round 2, Finding 2)", () => {
  it("демотированный шаговый тег (none + step) остаётся с STEP_ICON, но не кнопка", () => {
    const tag: DescriptionTag = {
      id: "start-base",
      label: "12 000 строк",
      target: { kind: "none", step: "file" },
    };
    render(<DescriptionTagPill tag={tag} />);
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("12 000 строк").parentElement!;
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("демотированный шаблон/пауза (none + nodeId, nodeType пропом) остаётся с NODE_ICON, но не кнопка", () => {
    const tag: DescriptionTag = {
      id: "msg-n1-template",
      label: "SMS — напоминание",
      target: { kind: "none", nodeId: "n1" },
    };
    render(<DescriptionTagPill tag={tag} nodeType="sms" />);
    expect(screen.queryByRole("button")).toBeNull();
    const pill = screen.getByText("SMS — напоминание").parentElement!;
    expect(pill.querySelector("svg")).not.toBeNull();
  });

  it("демотированный тег без step/nodeType остаётся без иконки — нечего резолвить", () => {
    // Личность демоции определяется ТЕМ, что перенёс сам таргет (step/nodeId);
    // без неё (напр. домены или гипотетический none без личности) иконки не
    // было и раньше — не выдумываем её из ничего.
    const tag: DescriptionTag = {
      id: "x",
      label: "значение без личности",
      target: { kind: "none" },
    };
    render(<DescriptionTagPill tag={tag} />);
    const pill = screen.getByText("значение без личности").parentElement!;
    expect(pill.querySelector("svg")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Task 8 — поповер паузы (target.kind === "node-fields"): содержимое — тот же
// WaitFields, что нодо-блок графа несёт внутри себя. Пилюля сама params не
// читает — waitParams приходит пропом (см. renderPillWithProviders выше),
// резолвнутым тем же лукапом, что nodeType для шаблона.
// ---------------------------------------------------------------------------
describe("DescriptionTagPill — поповер паузы у тега длительности (Task 8)", () => {
  const waitTag: DescriptionTag = {
    id: "retry-wait",
    label: "2 дня",
    target: { kind: "node-fields", nodeId: "n_wait" },
  };

  it("тег паузы раскрывает поля режима и длительности", async () => {
    renderPillWithProviders({ tag: waitTag });
    fireEvent.click(screen.getByRole("button", { name: /2 дня/ }));
    expect(await screen.findByText("Режим")).toBeInTheDocument();
  });

  it("тег паузы несёт тот же тултип «Нажмите для изменения», что и шаблон (спека §2.4/AC17)", () => {
    vi.useFakeTimers();
    renderPillWithProviders({ tag: waitTag });
    const trigger = screen.getByRole("button", { name: /2 дня/ });
    fireEvent.mouseEnter(trigger);
    fireEvent.mouseMove(trigger);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Нажмите для изменения")).toBeInTheDocument();
    vi.useRealTimers();
  });

  // Резолвер (WorkflowDescription/CampaignScreen) передаёт waitParams
  // undefined, когда нода не нашлась ИЛИ её params.kind !== "wait" — пилюля
  // обязана деградировать к обычной кнопке БЕЗ поповера, а не открывать
  // пустой (брифовское требование Step 3). Рендерим БЕЗ хелпера
  // (renderPillWithProviders дефолтит waitParams — «не передали» и «явный
  // undefined» неразличимы в деструктуризации, а хелпер существует именно
  // чтобы не выписывать фикстуру заново), да и провайдеры (app-state/chat)
  // этой ветке не нужны — поповер здесь не рендерится вовсе.
  it("без резолвнутых waitParams (нода не найдена или это не wait-нода) — кнопка без поповера", () => {
    render(<DescriptionTagPill tag={waitTag} nodeType="wait" />);
    fireEvent.click(screen.getByRole("button", { name: /2 дня/ }));
    expect(screen.queryByText("Режим")).not.toBeInTheDocument();
  });

  // fix round 1, Finding 2: карточка не несёт сайдбара ИИ-редактирования поля
  // (это функция канвасной ноды) — раньше поповер передавал WaitFields
  // заглушку `onEventAiHandoff={() => {}}`, и «Сформировать с помощью ИИ» в
  // комбобоксе «Событие» рендерилась кнопкой, которая по клику молча ничего
  // не делала. Теперь колбэк не передаётся вовсе — пункт не рендерится.
  it("режим «До события»: комбобокс события в поповере паузы НЕ несёт «Сформировать с помощью ИИ»", async () => {
    renderPillWithProviders({
      tag: waitTag,
      waitParams: { kind: "wait", mode: "until_event", untilEvent: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /2 дня/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Изменить поле «Событие»" }),
    );
    expect(screen.queryByText("Сформировать с помощью ИИ")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Task 8 — поповер доменов (target.kind === "domains"): чисто информационный,
// перечисляет ВСЕ домены триггеров (не только «на проверке») со статусом
// модерации из `DomainStatusBadge` реестра настроек.
// ---------------------------------------------------------------------------
describe("DescriptionTagPill — поповер доменов (Task 8)", () => {
  const domainsTag: DescriptionTag = {
    id: "start-domains",
    label: "new.example.ru",
    target: { kind: "domains" },
  };

  it("тег доменов показывает все домены со статусами, включая одобренные и отклонённые", async () => {
    renderPillWithProviders({
      tag: { id: "start-domains", label: "new.example.ru", target: { kind: "domains" } },
      domains: [
        { domain: "new.example.ru", status: "pending" },
        { domain: "ok.example.ru", status: "approved" },
        { domain: "no.example.ru", status: "rejected" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /new\.example\.ru/ }));
    expect(await screen.findByText("ok.example.ru")).toBeInTheDocument();
    expect(screen.getByText("no.example.ru")).toBeInTheDocument();
  });

  it("статус доменов читается из реестра «Собственные домены» — те же формулировки, что и в настройках", async () => {
    renderPillWithProviders({
      tag: domainsTag,
      domains: [
        { domain: "new.example.ru", status: "pending" },
        { domain: "ok.example.ru", status: "approved" },
        { domain: "no.example.ru", status: "rejected" },
      ],
    });
    fireEvent.click(screen.getByRole("button", { name: /new\.example\.ru/ }));
    expect(await screen.findByText("На проверке")).toBeInTheDocument();
    expect(screen.getByText("Одобрен")).toBeInTheDocument();
    expect(screen.getByText("Отклонён")).toBeInTheDocument();
  });

  it("остаётся кликабельным поповером — редактирования в нём нет, но клик открывает список (спека §2.12)", async () => {
    renderPillWithProviders({
      tag: domainsTag,
      domains: [{ domain: "new.example.ru", status: "pending" }],
    });
    const pill = screen.getByRole("button", { name: /new\.example\.ru/ });
    fireEvent.click(pill);
    expect(await screen.findByText("На проверке")).toBeInTheDocument();
    // Никаких контролов правки внутри — только домен + бейдж статуса.
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  // Без списка доменов (проп не пришёл или пуст) — деградация к обычной
  // кнопке без поповера, как и у node-fields без params.
  it("без домена (проп не пришёл) — кнопка без поповера", () => {
    renderPillWithProviders({ tag: domainsTag, domains: undefined });
    fireEvent.click(screen.getByRole("button", { name: /new\.example\.ru/ }));
    expect(screen.queryByText("На проверке")).not.toBeInTheDocument();
  });
});
