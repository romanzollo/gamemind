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
        logout: string;
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
        confirmPassword: string;
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
        historyTitle: string;
        historyEmpty: string;
        historyDate: string;
        historyDifficulty: string;
        historyScore: string;
        historyCorrect: string;
        historyView: string;
        historyLoadFailed: string;
    };
    admin: {
        questionsTitle: string;
        signedInAs: string;
        listDescription: string;
        tableQuestion: string;
        tableDifficulty: string;
        tableCategory: string;
        tableOptions: string;
        tableStatus: string;
        tableCreated: string;
        statusActive: string;
        statusInactive: string;
        empty: string;
        formQuestionText: string;
        formQuestionTextRu: string;
        formQuestionTextEn: string;
        formQuestionType: string;
        formQuestionTypeText: string;
        formQuestionTypeImageGuess: string;
        formPromptImageUrl: string;
        formPromptImageUrlHint: string;
        formOptionTextRu: string;
        formOptionTextEn: string;
        formCategory: string;
        formOptions: string;
        formCorrectOptionHint: string;
        formOption: string;
        createButton: string;
        createTitle: string;
        createLink: string;
        editButton: string;
        editTitle: string;
        editLink: string;
        deactivateButton: string;
        activateButton: string;
        deleteButton: string;
        tableActions: string;
        errors: {
            loadFailed: string;
            invalidInput: string;
            notFound: string;
            exactlyOneCorrectRequired: string;
            saveFailed: string;
            deleteFailed: string;
            deactivateFailed: string;
            activateFailed: string;
        };
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
        /** Подпись для взвешенных очков (не число верных ответов) */
        scoreLabel: string;
        correctAnswersLabel: string;
        imageUnavailable: string;
        reviewTitle: string;
        yourAnswer: string;
        correctAnswer: string;
        statusCorrect: string;
        statusWrong: string;
        filterAll: string;
        filterWrong: string;
        filterCorrect: string;
        playAgain: string;
        toLeaderboard: string;
        backHome: string;
        reviewEmpty: string;
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
        /** Колонка взвешенных очков */
        score: string;
        correct: string;
        empty: string;
        loadFailed: string;
    };
};
