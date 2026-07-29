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
    common: {
        loading: string;
        submitting: string;
        working: string;
        openMenu: string;
        closeMenu: string;
        /** Skip-ссылка → контент после sticky-хедера (a11y). */
        skipToContent: string;
        /** Подпись landmark основной навигации (desktop / mobile). */
        mainNav: string;
    };
    home: {
        title: string;
        headline: string;
        description: string;
        cta: string;
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
        errors: {
            invalidInput: string;
            emailTaken: string;
            usernameTaken: string;
            createFailed: string;
            autoLoginFailed: string;
            invalidCredentials: string;
            loginFailed: string;
            rateLimited: string;
        };
    };
    profile: {
        title: string;
        sectionAccount: string;
        sectionSecurity: string;
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
        /** Connector in «1 из 3» / «1 of 3» (mobile + table cells). */
        historyOf: string;
        historyView: string;
        historyLoadFailed: string;
        /** Заголовок секции агрегатов (не путать с историей строк). */
        statsTitle: string;
        statsQuizzesCompleted: string;
        statsBestScore: string;
        statsAverageAccuracy: string;
        statsLastPlayed: string;
        /** Когда QuizResult у пользователя ещё нет. */
        statsEmpty: string;
        statsLoadFailed: string;
        changeUsernameTitle: string;
        newUsername: string;
        changeUsernameSubmit: string;
        changeUsernameSuccess: string;
        changePasswordTitle: string;
        currentPassword: string;
        newPassword: string;
        confirmNewPassword: string;
        changePasswordSubmit: string;
        changePasswordSuccess: string;
        changeAvatarTitle: string;
        avatarFile: string;
        avatarFileHint: string;
        avatarUrl: string;
        avatarUrlHint: string;
        avatarPreviewFailed: string;
        changeAvatarSubmit: string;
        clearAvatar: string;
        changeAvatarSuccess: string;
        errors: {
            invalidInput: string;
            wrongCurrentPassword: string;
            samePassword: string;
            usernameTaken: string;
            sameUsername: string;
            sameAvatar: string;
            uploadFailed: string;
            invalidImage: string;
            updateFailed: string;
            rateLimited: string;
        };
    };
    admin: {
        homeTitle: string;
        homeDescription: string;
        questionsCardDescription: string;
        usersCardDescription: string;
        /** Подписи агрегатов на хабе `/admin` (числа подставляются в JSX). */
        homeStatUsers: string;
        homeStatQuestionsActive: string;
        homeStatQuestionsInactive: string;
        homeStatSessionsToday: string;
        /** Когда COUNT на Neon не удался — хаб всё равно открывается. */
        homeCountsUnavailable: string;
        retryLoad: string;
        backToAdminHome: string;
        questionsTitle: string;
        usersTitle: string;
        /** Карточка пользователя (support, read-only). */
        userDetailDescription: string;
        backToUsers: string;
        /** Ссылка на read-only карточку пользователя из списка. */
        viewUserLink: string;
        userHistoryTitle: string;
        userHistoryEmpty: string;
        userHistoryLoadFailed: string;
        userHistoryDate: string;
        userHistoryDifficulty: string;
        userHistoryScore: string;
        userHistoryCorrect: string;
        /** Соединитель в «1 из 3» / «1 of 3». */
        userHistoryOf: string;
        signedInAs: string;
        listDescription: string;
        usersListDescription: string;
        questionsLink: string;
        usersLink: string;
        tableQuestion: string;
        tableDifficulty: string;
        tableCategory: string;
        tableOptions: string;
        tableStatus: string;
        tableCreated: string;
        tableUsername: string;
        tableEmail: string;
        tableRole: string;
        tableQuizResults: string;
        statusActive: string;
        statusInactive: string;
        /**
         * Жизненный цикл контента (publicationStatus), ортогонально isActive.
         * Не путать с statusActive/Inactive — это «выключатель витрины».
         * Badge IN_REVIEW = «На ревью»; кнопка submit ≠ badge (см. submitForReviewButton).
         */
        tablePublication: string;
        publicationDraft: string;
        publicationInReview: string;
        publicationPublished: string;
        publishButton: string;
        submitForReviewButton: string;
        returnToDraftButton: string;
        empty: string;
        /** Empty-state когда фильтры/поиск ничего не нашли (не пустая БД). */
        emptyFiltered: string;
        usersEmpty: string;
        /** Подписи GET-фильтров списка вопросов (status / difficulty / type / q). */
        filterStatusAll: string;
        /** Фильтр по publicationStatus (шаг URL-фильтра; отдельно от isActive). */
        filterPublicationAll: string;
        filterDifficultyAll: string;
        filterTypeAll: string;
        filterSearch: string;
        filterSearchPlaceholder: string;
        filterApply: string;
        filterReset: string;
        formQuestionText: string;
        formQuestionTextRu: string;
        formQuestionTextEn: string;
        formQuestionType: string;
        formQuestionTypeText: string;
        formQuestionTypeImageGuess: string;
        formPromptImage: string;
        formPromptImageFile: string;
        formPromptImageFileHint: string;
        formPromptImageCurrent: string;
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
        /**
         * Bulk-toolbar на списке вопросов (checkboxes).
         * isActive: deactivate/activate. publication: submit-for-review / publish.
         * Не hard-delete bulk. `{count}` в bulkSelected подставляется в UI.
         */
        bulkSelected: string;
        bulkSelectAll: string;
        bulkClearSelection: string;
        bulkDeactivateButton: string;
        bulkActivateButton: string;
        /** Bulk DRAFT → IN_REVIEW (quality gate в Server Action). */
        bulkSubmitForReviewButton: string;
        /** Bulk DRAFT | IN_REVIEW → PUBLISHED (тот же quality gate). */
        bulkPublishButton: string;
        /**
         * Подписи групп в contextual bulk toolbar (две оси статуса).
         * Короткие scoreboard labels — не предложения.
         */
        bulkGroupVisibility: string;
        bulkGroupPublication: string;
        /** Выбор есть, но ни один переход не применим (напр. все уже PUBLISHED+active). */
        bulkNoActionsForSelection: string;
        /** aria-label чекбокса строки. */
        bulkSelectRow: string;
        deleteButton: string;
        makeAdminButton: string;
        makeUserButton: string;
        roleUser: string;
        roleAdmin: string;
        confirmDeleteUser: string;
        confirmChangeRole: string;
        tableActions: string;
        /**
         * Триггер «⋯ / Ещё» в desktop row: прячет редкие actions
         * (activate/deactivate, delete, вторичные publication CTA).
         */
        rowMoreActions: string;
        /**
         * Предупреждения/блокеры перед publish (quality gate).
         * Коды → `getPublishQualityMessage`; UI на edit + gate в action.
         */
        publishQuality: {
            title: string;
            blockersTitle: string;
            warningsTitle: string;
            missingPromptImage: string;
            notExactlyOneCorrect: string;
            tooFewOptions: string;
            missingQuestionText: string;
            missingOptionText: string;
            duplicateOptionText: string;
            identicalQuestionLocales: string;
            identicalOptionLocales: string;
            inactiveWillStayHidden: string;
        };
        errors: {
            loadFailed: string;
            usersLoadFailed: string;
            invalidInput: string;
            notFound: string;
            exactlyOneCorrectRequired: string;
            saveFailed: string;
            uploadFailed: string;
            invalidImage: string;
            deleteFailed: string;
            deactivateFailed: string;
            activateFailed: string;
            publishFailed: string;
            submitForReviewFailed: string;
            returnToDraftFailed: string;
            invalidPublicationTransition: string;
            /** Publish/submit-for-review отклонён из‑за quality blockers. */
            publishQualityBlocked: string;
            cannotModifySelf: string;
            cannotDeleteLastAdmin: string;
            userUpdateFailed: string;
            userRoleUpdateFailed: string;
            userDeactivateFailed: string;
            userActivateFailed: string;
            rateLimited: string;
        };
    };
    quiz: {
        setupTitle: string;
        setupDescription: string;
        difficultyLabel: string;
        questionCountLabel: string;
        /** Прогресс сессии: отвечено / всего (не число вопросов в setup). */
        progressAnsweredLabel: string;
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
            rateLimited: string;
        };
    };
    leaderboard: {
        title: string;
        description: string;
        rank: string;
        player: string;
        /** Взвешенные очки (EASY=1, MEDIUM=2, HARD=3) — не путать с correctCount */
        score: string;
        /**
         * Точность: correctCount / totalQuestions.
         * Отдельно от score: очки взвешены, точность — «сколько угадал».
         */
        accuracy: string;
        /** Дата лучшего результата (QuizResult.completedAt); уже в DTO, раньше не показывали */
        date: string;
        empty: string;
        /** Пусто при активном ?difficulty= / ?period= (не путать с глобальным empty) */
        emptyFiltered: string;
        loadFailed: string;
        /** aria-label группы чипов сложности */
        filterDifficultyLabel: string;
        /** Чип «все сложности» → URL без ?difficulty= */
        filterAll: string;
        /** aria-label группы чипов периода */
        filterPeriodLabel: string;
        /** Чип all-time → URL без ?period= */
        filterPeriodAll: string;
        /** Скользящие 7×24ч */
        filterPeriodWeek: string;
        /** Скользящие 30×24ч */
        filterPeriodMonth: string;
    };
};
