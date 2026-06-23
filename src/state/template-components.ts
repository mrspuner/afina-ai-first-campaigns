import type { NodeParams } from "@/types/workflow";

/**
 * Состав компонентов шаблона по каналу — человекочитаемые русские лейблы
 * полей (#15). Опциональные поля включаются только при наличии в content.
 */
export function templateComponentLabels(content: NodeParams): string[] {
  switch (content.kind) {
    case "sms": {
      const out = ["текст", "отправитель"];
      if (content.link) out.push("ссылка");
      return out;
    }
    case "email": {
      const out = ["тема", "текст", "отправитель"];
      if (content.link) out.push("ссылка");
      return out;
    }
    case "push": {
      const out = ["заголовок", "текст"];
      if (content.deeplink) out.push("диплинк");
      return out;
    }
    case "ivr":
      return ["сценарий", "голос"];
    default:
      return [];
  }
}
