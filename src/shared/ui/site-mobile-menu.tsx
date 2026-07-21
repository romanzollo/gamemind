'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

import type { Locale } from '@/shared/i18n';
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
    menuAuth: ReactNode;
    /** Lang / theme controls for the mobile panel. */
    menuUtilities: ReactNode;
};

function localizedHref(locale: Locale, href: string) {
    return href === '/' ? `/${locale}` : `/${locale}${href}`;
}

export function SiteMobileMenu({
    locale,
    links,
    openLabel,
    closeLabel,
    menuAuth,
    menuUtilities,
}: SiteMobileMenuProps) {
    const [open, setOpen] = useState(false);
    const panelId = useId();

    useEffect(() => {
        if (!open) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKeyDown);

        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className="lg:hidden">
            <button
                type="button"
                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={open ? closeLabel : openLabel}
                onClick={() => setOpen((current) => !current)}
            >
                <span aria-hidden className="flex flex-col gap-1">
                    <span className="block h-0.5 w-4 bg-current" />
                    <span className="block h-0.5 w-4 bg-current" />
                    <span className="block h-0.5 w-4 bg-current" />
                </span>
            </button>

            {open ? (
                <>
                    {/*
                      Editorial scrim: soft page tint + blur (not flat gray slab).
                      Works in light/dark via --background; content stays faintly readable.
                    */}
                    <button
                        type="button"
                        className="fixed inset-0 z-40 bg-background/50 backdrop-blur-md supports-backdrop-filter:bg-background/35"
                        aria-label={closeLabel}
                        onClick={() => setOpen(false)}
                    />

                    <div
                        id={panelId}
                        role="dialog"
                        aria-modal="true"
                        className="absolute inset-x-0 top-full z-50 border-b border-border bg-surface px-3 py-3 shadow-md"
                    >
                        <nav
                            className="flex flex-col gap-1"
                            aria-label={openLabel}
                        >
                            {links.map((link) => (
                                <PendingLink
                                    key={link.href}
                                    href={localizedHref(locale, link.href)}
                                    className="rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                    onClick={() => setOpen(false)}
                                >
                                    {link.label}
                                </PendingLink>
                            ))}
                        </nav>

                        <div className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                            {menuAuth}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
                            {menuUtilities}
                        </div>
                    </div>
                </>
            ) : null}
        </div>
    );
}
