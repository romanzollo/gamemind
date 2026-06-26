import type { Dictionary } from './types';

export const enDictionary = {
    metadata: {
        title: 'GameMind',
        description: 'Video game quiz platform',
    },
    nav: {
        home: 'Home',
        quiz: 'Quiz',
        leaderboard: 'Leaderboard',
        profile: 'Profile',
        admin: 'Admin',
        login: 'Login',
        register: 'Register',
    },
    language: {
        label: 'Language',
        ru: 'RU',
        en: 'EN',
    },
    theme: {
        theme: 'Theme',
        light: 'Light',
        dark: 'Dark',
        switchToLight: 'Switch to light theme',
        switchToDark: 'Switch to dark theme',
    },
    home: {
        title: 'GameMind',
        description: 'Video game quiz platform.',
    },
    auth: {
        loginTitle: 'Log in',
        registerTitle: 'Register',
        email: 'Email',
        password: 'Password',
        username: 'Username',
        loginButton: 'Log in',
        registerButton: 'Create account',
        noAccount: 'No account?',
        haveAccount: 'Already have an account?',
        registerLink: 'Register',
        loginLink: 'Log in',
        accountCreated: 'Account created.',
    },
    profile: {
        title: 'Profile',
        username: 'Username',
        email: 'Email',
        role: 'Role',
        logout: 'Log out',
    },
    admin: {
        questionsTitle: 'Manage questions',
        signedInAs: 'Admin-only area. Signed in as',
    },
    quiz: {
        setupTitle: 'Quiz setup',
        setupDescription: 'Choose difficulty and question count.',
        sessionTitle: 'Quiz session',
        resultTitle: 'Quiz result',
        session: 'Session',
    },
    leaderboard: {
        title: 'Leaderboard',
        description: 'Best score per user (all time).',
    },
} satisfies Dictionary;
