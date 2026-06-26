import { enDictionary } from './en';
import { ruDictionary } from './ru';
import type { Dictionary } from './types';
import type { Locale } from '../config';

const dictionaries: Record<Locale, Dictionary> = {
    ru: ruDictionary,
    en: enDictionary,
};

export function getDictionary(locale: Locale) {
    return dictionaries[locale];
}

export type { Dictionary };
