'use client';

/**
 * Лобби комнаты (макет v2, экраны 1–2): крупный код (касание копирует
 * ссылку) и «Позвать», игроки с пустыми местами «ждём игроков…», настройки
 * одной строкой — чипы в шторке «Изменить» (как у режимов на главной),
 * «Начать · N игроков» закреплена внизу у ведущего. Своё имя можно сменить
 * до старта. Права проверяет сервер; здесь — только вид и запросы.
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import type { PlayTopicOption } from '@/entities/play-topic/play-topic';
import { isPlayTopicAvailable } from '@/entities/play-topic/play-topic';
import { ShareActions } from '@/features/quiz/components/ShareActions';
import { postRoom } from '@/features/quiz-room/components/use-room-state';
import { EYEBROW_CLASS, RoomAvatar } from '@/features/quiz-room/components/RoomParts';
import {
    fillRoomText,
    roomDifficultyLabel,
    roomErrorMessage,
    roomQuestionsLabel,
    roomSettingsLine,
} from '@/features/quiz-room/lib/room-labels';
import {
    ROOM_ANSWER_SECONDS,
    ROOM_DIFFICULTIES,
    ROOM_MAX_PLAYERS,
    ROOM_MIN_PLAYERS_TO_START,
    ROOM_QUESTION_COUNTS,
    type RoomSettings,
} from '@/features/quiz-room/lib/room-rules';
import {
    normalizeRoomNickname,
    ROOM_NICKNAME_MAX_LENGTH,
} from '@/features/quiz-room/lib/room-nickname';
import type { RoomErrorCode, RoomStateDto } from '@/features/quiz-room/types';
import { formatPlural, getDictionary, type Locale } from '@/shared/i18n';
import { BottomSheet, Button, ChipRadioGroup, InlineAlert } from '@/shared/ui';
import { toastError, toastSuccess } from '@/shared/ui/toast';

type RoomLobbyProps = {
    locale: Locale;
    state: RoomStateDto;
    refresh: () => void;
};

const ALL_TOPICS = 'all';
/** Сколько мест показываем, пока комната набирается (пустые — пунктиром). */
const VISIBLE_SLOTS = 4;

function sameRoomSettings(left: RoomSettings, right: RoomSettings): boolean {
    return (
        left.questionCount === right.questionCount &&
        left.difficulty === right.difficulty &&
        left.topicId === right.topicId &&
        left.answerSeconds === right.answerSeconds &&
        left.speedScoring === right.speedScoring
    );
}

function useInviteUrl(locale: Locale, code: string): string {
    const [origin, setOrigin] = useState('');

    useEffect(() => {
        // Адрес сайта известен только в браузере (www / превью Vercel / localhost).
        const id = requestAnimationFrame(() => setOrigin(window.location.origin));
        return () => cancelAnimationFrame(id);
    }, []);

    return `${origin}/${locale}/room/${code}`;
}

function usePlayTopics(enabled: boolean): PlayTopicOption[] {
    const [topics, setTopics] = useState<PlayTopicOption[]>([]);

    useEffect(() => {
        if (!enabled) return;

        let cancelled = false;

        // Тот же кэшируемый CDN список, что у шторок Классики и Блица.
        fetch('/api/quiz/topics')
            .then((response) => (response.ok ? response.json() : null))
            .then((data: { topics: PlayTopicOption[] | null } | null) => {
                if (!cancelled && data?.topics) setTopics(data.topics);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [enabled]);

    return topics;
}

export function RoomLobby({ locale, state, refresh }: RoomLobbyProps) {
    const router = useRouter();
    const dictionary = getDictionary(locale);
    const text = dictionary.room;
    const inviteUrl = useInviteUrl(locale, state.code);
    const topics = usePlayTopics(state.isHost);
    const sheetRef = useRef<HTMLDialogElement>(null);
    const sheetHeadingId = useId();
    const [draft, setDraft] = useState<RoomSettings | null>(null);
    const [busy, setBusy] = useState<'start' | 'leave' | null>(null);
    const [error, setError] = useState<RoomErrorCode | null>(null);
    const [editingName, setEditingName] = useState<string | null>(null);

    // Своя правка видна сразу и держится, пока опрос не принесёт её же.
    const settings =
        draft && !sameRoomSettings(draft, state.settings) ? draft : state.settings;
    const host = state.players.find((player) => player.isHost);
    const activeCount = state.players.length;
    const canStart = activeCount >= ROOM_MIN_PLAYERS_TO_START;
    const starting = state.status === 'starting' || busy === 'start';
    const emptySlots = Math.max(0, VISIBLE_SLOTS - activeCount);
    const topicName =
        settings.topicId === null
            ? dictionary.quiz.topicAll
            : (() => {
                  const topic = topics.find((item) => item.id === settings.topicId);
                  return topic ? (locale === 'en' ? topic.nameEn : topic.nameRu) : state.settings.topicName;
              })();

    // Настройки уходят по одной: быстрые нажатия чипов иначе обгоняют друг
    // друга, и сервер мог применить старые после новых. В полёте — один
    // запрос; после него отправляются самые свежие настройки.
    const saving = useRef(false);
    const pendingSave = useRef<RoomSettings | null>(null);

    async function flushSettings() {
        if (saving.current) return;

        saving.current = true;

        while (pendingSave.current) {
            const next = pendingSave.current;
            pendingSave.current = null;

            const result = await postRoom(`/api/room/${state.code}/host`, {
                op: 'settings',
                settings: next,
            });

            if (!result.ok) {
                pendingSave.current = null;
                setDraft(null);
                setError(result.error as RoomErrorCode);
                break;
            }
        }

        saving.current = false;
        refresh();
    }

    function saveSettings(next: RoomSettings) {
        setDraft(next);
        setError(null);
        pendingSave.current = next;
        void flushSettings();
    }

    async function start() {
        setBusy('start');
        setError(null);

        const result = await postRoom(`/api/room/${state.code}/host`, { op: 'start' });

        if (!result.ok) {
            setError(result.error as RoomErrorCode);
        }

        setBusy(null);
        refresh();
    }

    async function kick(playerId: string) {
        const result = await postRoom(`/api/room/${state.code}/host`, { op: 'kick', playerId });

        if (!result.ok) toastError(text.errors.generic);
        refresh();
    }

    async function leave() {
        setBusy('leave');
        await postRoom(`/api/room/${state.code}/me`, { op: 'leave' });
        router.push(`/${locale}`);
    }

    async function saveName() {
        const nickname = normalizeRoomNickname(editingName);

        if (!nickname) {
            setError('INVALID');
            return;
        }

        const result = await postRoom(`/api/room/${state.code}/me`, { op: 'nickname', nickname });

        if (!result.ok) {
            setError(result.error as RoomErrorCode);
            return;
        }

        setEditingName(null);
        setError(null);
        refresh();
    }

    async function copyInvite() {
        try {
            await navigator.clipboard.writeText(inviteUrl);
            toastSuccess(text.linkCopied);
        } catch {
            toastError(dictionary.share.copyFailed);
        }
    }

    const inviteLine = fillRoomText(text.shareText, { code: state.code });
    const shareText = `${inviteLine}\n${inviteUrl}`;
    const topicOptions = [
        { value: ALL_TOPICS, label: dictionary.quiz.topicAll },
        ...topics.map((topic) => ({
            value: topic.id,
            label: locale === 'en' ? topic.nameEn : topic.nameRu,
            disabled: !isPlayTopicAvailable(topic, settings.difficulty),
        })),
    ];
    const errorMessage = error ? roomErrorMessage(dictionary, error) : undefined;
    const settingsHeadline = [
        roomQuestionsLabel(dictionary, locale, settings.questionCount),
        roomDifficultyLabel(dictionary, settings.difficulty),
        fillRoomText(text.seconds, { n: settings.answerSeconds }),
    ].join(' · ');
    const settingsDetail = [topicName, settings.speedScoring ? text.speedOn : text.speedOff]
        .filter(Boolean)
        .join(' · ');

    return (
        <div className="flex flex-col gap-3">
            <section className="rounded-lg border border-border bg-surface p-4 text-center shadow-sm sm:p-6">
                <p className={EYEBROW_CLASS}>{text.codeLabel}</p>
                <button
                    type="button"
                    onClick={copyInvite}
                    className="mx-auto mt-1 block cursor-pointer rounded-md px-3 font-display text-6xl font-bold tracking-[0.18em] text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    data-testid="room-code"
                >
                    {state.code}
                </button>
                <p className="mt-1 text-xs text-muted">{text.codeCopyHint}</p>
                {state.isHost ? (
                    <ShareActions
                        text={shareText}
                        targets={{
                            telegram: `https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${encodeURIComponent(inviteLine)}`,
                            vk: `https://vk.com/share.php?url=${encodeURIComponent(inviteUrl)}&title=${encodeURIComponent(inviteLine)}`,
                            max: `https://max.ru/:share?text=${encodeURIComponent(shareText)}`,
                        }}
                        labels={{
                            button: text.invitePlayers,
                            copied: text.linkCopied,
                            copyFailed: dictionary.share.copyFailed,
                        }}
                        shareWhat="room"
                        className="mt-4 w-full"
                    />
                ) : (
                    <p className="mt-3 font-mono text-xs text-muted">
                        {roomSettingsLine(dictionary, locale, state.settings)}
                    </p>
                )}
            </section>

            <section className="rounded-lg border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <h2 className={EYEBROW_CLASS}>{text.players}</h2>
                    <span className="font-mono text-xs text-muted tabular-nums">
                        {activeCount} / {ROOM_MAX_PLAYERS}
                    </span>
                </div>
                <ul className="mt-3 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2" data-testid="room-players">
                    {state.players.map((player) => (
                        <li
                            key={player.id}
                            className={`flex min-h-12 min-w-0 items-center gap-2 rounded-md bg-surface-muted px-2.5 py-1.5 motion-safe:animate-room-pop ${
                                player.isMe ? 'ring-2 ring-primary' : ''
                            }`}
                        >
                            <RoomAvatar player={player} />
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold text-foreground">
                                    {player.nickname}
                                </p>
                                {player.isHost || player.isMe ? (
                                    <p className="font-mono text-2xs uppercase tracking-[0.1em] text-muted">
                                        {[
                                            player.isHost ? text.hostTag : null,
                                            player.isMe ? text.youTag : null,
                                        ]
                                            .filter(Boolean)
                                            .join(' · ')}
                                        {player.isMe && editingName === null ? (
                                            <>
                                                {' · '}
                                                <button
                                                    type="button"
                                                    className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-foreground"
                                                    onClick={() => setEditingName(player.nickname)}
                                                >
                                                    {text.rename}
                                                </button>
                                            </>
                                        ) : null}
                                    </p>
                                ) : null}
                            </div>
                            {state.isHost && !player.isMe ? (
                                <button
                                    type="button"
                                    onClick={() => kick(player.id)}
                                    aria-label={fillRoomText(text.kick, { name: player.nickname })}
                                    title={fillRoomText(text.kick, { name: player.nickname })}
                                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
                                >
                                    <svg viewBox="0 0 16 16" className="size-4" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                                        <path d="M4 4l8 8M12 4l-8 8" />
                                    </svg>
                                </button>
                            ) : null}
                        </li>
                    ))}
                    {Array.from({ length: emptySlots }, (_, index) => (
                        <li
                            key={`slot-${index}`}
                            aria-hidden
                            className="flex min-h-12 items-center justify-center rounded-md border-2 border-dashed border-border text-xs text-muted"
                        >
                            {text.waitingSlot}
                        </li>
                    ))}
                </ul>
                {editingName !== null ? (
                    <form
                        className="mt-3 flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void saveName();
                        }}
                    >
                        <input
                            value={editingName}
                            onChange={(event) => setEditingName(event.target.value)}
                            maxLength={ROOM_NICKNAME_MAX_LENGTH}
                            aria-label={text.nicknameLabel}
                            autoFocus
                            className="min-h-11 w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-3 text-base font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                        <Button type="submit">{text.renameSave}</Button>
                    </form>
                ) : null}
            </section>

            {state.isHost ? (
                <section className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
                    <div className="min-w-0">
                        <h2 className={EYEBROW_CLASS}>{text.settings}</h2>
                        <p className="mt-1 font-semibold text-foreground">{settingsHeadline}</p>
                        <p className="text-xs text-muted">{settingsDetail}</p>
                    </div>
                    <Button
                        variant="secondary"
                        className="shrink-0"
                        aria-haspopup="dialog"
                        onClick={() => sheetRef.current?.showModal()}
                        data-testid="room-settings-open"
                    >
                        {text.editSettings}
                    </Button>
                </section>
            ) : (
                <section className="rounded-lg border border-border bg-surface p-5 text-center shadow-sm">
                    <p className="font-display text-xl font-semibold text-foreground">
                        {fillRoomText(text.waitingForHost, { name: host?.nickname ?? '…' })}
                    </p>
                    <p className="mx-auto mt-1.5 max-w-prose text-sm text-muted">{text.rulesHint}</p>
                </section>
            )}

            {errorMessage ? <InlineAlert>{errorMessage}</InlineAlert> : null}

            {state.isHost ? (
                <div className="sticky bottom-[calc(var(--site-tab-bar-height)+env(safe-area-inset-bottom)+0.75rem)] z-10 flex flex-col gap-1.5 rounded-lg bg-background/95 pt-1 lg:bottom-4">
                    <Button
                        onClick={start}
                        disabled={!canStart || starting}
                        aria-busy={starting || undefined}
                        className="min-h-12 w-full text-base shadow-md"
                        data-testid="room-start"
                    >
                        {starting
                            ? dictionary.common.working
                            : fillRoomText(text.startWithPlayers, {
                                  players: formatPlural(locale, activeCount, text.playersCount),
                              })}
                    </Button>
                    {!canStart ? (
                        <p className="text-center text-xs text-muted">{text.needMorePlayers}</p>
                    ) : null}
                </div>
            ) : null}

            <Button
                variant="ghost"
                onClick={leave}
                disabled={busy === 'leave'}
                className="w-full text-muted"
            >
                {state.isHost ? text.close : text.leave}
            </Button>

            {state.isHost ? (
                <BottomSheet ref={sheetRef} labelledBy={sheetHeadingId} closeLabel={dictionary.common.close}>
                    <h2
                        id={sheetHeadingId}
                        className="pr-10 font-display text-xl font-semibold tracking-tight text-foreground"
                    >
                        {text.settingsTitle}
                    </h2>
                    <div className="mt-4 flex flex-col gap-4">
                        <ChipRadioGroup
                            name="room-count"
                            legend={text.questionCount}
                            value={String(settings.questionCount)}
                            options={ROOM_QUESTION_COUNTS.map((count) => ({
                                value: String(count),
                                label: String(count),
                            }))}
                            onChange={(value) =>
                                saveSettings({ ...settings, questionCount: Number(value) as RoomSettings['questionCount'] })
                            }
                        />
                        <ChipRadioGroup
                            name="room-difficulty"
                            legend={text.difficulty}
                            value={settings.difficulty}
                            options={ROOM_DIFFICULTIES.map((difficulty) => ({
                                value: difficulty,
                                label: roomDifficultyLabel(dictionary, difficulty),
                            }))}
                            onChange={(difficulty) => saveSettings({ ...settings, difficulty })}
                        />
                        <ChipRadioGroup
                            name="room-seconds"
                            legend={text.answerTime}
                            value={String(settings.answerSeconds)}
                            options={ROOM_ANSWER_SECONDS.map((seconds) => ({
                                value: String(seconds),
                                label: fillRoomText(text.seconds, { n: seconds }),
                            }))}
                            onChange={(value) =>
                                saveSettings({ ...settings, answerSeconds: Number(value) as RoomSettings['answerSeconds'] })
                            }
                        />
                        {topics.length > 0 ? (
                            <ChipRadioGroup
                                name="room-topic"
                                legend={text.topic}
                                value={settings.topicId ?? ALL_TOPICS}
                                options={topicOptions}
                                onChange={(value) =>
                                    saveSettings({ ...settings, topicId: value === ALL_TOPICS ? null : value })
                                }
                            />
                        ) : null}
                        <label className="flex cursor-pointer items-center justify-between gap-4">
                            <span>
                                <span className="block text-sm font-medium text-foreground">{text.speedScoring}</span>
                                <span className="mt-0.5 block text-xs text-muted">
                                    {settings.speedScoring ? text.speedScoringHint : text.speedScoringOffHint}
                                </span>
                            </span>
                            <input
                                type="checkbox"
                                role="switch"
                                checked={settings.speedScoring}
                                onChange={(event) =>
                                    saveSettings({ ...settings, speedScoring: event.target.checked })
                                }
                                className="peer sr-only"
                            />
                            <span
                                aria-hidden
                                className="relative h-6 w-10 shrink-0 rounded-full bg-surface-muted transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-surface after:shadow-sm after:transition-transform peer-checked:after:translate-x-4"
                            />
                        </label>
                        <Button
                            onClick={() => sheetRef.current?.close()}
                            className="w-full"
                            data-testid="room-settings-done"
                        >
                            {text.settingsDone}
                        </Button>
                    </div>
                </BottomSheet>
            ) : null}
        </div>
    );
}
