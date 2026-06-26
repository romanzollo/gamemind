'use client';

import { useActionState } from 'react'; // Хук для работы с action state
import { loginAction } from '@/features/auth/actions'; // Действие для входа в систему
import Link from 'next/link'; // Компонент для создания ссылок

// Компонент для страницы входа в систему
export default function LoginPage() {
    const [state, formAction] = useActionState(loginAction, {});

    return (
        <main className="mx-auto max-w-md p-8">
            <h1 className="text-2xl font-semibold">Log in</h1>

            <form action={formAction} className="mt-4 flex flex-col gap-3">
                <input name="email" type="email" placeholder="Email" required />
                <input
                    name="password"
                    type="password"
                    placeholder="Password"
                    required
                />
                <button type="submit">Log in</button>
            </form>

            {state.error && <p className="mt-2 text-red-600">{state.error}</p>}

            <p className="mt-4 text-sm text-neutral-600">
                No account?{' '}
                <Link href="/register" className="underline">
                    Register
                </Link>
            </p>
        </main>
    );
}
