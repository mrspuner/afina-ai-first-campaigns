/**
 * #7 — гибрид различения намерения по тегу узла.
 *
 * Определение «вопрос vs изменение» отдаётся LLM-оркестратору, КОГДА он доступен.
 * Но прототип часто работает офлайн (PRODUCT.md: «AI по regex»), и тогда решать
 * некому — теговый ввод применяется как правка, даже если это вопрос. Чтобы
 * офлайн вопрос не портил ноду, композер использует этот лёгкий regex-детектор
 * ТОЛЬКО как fallback при недоступном LLM: вопрос → информационный ответ (чат),
 * а не правка. Онлайн этот детектор не участвует — решает LLM.
 *
 * Эвристика: явный глагол-изменение → это правка (не вопрос); иначе ведущее
 * вопросительное слово или «?» в конце → вопрос. Приоритет у изменения.
 */
const CHANGE_INTENT =
  /(измен|поменя|добав|удали|убер|замен|сделай|постав|увелич|уменьш|переимену|настро|зада(й|йте)|впиши|обнови|перепиши|сократ|усиль|расшир|дополни)/;

// NB: `\b` is ASCII-only and does not fire after Cyrillic — use an explicit
// "followed by space / punctuation / end" lookahead instead.
const QUESTION_LEAD =
  /^(как|что|чем|почему|зачем|когда|какой|какая|какое|какие|каких|где|кто|сколько|можно ли|стоит ли|нужно ли|работает ли|расскажи|объясни|поясни|покажи|для чего)(?=\s|$|[?!,.:;])/;

/** True when a node-tagged prompt reads as a question about the node rather
 *  than a request to change it. Used only as an offline fallback (see above). */
export function isNodeQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (CHANGE_INTENT.test(t)) return false;
  return QUESTION_LEAD.test(t) || t.endsWith("?");
}
