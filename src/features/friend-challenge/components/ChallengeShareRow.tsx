/**
 * «Поделиться» на странице своего вызова: автор может отправить ссылку
 * ещё кому-то. Текст собирается на сервере тем же builder'ом, что и на
 * результате; кнопки — общие ShareActions.
 */

import { buildChallengeShare } from '@/features/friend-challenge/lib/build-challenge-share';
import { ShareActions } from '@/features/quiz/components/ShareActions';
import type { Dictionary, Locale } from '@/shared/i18n';

export function ChallengeShareRow(props: {
    locale: Locale;
    url: string;
    creatorName: string;
    setLine: string;
    score: string;
    marks: readonly boolean[];
    labels: Dictionary['friendChallenge'];
    shareLabels: Dictionary['share'];
}) {
    const share = buildChallengeShare(
        {
            creatorName: props.creatorName,
            setLine: props.setLine,
            score: props.score,
            marks: props.marks,
            url: props.url,
        },
        {
            header: props.labels.shareHeader,
            scoreLine: props.labels.shareScore,
            invite: props.labels.shareInvite,
            title: props.labels.shareTitle,
        },
    );

    return (
        <ShareActions
            text={share.text}
            targets={share.targets}
            labels={{
                button: props.shareLabels.button,
                copied: props.labels.linkCopied,
                copyFailed: props.shareLabels.copyFailed,
            }}
            className="mt-5"
        />
    );
}
