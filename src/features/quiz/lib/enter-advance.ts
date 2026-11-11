/**
 * Enter после ответа = «Дальше» / «К результату» (Classic и Daily на
 * компьютере). Блиц и Выживание идут дальше сами.
 *
 * Чистая проверка «наше ли это нажатие»: обработчик в QuizSessionForm
 * вызывает ту же функцию, что и кнопка, — горячий путь не меняется.
 */

export type EnterAdvanceKey = {
    key: string;
    repeat: boolean;
    isComposing: boolean;
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
};

/** Где Enter уже что-то значит сам: поле ввода, кнопка, ссылка, ползунок. */
export type EnterAdvanceTarget = {
    tagName: string;
    type?: string;
    isContentEditable?: boolean;
};

const OWN_ENTER_TAGS = new Set(['TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY']);
/** Радиокнопки вариантов — не «свои»: ответ уже зафиксирован, Enter свободен. */
const OWN_ENTER_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'url', 'number', 'range']);

export function isEnterAdvance(
    event: EnterAdvanceKey,
    target: EnterAdvanceTarget | null,
): boolean {
    if (event.key !== 'Enter') return false;
    // Удержание не листает несколько вопросов; IME (ввод иероглифов) — не наш Enter.
    if (event.repeat || event.isComposing) return false;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false;
    if (!target) return true;
    if (target.isContentEditable) return false;
    if (OWN_ENTER_TAGS.has(target.tagName)) return false;
    if (target.tagName === 'INPUT' && OWN_ENTER_INPUT_TYPES.has(target.type ?? 'text')) {
        return false;
    }
    return true;
}
