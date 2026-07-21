import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

type ButtonClassNameOptions = {
    variant?: ButtonVariant;
    className?: string;
};

const variantClassName: Record<ButtonVariant, string> = {
    primary:
        'bg-primary text-primary-foreground hover:bg-primary-hover focus-visible:outline-ring',
    secondary:
        'border border-border bg-surface text-foreground hover:bg-surface-hover focus-visible:outline-ring',
    ghost:
        'bg-transparent text-foreground hover:bg-surface-hover focus-visible:outline-ring',
    danger:
        'bg-danger text-primary-foreground hover:opacity-90 focus-visible:outline-ring',
};

const baseClassName =
    'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-md px-4 py-2 text-sm font-medium motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

/** Shared class builder for `<Button>`, `<SubmitButton>`, and link-styled CTAs. */
export function buttonClassName({
    variant = 'primary',
    className = '',
}: ButtonClassNameOptions = {}): string {
    return `${baseClassName} ${variantClassName[variant]} ${className}`.trim();
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode;
    variant?: ButtonVariant;
};

export function Button({
    children,
    variant = 'primary',
    className = '',
    type = 'button',
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={buttonClassName({ variant, className })}
            {...props}
        >
            {children}
        </button>
    );
}
