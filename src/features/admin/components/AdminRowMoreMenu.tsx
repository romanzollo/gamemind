'use client';

import {
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

/**
 * Компактное «Ещё»-меню для desktop admin row.
 *
 * Зачем: в content-queue нельзя держать 4–6 текстовых actions в одной ячейке —
 * снаружи только Edit (стабильная колонка), редкие и статусные действия сюда.
 *
 * Почему `<details>`, а не library: один disclosure без Radix/Headless —
 * Scoreboard Editorial, без второго UI-стека (см. TASTE §14).
 * Client нужен для Escape / click-outside и fixed-портала панели.
 *
 * Панель через portal + `position: fixed`: родитель таблицы имеет
 * `overflow-x-auto` (→ clipping по Y тоже), иначе absolute-меню обрезается
 * и выглядит как «поехавшая» плашка с одним пунктом.
 *
 * Важно: outside-close на `click`, не `pointerdown` — иначе pointerdown
 * может сорвать submit Server Action у кнопок внутри панели.
 *
 * Не использовать role="menu": внутри Server Action forms, не menuitem-паттерн.
 */

type AdminRowMoreMenuProps = {
    /** Подпись для screen readers + title (из dictionary.admin.rowMoreActions). */
    label: string;
    children: ReactNode;
};

type PanelCoords = {
    top: number;
    left: number;
};

const PANEL_MIN_WIDTH_PX = 176; // min-w-44

function computePanelCoords(summary: HTMLElement): PanelCoords {
    const rect = summary.getBoundingClientRect();
    const left = Math.min(
        Math.max(8, rect.right - PANEL_MIN_WIDTH_PX),
        window.innerWidth - PANEL_MIN_WIDTH_PX - 8,
    );
    // Снизу от trigger; если мало места — чуть выше, всё ещё fixed (без clip).
    const preferredTop = rect.bottom + 4;
    const maxTop = window.innerHeight - 8;
    const top = Math.min(preferredTop, maxTop);

    return { top, left };
}

export function AdminRowMoreMenu({ label, children }: AdminRowMoreMenuProps) {
    const detailsRef = useRef<HTMLDetailsElement>(null);
    const summaryRef = useRef<HTMLElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelId = useId();
    const [open, setOpen] = useState(false);
    const [coords, setCoords] = useState<PanelCoords | null>(null);

    function syncPosition() {
        const summary = summaryRef.current;
        if (!summary) {
            return;
        }
        setCoords(computePanelCoords(summary));
    }

    useLayoutEffect(() => {
        if (!open) {
            return;
        }
        syncPosition();
    }, [open]);

    useEffect(() => {
        const details = detailsRef.current;
        if (!details) {
            return;
        }

        function onToggle() {
            const isOpen = Boolean(detailsRef.current?.open);
            if (isOpen) {
                syncPosition();
            } else {
                setCoords(null);
            }
            setOpen(isOpen);
        }

        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== 'Escape') {
                return;
            }
            const el = detailsRef.current;
            if (el?.open) {
                el.open = false;
            }
        }

        // click (не pointerdown): submit button должен успеть получить полный click.
        // Панель в portal — проверяем и details, и panel.
        function onDocumentClick(event: MouseEvent) {
            const el = detailsRef.current;
            const panel = panelRef.current;
            if (!el?.open) {
                return;
            }
            const target = event.target;
            if (!(target instanceof Node)) {
                return;
            }
            if (el.contains(target) || panel?.contains(target)) {
                return;
            }
            el.open = false;
        }

        function onReposition() {
            if (detailsRef.current?.open) {
                syncPosition();
            }
        }

        details.addEventListener('toggle', onToggle);
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('click', onDocumentClick);
        window.addEventListener('resize', onReposition);
        // capture: scroll внутри overflow-x-auto таблицы тоже двигает trigger
        window.addEventListener('scroll', onReposition, true);

        return () => {
            details.removeEventListener('toggle', onToggle);
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('click', onDocumentClick);
            window.removeEventListener('resize', onReposition);
            window.removeEventListener('scroll', onReposition, true);
        };
    }, []);

    const panelStyle: CSSProperties | undefined = coords
        ? {
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              zIndex: 60,
          }
        : undefined;

    const panel =
        open && coords && typeof document !== 'undefined'
            ? createPortal(
                  <div
                      ref={panelRef}
                      id={panelId}
                      role="presentation"
                      style={panelStyle}
                      className="min-w-44 rounded-md border border-border bg-surface p-1.5 shadow-md"
                      onClick={(event) => {
                          // Не даём клику закрыть details через document handler гонки.
                          event.stopPropagation();
                      }}
                  >
                      <div className="flex flex-col items-stretch gap-0.5">
                          {children}
                      </div>
                  </div>,
                  document.body,
              )
            : null;

    return (
        <details ref={detailsRef} className="relative inline-block">
            <summary
                ref={summaryRef}
                className="inline-flex min-h-8 cursor-pointer list-none items-center rounded-sm px-1.5 font-mono text-sm font-medium text-muted motion-safe:transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
                aria-controls={panelId}
                aria-expanded={open}
                title={label}
            >
                <span className="sr-only">{label}</span>
                <span aria-hidden="true">⋯</span>
            </summary>
            {/*
              Скрытый «якорь» для a11y/aria-controls: видимая панель в portal.
              Дети рендерятся только в portal, чтобы не дублировать Server Action forms.
            */}
            {panel}
        </details>
    );
}
