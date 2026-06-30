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
        submitButton: string;
        scoreLabel: string;
        correctAnswersLabel: string;
        errors: {
            invalidSetup: string;
            notEnoughQuestions: string;
            answerAll: string;
            invalidAnswer: string;
            submitFailed: string;
        };
    };
    leaderboard: {
        title: string;
        description: string;
        rank: string;
        player: string;
        score: string;
        correct: string;
        empty: string;
    };
};
