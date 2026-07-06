/**
 * #7 — различение намерения по тегу узла.
 *
 * Когда при выборе ноды её тег «улетает» в промпт-бар, ввод раньше ВСЕГДА
 * трактовался как запрос на изменение и перерисовывал граф — даже если
 * пользователь просто спрашивал о работе ноды. Теперь вопрос ПО ноде отвечается
 * информационно (граф не трогаем), а запрос на изменение идёт прежним путём.
 *
 * Прототип-эвристика (AI по regex, см. PRODUCT.md): явный глагол-изменение →
 * это правка; иначе вопросительный маркер в начале или «?» в конце → это вопрос.
 * Приоритет у изменения: «можешь добавить ветку?» — правка, не вопрос.
 */
const CHANGE_INTENT =
  /(измен|поменя|добав|удали|убер|замен|сделай|постав|увелич|уменьш|переимену|настро|зада(й|йте)|впиши|обнови|перепиши|сократ|усиль|расшир|дополни)/;

// NB: `\b` is ASCII-only and does not fire after Cyrillic — use an explicit
// "followed by space / punctuation / end" lookahead instead.
const QUESTION_LEAD =
  /^(как|что|чем|почему|зачем|когда|какой|какая|какое|какие|каких|где|кто|сколько|можно ли|стоит ли|нужно ли|работает ли|расскажи|объясни|поясни|покажи|для чего)(?=\s|$|[?!,.:;])/;

/** True when a node-tagged prompt reads as a question about the node rather
 *  than a request to change it. */
export function isNodeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (CHANGE_INTENT.test(t)) return false;
  return QUESTION_LEAD.test(t) || t.endsWith("?");
}

/** Informational reply for a node question — acknowledges without redrawing the
 *  graph and invites an explicit change request. */
export function nodeQuestionReply(label: string): string {
  return `По ноде «${label}»: это справочный вопрос — граф оставляю как есть. Если нужно что-то в ней изменить, напишите, что именно поправить.`;
}
