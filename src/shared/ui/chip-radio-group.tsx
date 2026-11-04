/**
 * Выбор одного варианта чипами в одно касание (П2): сложность, число вопросов.
 *
 * Под капотом — обычные `<input type="radio" name=…>`: значение уходит в
 * форму как раньше из `<select>`, а стрелки клавиатуры и скринридер работают
 * по-родному. Радио скрыто визуально (`sr-only`), чип — подпись к нему.
 * Неактивный вариант — `disabled` у радио: стрелки его пропускают, скринридер
 * объявляет недоступным, чип серый с пунктиром.
 */
'use client';

type ChipOption<Value extends string> = {
    value: Value;
    label: string;
    /** Виден, но не выбирается (тема без вопросов на этой сложности). */
    disabled?: boolean;
};

type ChipRadioGroupProps<Value extends string> = {
    name: string;
    legend: string;
    options: ReadonlyArray<ChipOption<Value>>;
    value: Value;
    onChange: (value: Value) => void;
    /** id подсказки под группой (например, состав Смешанной). */
    describedBy?: string;
};

export function ChipRadioGroup<Value extends string>({
    name,
    legend,
    options,
    value,
    onChange,
    describedBy,
}: ChipRadioGroupProps<Value>) {
    return (
        <fieldset aria-describedby={describedBy}>
            <legend className="text-sm font-medium text-foreground">
                {legend}
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
                {options.map((option) => (
                    <label key={option.value} className="relative">
                        <input
                            type="radio"
                            name={name}
                            value={option.value}
                            checked={option.value === value}
                            disabled={option.disabled}
                            onChange={() => onChange(option.value)}
                            className="peer sr-only"
                        />
                        <span className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-surface px-4 text-sm text-foreground transition peer-checked:border-primary peer-checked:bg-primary peer-checked:font-medium peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring hover:bg-surface-hover peer-checked:hover:bg-primary-hover peer-disabled:cursor-not-allowed peer-disabled:border-dashed peer-disabled:text-muted peer-disabled:opacity-70 peer-disabled:hover:bg-surface">
                            {option.label}
                        </span>
                    </label>
                ))}
            </div>
        </fieldset>
    );
}
