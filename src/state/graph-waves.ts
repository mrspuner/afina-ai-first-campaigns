import {
  isCommunicationNode,
  type NodeParams,
  type WorkflowEdge,
  type WorkflowNode,
} from "@/types/workflow";

/**
 * Обход workflow-графа волнами коммуникаций.
 *
 * Чистая функция от графа: ни сети, ни состояния, ни времени — тот же граф
 * всегда даёт ту же структуру. Текста этот модуль не производит вовсе: он
 * отвечает на вопрос «что и в каком порядке отправляется», а как это назвать
 * по-русски — забота слоя описания.
 *
 * Волна — набор коммуникаций, уходящих ОДНОВРЕМЕННО. Внутри волны она может
 * делиться на группы (потоки): разные сегменты аудитории получают разные
 * сообщения. Пауза (`wait`) закрывает волну и открывает следующую — так вторая
 * и третья волны (повторы) видны наравне с первой, а не пропадают из обхода.
 */

/** Минимальная форма графа, которой хватает обходу. */
export interface WaveGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Поток внутри волны: своя ветка развилки со своими коммуникациями. */
export interface WaveGroup {
  id: string;
  /** Метка ребра развилки («Выс», «Ср») — у волны без развилки её нет. */
  label?: string;
  nodes: WorkflowNode[];
}

export interface Wave {
  id: string;
  groups: WaveGroup[];
  /** Нода condition/split, породившая группы. */
  forkNode?: WorkflowNode;
  forkKind?: "condition" | "split";
  /** Пауза, отделяющая волну от предыдущей. */
  waitBefore?: WorkflowNode;
  /**
   * Содержимое волны совпало с предыдущей — независимо от того, есть ли между
   * ними пауза. Слабее `repeatsPrevious` и нужен отдельно: волна с тем же
   * содержанием, но без паузы, «Паузой и повтором» не становится, а вот
   * называть её серию ДРУГОЙ описание всё равно не вправе.
   */
  sameContentAsPrevious: boolean;
  /** Содержимое совпало И волны разделены паузой — это повтор, а не касание. */
  repeatsPrevious: boolean;
}

export type WaveStep =
  | { kind: "wave"; wave: Wave }
  | { kind: "check"; node: WorkflowNode };

export interface GraphWaves {
  ordered: WorkflowNode[];
  steps: WaveStep[];
}

/** Ребро развилки: куда ведёт и как подписано. */
interface Branch {
  target: string;
  label?: string;
}

/** Черновик группы — id ей присваивается только при выпуске волны. */
interface DraftGroup {
  label?: string;
  nodes: WorkflowNode[];
}

/** Разделители ключей сравнения — заведомо не встречаются в текстах сообщений. */
const NODE_SEP = "\u0000";
const GROUP_SEP = "\u0001";

/**
 * Разбирает граф на волны коммуникаций и промежуточные проверки.
 *
 * Развилкой (`forkKind`) считается только та `condition`/`split`, у которой
 * РАЗНЫЕ ветки несут собственные коммуникации. Условие «взаимодействовал?»
 * (обе ветки ведут в успех и в паузу) — не развилка, а проверка: `check`.
 * Сплиттер каналов (`by:"equal"`) тоже не развилка — это фан-аут ОДНОГО
 * касания по нескольким каналам, и его ноды складываются в общую волну.
 */
export function segmentWaves(graph: WaveGraph): GraphWaves {
  const adjacency = new Map<string, Branch[]>();
  for (const edge of graph.edges) {
    const branch: Branch = {
      target: edge.target,
      // label у ребра — ReactNode: метка сегмента полезна, только пока строка.
      ...(typeof edge.label === "string" ? { label: edge.label } : {}),
    };
    const list = adjacency.get(edge.source);
    if (list) list.push(branch);
    else adjacency.set(edge.source, [branch]);
  }
  const targets = new Map<string, string[]>(
    [...adjacency].map(([source, branches]) => [source, branches.map((b) => b.target)]),
  );

  const ordered = orderNodes(graph, targets);
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const steps: WaveStep[] = [];
  /** Ноды, уже отданные какой-то волне: второй раз в обход не попадают. */
  const used = new Set<string>();
  let bucket: WorkflowNode[] = [];
  let pendingWait: WorkflowNode | undefined;
  let previousKey: string | undefined;
  let waveCount = 0;

  /** Коммуникации ветки: `wait` и `condition` её закрывают, `split` — нет. */
  const commsInBranch = (startId: string): WorkflowNode[] => {
    const seen = new Set<string>();
    const queue = [startId];
    const comms: WorkflowNode[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      const node = byId.get(id);
      if (!node) continue;
      const type = node.data.nodeType;
      // За паузой/условием начинается уже следующая волна — не эта ветка.
      if (type === "wait" || type === "condition") continue;
      if (isCommunicationNode(type) && !used.has(id)) comms.push(node);
      queue.push(...(targets.get(id) ?? []));
    }
    return comms;
  };

  /**
   * Группы развилки — или `undefined`, если ветка с коммуникациями всего одна
   * (тогда делить аудиторию не на что: это проверка, а не развилка).
   */
  const branchGroups = (fork: WorkflowNode): DraftGroup[] | undefined => {
    const groups: DraftGroup[] = [];
    for (const branch of adjacency.get(fork.id) ?? []) {
      const nodes = commsInBranch(branch.target);
      if (!nodes.length) continue;
      groups.push({ ...(branch.label !== undefined ? { label: branch.label } : {}), nodes });
    }
    if (groups.length < 2) return undefined;
    for (const group of groups) for (const node of group.nodes) used.add(node.id);
    return groups;
  };

  const emitWave = (draft: DraftGroup[], fork?: { node: WorkflowNode; kind: "condition" | "split" }) => {
    // Дедуп ДО схлопывания групп (п. 6) и до ключа волны (п. 7) — иначе три
    // параллельных сегмента с одинаковыми каналами дали бы группу с шестью
    // нодами, а сравнение с предыдущей волной сорвалось бы на кратности.
    const collapsed = collapseGroups(
      draft.map((group) => ({ ...group, nodes: dedupeNodes(group.nodes) })),
    );
    // Пауза расходуется ПОПЫТКОЙ выпустить волну, а не её успехом: волна без
    // коммуникаций не выпускается, но и утечь в следующую волну её пауза не
    // должна. Пока `pendingWait` присваивался безусловно (`= node`), устаревшее
    // значение затиралось само; с `??=` (первая пауза волны, а не последняя)
    // такой страховки больше нет, поэтому инвариант закрыт явно.
    const waitBefore = pendingWait;
    pendingWait = undefined;
    if (!collapsed.length) return;
    const id = `wave-${++waveCount}`;
    const groups: WaveGroup[] = collapsed.map((group, i) => ({
      id: `${id}-g${i + 1}`,
      ...(group.label !== undefined ? { label: group.label } : {}),
      nodes: group.nodes,
    }));
    const key = groups
      .map((group) => groupKey(group.nodes))
      .sort()
      .join(GROUP_SEP);
    const sameContent = key === previousKey;
    steps.push({
      kind: "wave",
      wave: {
        id,
        groups,
        ...(fork ? { forkNode: fork.node, forkKind: fork.kind } : {}),
        ...(waitBefore ? { waitBefore } : {}),
        sameContentAsPrevious: sameContent,
        // Спека §2 п.5: повтор — волна с ключом предыдущей, «которую от неё
        // отделяет `wait`». Разделяющая пауза входит в определение, а не
        // прилагается к нему: без неё две одинаковые волны, разделённые лишь
        // проверкой, становились бы «Паузой и повтором» при отсутствующей
        // паузе. Совпал ключ, но паузы нет — это новое касание; повторённость
        // содержания при этом не теряется — её несёт `sameContentAsPrevious`.
        repeatsPrevious: sameContent && waitBefore !== undefined,
      },
    });
    previousKey = key;
  };

  /** Копившиеся подряд коммуникации — это одна волна без развилки. */
  const flushBucket = () => {
    if (!bucket.length) return;
    const nodes = bucket;
    bucket = [];
    emitWave([{ nodes }]);
  };

  for (const node of ordered) {
    const type = node.data.nodeType;

    if (isCommunicationNode(type)) {
      if (used.has(node.id)) continue;
      used.add(node.id);
      bucket.push(node);
      continue;
    }

    if (type === "wait") {
      flushBucket();
      // ПЕРВАЯ пауза перед волной, а не последняя. У сегментного сценария волну
      // открывают несколько параллельных пауз (по одной на сегмент), и выбор
      // между ними не косметический: слой описания вешает на эту ноду пилюлю
      // длительности, а правка через её поповер переписывает params ИМЕННО
      // её. Прежний обход (`retryWaits[0]` в graph-description.ts) брал первую
      // по BFS — сохраняем адрес правки, чтобы он не переехал молча.
      // `flushBucket` выше уже сбросил `pendingWait`, если выпустил волну,
      // поэтому «первая» считается заново для каждой волны.
      pendingWait ??= node;
      continue;
    }

    if (type === "condition") {
      flushBucket();
      const groups = branchGroups(node);
      if (groups) emitWave(groups, { node, kind: "condition" });
      else steps.push({ kind: "check", node });
      continue;
    }

    // Сплит по сегменту — единственный вид split, делящий саму аудиторию;
    // фан-аут каналов (equal/random) волну не открывает и не закрывает.
    if (type === "split" && node.data.params?.kind === "split" && node.data.params.by === "segment") {
      flushBucket();
      const groups = branchGroups(node);
      if (groups) emitWave(groups, { node, kind: "split" });
    }
  }
  flushBucket();

  return { ordered, steps };
}

/**
 * Ноды в порядке прохода базы: BFS от корней (нод без входящих рёбер) по
 * порядку рёбер. Недостижимые ноды дописываются в исходном порядке — обход не
 * теряет узлы даже на изувеченном вручную графе.
 */
export function orderNodes(graph: WaveGraph, adjacency: Map<string, string[]>): WorkflowNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const hasIncoming = new Set(graph.edges.map((e) => e.target));
  const roots = graph.nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);

  const ordered: WorkflowNode[] = [];
  const seen = new Set<string>();
  const queue = roots.length ? [...roots] : graph.nodes.slice(0, 1).map((n) => n.id);

  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node) ordered.push(node);
    queue.push(...(adjacency.get(id) ?? []));
  }
  for (const node of graph.nodes) if (!seen.has(node.id)) ordered.push(node);
  return ordered;
}

/**
 * Одинаковые потоки — не потоки. Сегментированный сценарий с ОДНИМИ И ТЕМИ ЖЕ
 * каналами во всех сегментах даёт N идентичных групп; читателю они интересны
 * как одно касание, поэтому остаётся одна группа и метка сегмента с неё
 * снимается (она перестала что-либо различать).
 */
function collapseGroups(groups: DraftGroup[]): DraftGroup[] {
  const filled = groups.filter((group) => group.nodes.length > 0);
  if (filled.length < 2) return filled;
  const keys = filled.map((group) => groupKey(group.nodes));
  if (keys.some((key) => key !== keys[0])) return filled;
  return [{ nodes: filled[0].nodes }];
}

/**
 * Одинаковые сообщения внутри группы — одна строка, а не N визуально
 * идентичных: параллельные сегменты несут ОДНО касание, размноженное по
 * сегментам графа. Порядок первого вхождения сохраняется — он и есть порядок
 * каналов в описании.
 */
function dedupeNodes(nodes: WorkflowNode[]): WorkflowNode[] {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    const key = contentKey(node);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Ключ сравнения группы — от состава коммуникаций, а не от их порядка. */
function groupKey(nodes: WorkflowNode[]): string {
  return nodes.map(contentKey).sort().join(NODE_SEP);
}

function contentKey(node: WorkflowNode): string {
  return `${node.data.nodeType}|${commText(node.data.params)}`;
}

/**
 * Текст коммуникации для сравнения волн/групп — НЕ для показа (показывает
 * `communicationContent` в graph-description.ts, и она берёт у письма только
 * тему).
 *
 * Письмо сравнивается по теме И телу, потому что тело — это поле, которое
 * правит пилюля шаблона: `templateParamKeyForKind("email")` = `body`, и
 * поповер выбора шаблона патчит РОВНО его, на одной ноде. Пока ключ читал одну
 * тему, смена шаблона письма в первом касании не меняла ключ вовсе — волны
 * оставались «одинаковыми», и описание утверждало «повторяет ту же серию» над
 * двумя таблицами с разными шаблонами. Тем же ключом дедупится состав волны:
 * по одной теме два разных письма схлопывались в одну строку, и одна
 * коммуникация молча исчезала.
 */
function commText(params: NodeParams | undefined): string {
  switch (params?.kind) {
    case "sms": return params.text;
    case "email": return `${params.subject}\n${params.body}`;
    case "push": return `${params.title}\n${params.body}`;
    case "ivr": return params.scenario;
    default: return "";
  }
}
