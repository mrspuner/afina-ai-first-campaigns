"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { usePromptInputController } from "@/components/ai-elements/prompt-input";
import {
  usePromptChips,
  type ChipSegment,
  type PromptChip,
} from "@/state/prompt-chips-context";
import { cn } from "@/lib/utils";
import { getNodeIconSvg } from "@/sections/campaigns/node-visuals";

interface ChipEditableInputProps {
  placeholder?: string;
  className?: string;
  /**
   * Вызывается, когда в инпут добавляется НОВЫЙ тег при уже существующем —
   * M5: предыдущий тег нужно запарковать в очередь. Срабатывает в эффекте
   * sync chips→DOM до фактической вставки нового чипа.
   */
  onTagSwap?: () => void;
  /**
   * Глобальный перехват ввода: если пользователь печатает, не находясь ни в
   * одном поле, символ уходит в этот бар (в конец). Включаем только для
   * видимого нижнего бара — не для drawer, чтобы не было двойной вставки.
   */
  captureGlobalTyping?: boolean;
}

export interface ChipEditableInputHandle {
  focus(): void;
  /**
   * Walks the editor in DOM order and returns one segment per chip. Each
   * segment carries the chip metadata plus the free text *after* that chip
   * (until the next chip or end of editor). Leading text before the first
   * chip is dropped — there is no target it could belong to.
   */
  getSegments(): ChipSegment[];
  /**
   * Возвращает единственный активный сегмент (тег + текст после него), либо
   * null если в инпуте нет тега. M5: инпут держит один активный тег.
   */
  getActiveSegment(): ChipSegment | null;
  /** Removes all chips and text from the editor. Used after successful submit. */
  clear(): void;
}

/**
 * Contenteditable input where chips are inline elements inserted at the
 * caret position, sharing the textual flow with user typing. Chips wrap
 * with text words; each chip's "command text" is whatever the user types
 * between it and the next chip.
 *
 * Chips are managed imperatively via DOM (not React-rendered), because:
 * - `<img>`/React reconciliation inside contenteditable produces visual
 *   artefacts on Backspace.
 * - Position-at-cursor insertion is impossible if React owns the children
 *   list (it would always re-render chips into a fixed React-defined order).
 *
 * The chip *state* (id, kind, label, payload) still lives in React context
 * — DOM is just a derived view, kept in sync by the diff effect below.
 */
export const ChipEditableInput = forwardRef<
  ChipEditableInputHandle,
  ChipEditableInputProps
>(function ChipEditableInput(
  { placeholder, className, onTagSwap, captureGlobalTyping },
  ref
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const { chips, removeChip } = usePromptChips();
  const controller = usePromptInputController();
  const value = controller.textInput.value;
  const setInput = controller.textInput.setInput;

  // Last in-editor caret range — saved continuously so we can insert chips
  // at the cursor even when the click that pushed the chip moved focus to a
  // button outside the editor (e.g. step-2's "Настроить").
  const lastRangeRef = useRef<Range | null>(null);

  const readText = useCallback((): string => {
    const ed = editorRef.current;
    if (!ed) return "";
    let out = "";
    ed.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
      else if (node instanceof HTMLElement) {
        if (node.dataset.chipId) return; // chip — not text
        if (node.tagName === "BR") out += "\n";
        else out += node.textContent ?? "";
      }
    });
    return out;
  }, []);

  const onInput = useCallback(() => {
    setInput(readText());
  }, [readText, setInput]);

  // Imperative text inserter registered with the prompt-input controller
  // (see registration effect below) so external callers — NodeCardBody param
  // rows in particular — can drop a template into the editor without
  // holding our ref. Inserts at the saved caret position when one exists,
  // otherwise appends to the end. Smart separator adds a single space when
  // needed so new content doesn't visually fuse with surrounding text/chips.
  const insertTextImperative = useCallback(
    (text: string, options?: { separator?: "smart" | "none" }) => {
      const ed = editorRef.current;
      if (!ed) return;
      const separator = options?.separator ?? "smart";

      const prependSpace = (range: Range): boolean => {
        if (separator === "none") return false;
        const node = range.startContainer;
        const offset = range.startOffset;
        if (node.nodeType === Node.TEXT_NODE) {
          const t = (node.textContent ?? "").slice(0, offset);
          if (t.length === 0) return false;
          return !t.endsWith(" ");
        }
        const prev = node.childNodes[offset - 1];
        if (!prev) return false;
        if (prev instanceof HTMLElement && prev.dataset.chipId) return true;
        if (prev.nodeType === Node.TEXT_NODE) {
          const t = prev.textContent ?? "";
          return t.length > 0 && !t.endsWith(" ");
        }
        return false;
      };

      const sel = window.getSelection();
      let range: Range | null = null;
      if (sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else if (
        lastRangeRef.current &&
        ed.contains(lastRangeRef.current.startContainer)
      ) {
        range = lastRangeRef.current;
      }

      if (range) {
        range.deleteContents();
        const prefix = prependSpace(range) ? " " : "";
        const node = document.createTextNode(prefix + text);
        range.insertNode(node);
        const next = document.createRange();
        next.setStartAfter(node);
        next.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(next);
        lastRangeRef.current = next.cloneRange();
      } else {
        const last = ed.lastChild;
        let needsPad = false;
        if (last) {
          if (last instanceof HTMLElement && last.dataset.chipId) {
            needsPad = true;
          } else if (last.nodeType === Node.TEXT_NODE) {
            const t = last.textContent ?? "";
            needsPad = t.length > 0 && !t.endsWith(" ");
          }
        }
        const prefix = separator === "smart" && needsPad ? " " : "";
        const inserted = document.createTextNode(prefix + text);
        ed.appendChild(inserted);
        // Park the caret at the very end of the inserted text — without this
        // the editor refocuses to its default position (beginning) so the
        // user types in front of the template instead of after it.
        const next = document.createRange();
        next.setStart(inserted, inserted.length);
        next.collapse(true);
        const selAfter = window.getSelection();
        selAfter?.removeAllRanges();
        selAfter?.addRange(next);
        lastRangeRef.current = next.cloneRange();
      }

      setInput(readText());
      ed.focus();
    },
    [readText, setInput]
  );

  // Register the imperative inserter with the prompt-input controller so
  // `controller.textInput.insertAtCursor()` calls actually reach this
  // contenteditable surface (the textarea path can't write to it).
  // No unregister on cleanup. The inserter ref is shared and overwritten by
  // whichever editor mounts last (collapsed bar ↔ drawer). Nulling it on
  // unmount caused a race: after closing the drawer, the bottom bar remounts
  // and registers, then the drawer's delayed unmount nulled the ref — so the
  // first suggestion click fell through to the dead textarea path (invisible)
  // and only the value-change-triggered re-register made the second click
  // work. A stale inserter from an unmounted editor is harmless: its editorRef
  // is null, so insertTextImperative early-returns.
  useEffect(() => {
    controller.textInput.__registerEditorInserter(insertTextImperative);
  }, [controller.textInput, insertTextImperative]);

  // Save the last in-editor range so chip insertion can target the user's
  // typing position even after focus moved to a button.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (ed.contains(range.startContainer)) {
        lastRangeRef.current = range.cloneRange();
      }
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  // Sync chips state → DOM. Diffs by id; new chips inserted at saved caret;
  // missing chips removed. Re-rendered (label updates) chips have their
  // text content swapped in place to avoid clobbering surrounding text.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const stateById = new Map(chips.map((c) => [c.id, c] as const));

    // Remove DOM chips not in state.
    ed.querySelectorAll<HTMLElement>("[data-chip-id]").forEach((el) => {
      const id = el.dataset.chipId!;
      if (!stateById.has(id)) {
        // Remove the chip AND the text segment it owns — everything after it up
        // to the next chip (or end). createChipElement/insertChipAtRange append
        // a trailing space after every chip, and the user's command text lives
        // in this same segment; leaving them orphans the space (it accumulates
        // across tag swaps — bug) and keeps stale text in the bar after the tag
        // is parked (M5: switching tags must leave a clean slate).
        let sibling = el.nextSibling;
        while (
          sibling &&
          !(sibling instanceof HTMLElement && sibling.dataset.chipId)
        ) {
          const next = sibling.nextSibling;
          sibling.remove();
          sibling = next;
        }
        el.remove();
      } else {
        // Update label if it changed. Trailing text node carries the label;
        // we mutate it in place so the leading <span aria-hidden> icon
        // (if any) survives the update. createChipElement always appends
        // the text as the last child via document.createTextNode().
        const target = stateById.get(id)!;
        const last = el.lastChild;
        if (
          last &&
          last.nodeType === Node.TEXT_NODE &&
          last.textContent !== target.label
        ) {
          last.textContent = target.label;
        } else if (!last || last.nodeType !== Node.TEXT_NODE) {
          // No text node (shouldn't happen, but fail-safe): append one.
          el.appendChild(document.createTextNode(target.label));
        }
      }
    });

    // Add state chips not in DOM, in array order. Each gets inserted at
    // the saved caret (or appended if no caret).
    let insertedChip = false;
    for (const chip of chips) {
      const selector = `[data-chip-id="${cssEscape(chip.id)}"]`;
      if (ed.querySelector(selector)) continue;
      // M5: a NEW chip arriving while a chip already exists means the user
      // is switching tags — the composer parks the previous tag's draft.
      const hadChip = ed.querySelector("[data-chip-id]") !== null;
      if (hadChip) onTagSwap?.();
      const el = createChipElement(chip, removeChip);
      insertChipAtRange(el, ed, lastRangeRef.current);
      insertedChip = true;
      // Refresh the saved range so subsequent chip pushes append after the
      // chip we just inserted (not at the same anchor each time).
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && ed.contains(sel.anchorNode)) {
        lastRangeRef.current = sel.getRangeAt(0).cloneRange();
      }
    }

    // После вставки нового тега держим фокус в поле — курсор уже стоит после
    // чипа (insertChipAtRange), пользователю остаётся только печатать.
    if (insertedChip) ed.focus();

    // Re-flush text into controller so external readers see the latest.
    setInput(readText());
  }, [chips, readText, setInput, onTagSwap, removeChip]);

  // External setInput("") (form-submit clear) should also clear DOM text and
  // chips. Other external value changes (rare now) sync into the editor end.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (value === "" && readText() !== "") {
      // Clear text nodes only; chip removal is driven through chips state.
      const toRemove: ChildNode[] = [];
      ed.childNodes.forEach((node) => {
        if (
          node.nodeType === Node.TEXT_NODE ||
          (node instanceof HTMLElement && !node.dataset.chipId)
        ) {
          toRemove.push(node);
        }
      });
      toRemove.forEach((n) => n.remove());
    }
  }, [value, readText]);

  // Hydrate the editor from the shared controller value ONCE on mount. The
  // collapsed prompt-bar and the expanded drawer are never mounted together —
  // switching between them destroys one ChipEditableInput and mounts another.
  // Chips survive (shared chips state), but free text lived only in the
  // controller value and was never re-rendered into the fresh editor's DOM, so
  // it appeared lost. This restores it after the chips (caret-position relative
  // to chips isn't stored — the model is "one tag + text after it"). Trimmed to
  // avoid the chip's trailing space accumulating across repeated toggles.
  // Subsequent edits flow through onInput, not back through here (run-once ref).
  const didHydrateRef = useRef(false);
  useEffect(() => {
    if (didHydrateRef.current) return;
    didHydrateRef.current = true;
    const ed = editorRef.current;
    if (!ed) return;
    const text = value.trim();
    if (text.length === 0) return;
    if (readText().trim().length > 0) return; // editor already has text
    insertTextImperative(text, { separator: "smart" });
  }, [value, readText, insertTextImperative]);

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        const ed = editorRef.current;
        if (!ed) return;
        ed.focus();
        placeCaretAtEnd(ed);
      },
      getSegments() {
        const ed = editorRef.current;
        if (!ed) return [];
        const stateById = new Map(chips.map((c) => [c.id, c] as const));
        const segments: ChipSegment[] = [];
        let currentChip: PromptChip | null = null;
        let buffer = "";
        const flush = () => {
          if (currentChip) {
            segments.push({ chip: currentChip, text: buffer.trim() });
          }
          buffer = "";
        };
        ed.childNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.dataset.chipId &&
            stateById.has(node.dataset.chipId)
          ) {
            flush();
            currentChip = stateById.get(node.dataset.chipId)!;
          } else if (node.nodeType === Node.TEXT_NODE) {
            buffer += node.textContent ?? "";
          } else if (node instanceof HTMLElement && node.tagName === "BR") {
            buffer += "\n";
          }
        });
        flush();
        return segments;
      },
      getActiveSegment() {
        const ed = editorRef.current;
        if (!ed) return null;
        const stateById = new Map(chips.map((c) => [c.id, c] as const));
        let currentChip: PromptChip | null = null;
        let buffer = "";
        ed.childNodes.forEach((node) => {
          if (
            node instanceof HTMLElement &&
            node.dataset.chipId &&
            stateById.has(node.dataset.chipId)
          ) {
            currentChip = stateById.get(node.dataset.chipId)!;
          } else if (node.nodeType === Node.TEXT_NODE) {
            buffer += node.textContent ?? "";
          } else if (node instanceof HTMLElement && node.tagName === "BR") {
            buffer += "\n";
          }
        });
        return currentChip ? { chip: currentChip, text: buffer.trim() } : null;
      },
      clear() {
        const ed = editorRef.current;
        if (!ed) return;
        // Wipe everything — chips and text. Caller is expected to also
        // dispatch clearChips() so React state mirrors the DOM.
        while (ed.firstChild) ed.removeChild(ed.firstChild);
        lastRangeRef.current = null;
      },
    }),
    [chips]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        const form = (e.currentTarget as HTMLElement).closest("form");
        if (form) {
          const submitBtn = form.querySelector<HTMLButtonElement>(
            'button[type="submit"]'
          );
          if (submitBtn?.disabled) return;
          e.preventDefault();
          form.requestSubmit();
        }
      }
      // Backspace: rely on browser default. Native behaviour treats a chip
      // (contentEditable=false span) as an atomic deletable block when the
      // caret is right after it — matching Gmail recipient pills. The chip
      // gets removed from DOM; our MutationObserver / next input event
      // catches the removal and updates chip state.
    },
    []
  );

  // Watch for chip elements vanishing from the DOM (Backspace, Cut, etc.)
  // and mirror that into chip state.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const obs = new MutationObserver(() => {
      const presentIds = new Set(
        Array.from(ed.querySelectorAll<HTMLElement>("[data-chip-id]")).map(
          (el) => el.dataset.chipId!
        )
      );
      // Identify state chips that are no longer in DOM and remove them.
      const dropped: string[] = [];
      for (const c of chips) {
        if (!presentIds.has(c.id)) dropped.push(c.id);
      }
      if (dropped.length > 0) {
        // Defer to a microtask to avoid mutating state during a mutation
        // observer callback (some bundlers flag this).
        queueMicrotask(() => {
          for (const id of dropped) removeChip(id);
        });
      }
    });
    obs.observe(ed, { childList: true, subtree: false });
    return () => obs.disconnect();
  }, [chips, removeChip]);

  // Глобальный перехват ввода: печать вне любого поля уходит в конец этого
  // бара. smart-разделитель ставит пробел перед вводом, если последний элемент
  // — тег (или текст без хвостового пробела). Пробел как первый символ не
  // перехватываем — чтобы сохранить скролл страницы пробелом и не плодить
  // ведущий пробел. Перехват включается только для видимого нижнего бара.
  useEffect(() => {
    if (!captureGlobalTyping) return;
    // DOM-тип события: импортированный из React `KeyboardEvent` здесь затеняет
    // глобальный, поэтому ссылаемся на него через globalThis.
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1 || e.key === " ") return; // только печатные символы
      const active = document.activeElement;
      if (active && isEditableElement(active)) return; // уже печатаем в поле
      const ed = editorRef.current;
      if (!ed || ed.offsetParent === null) return; // бар должен быть видим
      e.preventDefault();
      ed.focus();
      placeCaretAtEnd(ed);
      insertTextImperative(e.key, { separator: "smart" });
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [captureGlobalTyping, insertTextImperative]);

  const onPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    document.execCommand("insertText", false, text);
  }, []);

  const isEmpty = chips.length === 0 && value.length === 0;

  return (
    <div
      ref={editorRef}
      role="textbox"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={onInput}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      className={cn(
        "min-h-[52px] max-h-[120px] w-full overflow-y-auto bg-transparent text-sm text-[#fafafa] outline-none",
        "leading-7 whitespace-pre-wrap break-words",
        "[&[data-empty='true']]:before:content-[attr(data-placeholder)]",
        "[&[data-empty='true']]:before:text-muted-foreground",
        "[&[data-empty='true']]:before:pointer-events-none",
        className
      )}
      data-empty={isEmpty || undefined}
    />
  );
});

export function createChipElement(
  chip: PromptChip,
  onRemoveChip?: (id: string) => void
): HTMLElement {
  const el = document.createElement("span");
  el.contentEditable = "false";
  el.setAttribute("data-chip-id", chip.id);
  el.setAttribute("data-chip-kind", chip.kind);
  el.className =
    "chip-hover mx-0.5 inline-flex select-none items-center gap-1 rounded-md border px-2 py-0.5 align-baseline text-xs font-medium transition-all duration-150";

  // Окраска по цвету узла (NodeTagPayload). Прочие чипы — нейтральный стиль.
  const payload = chip.payload as
    | { color?: string; nodeType?: string }
    | null;
  const color =
    payload && typeof payload.color === "string" ? payload.color : null;
  if (color) {
    el.style.borderColor = `${color}66`;
    el.style.backgroundColor = `${color}1f`;
    el.style.color = color;
  } else {
    el.classList.add("border-white/15", "bg-white/10", "text-white");
  }

  // Иконка узла (или узла-родителя для тега параметра). Цвет тега уже
  // указывает на узел; иконка усиливает это сходство. Lucide SVG имеет
  // stroke="currentColor" — цвет наследуется от родительского color.
  const nodeType =
    payload && typeof payload.nodeType === "string" ? payload.nodeType : null;
  if (nodeType) {
    const iconSvg = getNodeIconSvg(nodeType);
    if (iconSvg) {
      const iconWrap = document.createElement("span");
      iconWrap.setAttribute("aria-hidden", "true");
      iconWrap.className = "inline-flex shrink-0 items-center";
      iconWrap.innerHTML = iconSvg;
      el.appendChild(iconWrap);
    }
  }

  el.appendChild(document.createTextNode(chip.label));

  // #2 — видимый крестик у removable-тегов. Чип — императивный DOM-узел вне
  // React, поэтому обработчик вешаем прямо здесь. mousedown.preventDefault не
  // даёт крестику украсть каретку/фокус у редактора.
  if (chip.removable && onRemoveChip) {
    const x = document.createElement("button");
    x.type = "button";
    x.setAttribute("aria-label", `Убрать тег: ${chip.label}`);
    x.className =
      "chip-remove ml-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center " +
      "justify-center rounded-full text-current/70 transition-colors " +
      "hover:bg-black/20 hover:text-current";
    x.textContent = "×";
    x.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemoveChip(chip.id);
    });
    el.appendChild(x);
  }

  return el;
}

function insertChipAtRange(
  el: HTMLElement,
  editor: HTMLElement,
  saved: Range | null
) {
  // Prefer the live selection if it's still inside the editor; otherwise
  // fall back to the last range we recorded while focus was here. Append
  // to the end as a last resort.
  const sel = window.getSelection();
  let range: Range | null = null;
  if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
    range = sel.getRangeAt(0);
  } else if (saved && editor.contains(saved.startContainer)) {
    range = saved;
  }

  if (range) {
    range.deleteContents();
    range.insertNode(el);
    // Add a trailing space so the user's next keystroke doesn't visually
    // glue onto the chip.
    const space = document.createTextNode(" ");
    el.after(space);
    const next = document.createRange();
    next.setStartAfter(space);
    next.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(next);
  } else {
    // No caret reference at all — append, then park the caret after the
    // trailing space so focus lands right after the freshly-added tag.
    const space = document.createTextNode(" ");
    editor.appendChild(el);
    editor.appendChild(space);
    const next = document.createRange();
    next.setStartAfter(space);
    next.collapse(true);
    const sel2 = window.getSelection();
    sel2?.removeAllRanges();
    sel2?.addRange(next);
  }
}

/** true, если фокус сейчас в редактируемом элементе (input/textarea/select/
 *  contenteditable) — тогда глобальный перехват ввода не нужен. */
function isEditableElement(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

function placeCaretAtEnd(el: HTMLElement) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/(["\\])/g, "\\$1");
}
