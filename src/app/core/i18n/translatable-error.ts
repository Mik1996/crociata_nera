import { InterpolationParameters } from '@ngx-translate/core';

/** Error with a translatable message: the UI shows `i18nKey` in the current language. */
export interface TranslatableError {
  i18nKey: string;
  i18nParams?: InterpolationParameters;
}

export function isTranslatableError(error: unknown): error is TranslatableError {
  return typeof error === 'object' && error !== null && typeof (error as TranslatableError).i18nKey === 'string';
}
