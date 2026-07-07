"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";

/**
 * Пустое состояние раздела «Настройки» для первого входа (аккаунт не настроен,
 * спека #11). Вместо авто-запуска опроса — дружелюбная подводка и одна кнопка,
 * запускающая опрос. Асимметрия слева, жёлтый только на кнопке.
 */
export function SettingsEmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-5 px-6 pt-24 pb-promptbar"
      >
        <Image
          src="/mascot-icon.svg"
          alt=""
          width={56}
          height={56}
          aria-hidden
          priority
          className="select-none"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Расскажите о вашей компании
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Опишите бизнес и задачу — афина настроит интересы, сегменты и кампании
            под вас. Займёт пару минут.
          </p>
        </div>
        <Button onClick={onStart} className="mt-1">
          Настроить с афиной
        </Button>
      </motion.div>
    </div>
  );
}
