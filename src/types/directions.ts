export type DirectionId = string;
export type VerticalId = string;
export type InterestId = string;
export type TriggerId = string;

export interface Trigger {
  id: TriggerId;
  label: string;
  /**
   * Короткое имя триггера — попадает в тег-пилюлю описания карточки кампании,
   * где полный `label` («Посещение сайтов банков…») не помещается и режется
   * многоточием. Полный `label` при этом остаётся подсказкой на наведении.
   */
  shortLabel: string;
}

export interface Interest {
  id: InterestId;
  label: string;
  verticalId: VerticalId;
  triggers: Trigger[];
}

export interface Vertical {
  id: VerticalId;
  label: string;
  interests: Interest[];
}

export interface Direction {
  id: DirectionId;
  label: string;
}
