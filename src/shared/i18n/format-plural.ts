import type { Locale } from './config';

/**
 * Формы для счётных слов: «1 день / 2 дня / 5 дней», «1 day / 2 days».
 * Набор форм — как у `Intl.PluralRules` для ru (one / few / many / other);
 * в EN few и many повторяют other.
 */
export type PluralForms = {
    one: string;
    few: string;
    many: string;
    other: string;
};

const pluralRulesByLocale = new Map<Locale, Intl.PluralRules>();

function getPluralRules(locale: Locale): Intl.PluralRules {
    let rules = pluralRulesByLocale.get(locale);

    if (!rules) {
        rules = new Intl.PluralRules(locale);
        pluralRulesByLocale.set(locale, rules);
    }

    return rules;
}

/** Подставляет `{n}` в форму, выбранную правилами языка. */
export function formatPlural(
    locale: Locale,
    count: number,
    forms: PluralForms,
): string {
    const rule = getPluralRules(locale).select(count);
    const template =
        rule === 'one' || rule === 'few' || rule === 'many'
            ? forms[rule]
            : forms.other;

    return template.replace('{n}', String(count));
}
