'use client';

/**
 * Смена аватара в настройках профиля.
 *
 * Аватар и «Выбрать фото» — в одну строку. После выбора файла в круге —
 * превью (object URL, только в браузере), «Сохранить» / «Отмена»; до
 * сохранения на сервер ничего не уходит. Браузерное поле файла скрыто
 * (`sr-only`): его подпись «Choose File» не переводится и выбивается из
 * дизайна — нажимается наша кнопка-label.
 * Большое фото уменьшаем до отправки (prepare-avatar-upload): иначе запрос
 * больше лимита Server Action и падает без сообщения игроку.
 * Поле «ссылка на картинку» убрано из формы; сервер ссылку по-прежнему
 * принимает (resolve-avatar-image), формат и проверки — там.
 */

import {
    startTransition,
    useActionState,
    useEffect,
    useRef,
    useState,
    type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';

import { changeAvatarAction } from '@/features/profile/actions/change-avatar';
import { getProfileErrorMessage } from '@/features/profile/lib/get-profile-error-message';
import { prepareAvatarUpload } from '@/features/profile/lib/prepare-avatar-upload';
import type { Dictionary, Locale } from '@/shared/i18n';
import {
    Button,
    InlineAlert,
    PendingSpinner,
    SubmitButton,
    UserAvatar,
    buttonClassName,
    toastSuccess,
} from '@/shared/ui';
import { refreshPreservingScroll } from '@/shared/ui/refresh-preserving-scroll';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp';

type ChangeAvatarFormProps = {
    locale: Locale;
    dictionary: Dictionary;
    /** Текущий URL из сессии/БД; null = аватара нет */
    currentImageUrl: string | null;
    /** Эмблема по id игрока — пока фото нет. */
    avatarPattern: number;
};

type AvatarPickerProps = ChangeAvatarFormProps & {
    busy: boolean;
    onSubmit: (formData: FormData) => void;
    onClear: () => void;
};

/**
 * Состояние выбора файла. Ключ — текущий URL аватара: после сохранения
 * компонент монтируется заново и превью сбрасывается само.
 */
function AvatarPicker({
    dictionary,
    locale,
    currentImageUrl,
    avatarPattern,
    busy,
    onSubmit,
    onClear,
}: AvatarPickerProps) {
    const labels = dictionary.profile;
    const inputRef = useRef<HTMLInputElement>(null);
    const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

    // Object URL живёт, пока показан; заменили или ушли — освобождаем.
    useEffect(() => {
        if (!preview) return;
        return () => URL.revokeObjectURL(preview.url);
    }, [preview]);

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        setPreview(file ? { url: URL.createObjectURL(file), name: file.name } : null);
    }

    function handleCancel() {
        if (inputRef.current) {
            inputRef.current.value = '';
        }
        setPreview(null);
    }

    return (
        <form
            action={onSubmit}
            data-testid="avatar-form"
        >
            <input type="hidden" name="locale" value={locale} />

            <div className="flex items-center gap-4">
                {preview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- blob: URL превью, next/image его не оптимизирует
                    <img
                        src={preview.url}
                        alt=""
                        className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-primary"
                    />
                ) : (
                    <UserAvatar
                        src={currentImageUrl}
                        pattern={avatarPattern}
                        size="base"
                        className="!h-16 !w-16"
                        alt={labels.changeAvatarTitle}
                    />
                )}

                {preview ? (
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                            {labels.avatarNewPhoto}
                        </p>
                        <p className="truncate text-sm text-muted">{preview.name}</p>
                    </div>
                ) : null}

                {/* Поле файла в форме всегда (иначе файл не уйдёт); с превью кнопки скрыты. */}
                <div
                    className={`min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center ${
                        preview ? 'hidden' : 'flex'
                    }`}
                >
                    {/* label = кнопка: поле файла внутри, фокус с клавиатуры — на нём. */}
                    <label
                        className={buttonClassName({
                            variant: 'secondary',
                            className:
                                'w-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring sm:w-auto',
                        })}
                    >
                        {labels.avatarChoose}
                        <input
                            ref={inputRef}
                            name="avatarFile"
                            type="file"
                            accept={ACCEPTED_TYPES}
                            className="sr-only"
                            onChange={handleChange}
                            disabled={busy}
                            data-testid="avatar-file"
                        />
                    </label>

                    {currentImageUrl ? (
                        <Button
                            type="button"
                            variant="ghost"
                            disabled={busy}
                            aria-busy={busy}
                            className="w-full gap-1.5 sm:w-auto"
                            onClick={onClear}
                        >
                            {busy ? <PendingSpinner /> : null}
                            {labels.clearAvatar}
                        </Button>
                    ) : null}
                </div>
            </div>

            {preview ? (
                <div className="mt-4 flex gap-2">
                    <SubmitButton
                        pendingLabel={dictionary.common.submitting}
                        disabled={busy}
                        className="flex-1 sm:flex-none"
                        data-testid="avatar-save"
                    >
                        {labels.changeAvatarSubmit}
                    </SubmitButton>
                    <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={handleCancel}
                    >
                        {labels.avatarCancel}
                    </Button>
                </div>
            ) : (
                <p className="mt-3 text-sm text-muted">{labels.avatarFileHint}</p>
            )}
        </form>
    );
}

export function ChangeAvatarForm(props: ChangeAvatarFormProps) {
    const { locale, dictionary, currentImageUrl } = props;
    const router = useRouter();
    const [state, formAction, isPending] = useActionState(changeAvatarAction, {});
    // Ошибка подготовки фото в браузере (до сервера); сбрасывается при отправке.
    const [prepareFailed, setPrepareFailed] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const errorMessage = getProfileErrorMessage(
        dictionary,
        prepareFailed ? 'INVALID_IMAGE' : state.errorCode,
    );
    const busy = isPending || preparing;

    async function submitAvatar(formData: FormData) {
        setPrepareFailed(false);
        const file = formData.get('avatarFile');
        if (file instanceof File && file.size > 0) {
            setPreparing(true);
            const prepared = await prepareAvatarUpload(file);
            setPreparing(false);
            if (!prepared.ok) {
                setPrepareFailed(true);
                return;
            }
            formData.set('avatarFile', prepared.file);
        }
        startTransition(() => {
            formAction(formData);
        });
    }

    function clearAvatar() {
        const fd = new FormData();
        fd.set('locale', locale);
        fd.set('clearAvatar', '1');
        startTransition(() => {
            formAction(fd);
        });
    }

    // Как у username: refresh после cookie update.
    // Важно: imageUrl может быть '' (сброс) — проверяем !== undefined, не truthy.
    useEffect(() => {
        if (state.success && state.imageUrl !== undefined) {
            toastSuccess(dictionary.profile.changeAvatarSuccess);
            refreshPreservingScroll(router);
        }
    }, [state.success, state.imageUrl, router, dictionary.profile.changeAvatarSuccess]);

    return (
        <div>
            <AvatarPicker
                key={currentImageUrl ?? ''}
                {...props}
                busy={busy}
                onSubmit={submitAvatar}
                onClear={clearAvatar}
            />

            {errorMessage ? <InlineAlert className="mt-2">{errorMessage}</InlineAlert> : null}
        </div>
    );
}
