/**
 * Панель quality перед publish на edit.
 *
 * Presentation only: коды уже посчитаны pure-функцией;
 * сюда только список + i18n. Не трогает Neon / scoring / snapshot.
 * Scoreboard Editorial: surface, caps title, danger/warning тона.
 */

import {
    getPublishQualityMessage,
    type QuestionPublishQualityIssue,
} from '@/features/admin/lib';
import type { Dictionary } from '@/shared/i18n';
import { InlineAlert } from '@/shared/ui';

type AdminQuestionPublishQualityPanelProps = {
    issues: QuestionPublishQualityIssue[];
    dictionary: Dictionary;
};

export function AdminQuestionPublishQualityPanel({
    issues,
    dictionary,
}: AdminQuestionPublishQualityPanelProps) {
    if (issues.length === 0) {
        return null;
    }

    const labels = dictionary.admin.publishQuality;
    const blockers = issues.filter((issue) => issue.severity === 'blocker');
    const warnings = issues.filter((issue) => issue.severity === 'warning');

    return (
        <section
            className="mt-6 rounded-lg border border-border bg-surface p-3 sm:p-4"
            aria-label={labels.title}
        >
            <h2 className="font-display text-sm font-semibold tracking-wide text-foreground uppercase">
                {labels.title}
            </h2>

            {blockers.length > 0 ? (
                <div className="mt-3">
                    <h3 className="text-[11px] font-medium tracking-wide text-danger uppercase">
                        {labels.blockersTitle}
                    </h3>
                    <ul className="mt-2 space-y-2">
                        {blockers.map((issue) => (
                            <li key={issue.code}>
                                <InlineAlert tone="danger" role="alert">
                                    {getPublishQualityMessage(
                                        dictionary,
                                        issue.code,
                                    )}
                                </InlineAlert>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {warnings.length > 0 ? (
                <div className={blockers.length > 0 ? 'mt-4' : 'mt-3'}>
                    <h3 className="text-[11px] font-medium tracking-wide text-warning uppercase">
                        {labels.warningsTitle}
                    </h3>
                    <ul className="mt-2 space-y-2">
                        {warnings.map((issue) => (
                            <li key={issue.code}>
                                <InlineAlert tone="warning" role="status">
                                    {getPublishQualityMessage(
                                        dictionary,
                                        issue.code,
                                    )}
                                </InlineAlert>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
        </section>
    );
}
