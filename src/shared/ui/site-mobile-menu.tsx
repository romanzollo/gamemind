'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import type { Locale } from '@/shared/i18n';
import { isNavActive, navActiveClassName } from './nav-active';
import { PendingLink } from './pending-link';

type MobileNavLink = {
    href: string;
    label: string;
};

type SiteMobileMenuProps = {
    locale: Locale;
    links: ReadonlyArray<MobileNavLink>;
    openLabel: string;
    closeLabel: string;
    /** Подпись landmark для списка ссылок (не label кнопки открытия). */
    mainNavLabel: string;
    menuAuth: ReactNode;
    menuUtilities: ReactNode;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

function getScrollbarGap() {
    return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

/**
 * Мобильное меню под sticky-хедером.
 * Блокирует скролл с компенсацией scrollbar-gap, чтобы хедер и панель
 * оставались одной ширины (без тёмной щели при открытии меню).
 */
const mobileNavLinkClassName =
    'rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function SiteMobileMenu({
    locale,
    links,
    openLabel,
    closeLabel,
    mainNavLabel,
    menuAuth,
    menuUtilities,
}: SiteMobileMenuProps) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [scrollbarGap, setScrollbarGap] = useState(0);
    const panelId = useId();
    const toggleRef = useRef<HTMLButtonElement>(null);

    function focusToggle() {
        // После размонтирования dialog/scrim вернуть клавиатурный фокус на ☰.
        requestAnimationFrame(() => {
            toggleRef.current?.focus();
        });
    }

    function closeMenu() {
        setOpen(false);
        setScrollbarGap(0);
        focusToggle();
    }

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
                setScrollbarGap(0);
                focusToggle();
            }
        };

        const previousOverflow = document.body.style.overflow;
        const previousPaddingRight = document.body.style.paddingRight;

        document.body.style.overflow = 'hidden';
        if (scrollbarGap > 0) {
            document.body.style.paddingRight = `${scrollbarGap}px`;
        }

        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.body.style.paddingRight = previousPaddingRight;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open, scrollbarGap]);

    function toggleMenu() {
        setOpen((wasOpen) => {
            if (wasOpen) {
                setScrollbarGap(0);
                return false;
            }

            setScrollbarGap(getScrollbarGap());
            return true;
        });
    }

    const lockStyle =
        scrollbarGap > 0 ? ({ right: scrollbarGap } as const) : undefined;

    return (
        <div className="lg:hidden">
            <button
                ref={toggleRef}
                type="button"
                className="relative z-50 inline-flex size-10 shrink-0 items-center justify-center overflow-visible rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={open ? closeLabel : openLabel}
                onClick={toggleMenu}
            >
                <span
                    aria-hidden
                    className="flex h-3.5 w-4 flex-col justify-between"
                >
                    <span className="block h-0.5 w-full rounded-full bg-current" />
                    <span className="block h-0.5 w-full rounded-full bg-current" />
                    <span className="block h-0.5 w-full rounded-full bg-current" />
                </span>
            </button>

            {open ? (
                <div>
                    <button
                        type="button"
                        style={lockStyle}
                        className="fixed inset-x-0 bottom-0 top-[var(--site-header-sticky-offset)] z-40 bg-background/50 backdrop-blur-md supports-backdrop-filter:bg-background/35"
                        aria-label={closeLabel}
                        onClick={closeMenu}
                    />

                    <div
                        id={panelId}
                        role="dialog"
                        aria-modal="true"
                        style={lockStyle}
                        className="fixed inset-x-0 top-[var(--site-header-sticky-offset)] z-50 max-h-[min(70vh,calc(100dvh-var(--site-header-sticky-offset)))] overflow-y-auto border-b border-border bg-surface px-3 py-3 shadow-md sm:px-4"
                    >
                        <div className="mx-auto max-w-5xl">
                            <nav
                                className="flex flex-col gap-1"
                                aria-label={mainNavLabel}
                            >
                                {links.map((link) => {
                                    const active = isNavActive(
                                        pathname,
                                        link.href,
                                    );

                                    return (
                                        <PendingLink
                                            key={link.href}
                                            href={localizedHref(
                                                locale,
                                                link.href,
                                            )}
                                            className={navActiveClassName(
                                                active,
                                                mobileNavLinkClassName,
                                            )}
                                            aria-current={
                                                active ? 'page' : undefined
                                            }
                                            onClick={closeMenu}
                                        >
                                            {link.label}
                                        </PendingLink>
                                    );
                                })}
                            </nav>

                            <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                                {menuAuth}
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                                {menuUtilities}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
