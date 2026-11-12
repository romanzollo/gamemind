/**
 * «Факт выдаёт ответ»: правильный ответ вопроса из той же игры или серии
 * встречается в тексте факта. Факт показывают после ответа на другой
 * вопрос — увидев его, игрок узнает ответ на будущий вопрос.
 *
 * Сравнение по целым словам после нормализации (регистр, ё → е,
 * пунктуация → пробел). Ищем и ответ целиком, и его части: ответ
 * «Один — Эрик Бароне» выдаёт и факт «…сделал один человек, Эрик Бароне».
 * Ответы короче 3 знаков (части — короче 4) не проверяем: «10», «PS», «и»
 * дают ложные срабатывания. Это предупреждение для ревью, не запрет —
 * решает владелец.
 *
 * Название игры подсказкой не считается (`ignoreAnswer`): факт про игру
 * называет её сам, а вопрос «из какой игры кадр / трек» по такому факту не
 * угадать.
 *
 * Canon: docs/DECISIONS.md → Did you know: trivia facts.
 */

/** Минимум знаков ответа после нормализации, чтобы сравнивать. */
const MIN_ANSWER_LENGTH = 3;
/** Минимум для части ответа: короткие части — служебные слова. */
const MIN_PART_LENGTH = 4;
/** Где ответ распадается на части: тире, двоеточие, точка с запятой, скобки. */
const ANSWER_PARTS = /\s+[—–-]\s+|[—–:;,()«»"]/;

export type FactHintQuestion = {
    /** Ключ контента или id — только для отчёта. */
    ref: string;
    textRu: string;
    /** Тексты правильного ответа (RU и EN). */
    answers: readonly string[];
};

export type FactAnswerHint = {
    question: FactHintQuestion;
    /** Правильный ответ целиком. */
    answer: string;
    /** Что именно нашлось в факте: ответ или его часть. */
    match: string;
};

/** Ответ и его части, которые имеет смысл искать в тексте факта. */
function answerNeedles(answer: string): string[] {
    const whole = answer.trim();
    const parts = whole
        .split(ANSWER_PARTS)
        .map((part) => part.trim())
        .filter(
            (part) =>
                part !== whole &&
                normalizeForHint(part).trim().length >= MIN_PART_LENGTH,
        );
    return normalizeForHint(whole).trim().length >= MIN_ANSWER_LENGTH
        ? [whole, ...parts]
        : parts;
}

/** Слова через одиночные пробелы, с пробелом по краям — для поиска целых слов. */
export function normalizeForHint(text: string): string {
    const words = text
        .toLowerCase()
        .replaceAll('ё', 'е')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
    return words === '' ? '' : ` ${words} `;
}

export function findFactAnswerHints(
    fact: { ru: string; en: string },
    questions: readonly FactHintQuestion[],
    options: {
        ignoreAnswer?: (answer: string) => boolean;
        /**
         * false — только ответ целиком. Для вопросов других игр: части
         * ответов («Один», «Синий») там дают больше шума, чем пользы.
         */
        includeParts?: boolean;
    } = {},
): FactAnswerHint[] {
    const haystacks = [normalizeForHint(fact.ru), normalizeForHint(fact.en)];
    const hints: FactAnswerHint[] = [];
    const includeParts = options.includeParts ?? true;

    for (const question of questions) {
        const hint = findAnswerInFact(
            question,
            haystacks,
            options.ignoreAnswer,
            includeParts,
        );
        if (hint) {
            hints.push(hint);
        }
    }

    return hints;
}

function findAnswerInFact(
    question: FactHintQuestion,
    haystacks: readonly string[],
    ignoreAnswer: ((answer: string) => boolean) | undefined,
    includeParts: boolean,
): FactAnswerHint | null {
    for (const answer of question.answers) {
        // Название игры целиком — не подсказка, и его части тоже
        // («Resident Evil 7: Biohazard» → «Biohazard»).
        if (ignoreAnswer?.(answer)) {
            continue;
        }
        const needles = includeParts
            ? answerNeedles(answer)
            : answerNeedles(answer).slice(0, 1);
        for (const needle of needles) {
            if (ignoreAnswer?.(needle)) {
                continue;
            }
            const normalized = normalizeForHint(needle);
            if (haystacks.some((haystack) => haystack.includes(normalized))) {
                return { question, answer, match: needle };
            }
        }
    }
    return null;
}
