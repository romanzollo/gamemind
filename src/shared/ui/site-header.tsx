import Link from 'next/link';

// Массив ссылок для шапки сайта
const links = [
    { href: '/', label: 'Home' },
    { href: '/quiz/setup', label: 'Quiz' },
    { href: '/leaderboard', label: 'Leaderboard' },
    { href: '/profile', label: 'Profile' },
    { href: '/admin/questions', label: 'Admin' },
    { href: '/login', label: 'Login' },
    { href: '/register', label: 'Register' },
];

// Компонент для шапки сайта
export function SiteHeader() {
    return (
        <header className="border-b border-neutral-200 dark:border-neutral-800">
            <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 p-4 text-sm">
                {links.map((link) => (
                    <Link
                        key={link.href}
                        href={link.href}
                        className="text-neutral-700 hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                    >
                        {link.label}
                    </Link>
                ))}
            </nav>
        </header>
    );
}
