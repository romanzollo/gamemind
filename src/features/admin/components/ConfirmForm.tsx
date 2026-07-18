'use client';

import type { FormEvent, ReactNode } from 'react';

type ConfirmFormProps = {
    action: (formData: FormData) => void | Promise<void>;
    message: string;
    children: ReactNode;
    className?: string;
};

/** Client wrapper: confirm before submitting a Server Action form. */
export function ConfirmForm({
    action,
    message,
    children,
    className,
}: ConfirmFormProps) {
    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        if (!window.confirm(message)) {
            event.preventDefault();
        }
    }

    return (
        <form action={action} onSubmit={handleSubmit} className={className}>
            {children}
        </form>
    );
}
