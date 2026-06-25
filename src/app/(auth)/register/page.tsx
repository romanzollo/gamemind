'use client';

import { useActionState } from 'react';
import { registerAction } from '@/features/auth/actions';

export default function RegisterPage() {
    const [state, formAction] = useActionState(registerAction, {});

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">Register</h1>
            <form action={formAction} className="mt-4 flex flex-col gap-3">
                <input name="username" placeholder="Username" required />
                <input name="email" type="email" placeholder="Email" required />
                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                />
                <button type="submit">Create account</button>
            </form>
            {state.error && <p className="mt-2 text-red-600">{state.error}</p>}
            {state.success && (
                <p>
                    Account created. <a href="/login">Log in</a>
                </p>
            )}
        </main>
    );
}
