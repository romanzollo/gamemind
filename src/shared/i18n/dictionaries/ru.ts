export type Dictionary = {
    metadata: {
        title: string;
        description: string;
    };
    nav: {
        home: string;
        quiz: string;
        leaderboard: string;
        profile: string;
        admin: string;
        login: string;
        register: string;
    };
    language: {
        label: string;
        ru: string;
        en: string;
    };
    theme: {
        theme: string;
        light: string;
        dark: string;
        switchToLight: string;
        switchToDark: string;
    };
    home: {
        title: string;
        description: string;
    };
    auth: {
        loginTitle: string;
        registerTitle: string;
        email: string;
        password: string;
        username: string;
        loginButton: string;
        registerButton: string;
        noAccount: string;
        haveAccount: string;
        registerLink: string;
        loginLink: string;
        accountCreated: string;
    };
    profile: {
        title: string;
        username: string;
        email: string;
        role: string;
        logout: string;
    };
    admin: {
        questionsTitle: string;
        signedInAs: string;
    };
    quiz: {
        setupTitle: string;
        setupDescription: string;
        difficultyLabel: string;
        questionCountLabel: string;
        easy: string;
        medium: string;
        hard: string;
        startButton: string;
        sessionTitle: string;
        resultTitle: string;
        session: string;
    };
    leaderboard: {
        title: string;
        description: string;
    };
};

export const ruDictionary: Dictionary = {
    metadata: {
        title: 'GameMind',
        description: 'Платформа викторин о видеоиграх',
    },
    nav: {
        home: 'Главная',
        quiz: 'Квиз',
        leaderboard: 'Рейтинг',
        profile: 'Профиль',
        admin: 'Админ',
        login: 'Войти',
        register: 'Регистрация',
    },
    language: {
        label: 'Язык',
        ru: 'RU',
        en: 'EN',
    },
    theme: {
        theme: 'Тема',
        light: 'Светлая',
        dark: 'Тёмная',
        switchToLight: 'Переключить на светлую тему',
        switchToDark: 'Переключить на тёмную тему',
    },
    home: {
        title: 'GameMind',
        description: 'Платформа викторин о видеоиграх.',
    },
    auth: {
        loginTitle: 'Вход',
        registerTitle: 'Регистрация',
        email: 'Email',
        password: 'Пароль',
        username: 'Имя пользователя',
        loginButton: 'Войти',
        registerButton: 'Создать аккаунт',
        noAccount: 'Нет аккаунта?',
        haveAccount: 'Уже есть аккаунт?',
        registerLink: 'Зарегистрироваться',
        loginLink: 'Войти',
        accountCreated: 'Аккаунт создан.',
    },
    profile: {
        title: 'Профиль',
        username: 'Имя пользователя',
        email: 'Email',
        role: 'Роль',
        logout: 'Выйти',
    },
    admin: {
        questionsTitle: 'Управление вопросами',
        signedInAs: 'Админ-зона. Вы вошли как',
    },
    quiz: {
        setupTitle: 'Настройка квиза',
        setupDescription: 'Выбери сложность и количество вопросов.',
        difficultyLabel: 'Сложность',
        questionCountLabel: 'Количество вопросов',
        easy: 'Легко',
        medium: 'Средне',
        hard: 'Сложно',
        startButton: 'Начать квиз',
        sessionTitle: 'Квиз-сессия',
        resultTitle: 'Результат квиза',
        session: 'Сессия',
    },
    leaderboard: {
        title: 'Рейтинг',
        description: 'Лучший результат каждого пользователя за всё время.',
    },
};
