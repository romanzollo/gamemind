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
        /** Primary: вход в mode lobby `/quiz` (когда нет незавершённого Daily). */
        cta: string;
        /** Secondary при in_progress Daily: уйти в lobby, не бросая сессию. */
        ctaAllModes: string;
        /**
         * Secondary Daily tease — start (available / guest→login).
         * Не полный mode CTA; anti-duplication с lobby.
         */
        dailyTease: string;
        /** Primary при in_progress: продолжить сессию Daily. */
        dailyContinue: string;
        /** Secondary при completed: результат сегодняшнего Daily. */
        dailyResult: string;
    };
    /** Ежедневный челлендж — CTA только на mode lobby `/quiz` (Scoreboard Editorial). */
    dailyChallenge: {
        /** Caps eyebrow над заголовком */
        eyebrow: string;
        title: string;
        description: string;
        /** Строка мета: сложность × число вопросов, одна попытка */
        meta: string;
        startButton: string;
        continueButton: string;
        viewResultButton: string;
        loginPrompt: string;
        loginLink: string;
        unavailablePool: string;
        /** Слот Daily занят ABANDONED-сессией: попытка дня уже потрачена. */
        attemptAbandoned: string;
        /**
         * Плейсхолдеры: {score}, {correct}, {total}.
         * Пример: «Очки: {score} · {correct}/{total}»
         */
        completedScore: string;
        /** Заголовок компактного рейтинга дня */
        boardTitle: string;
        /** Пустой рейтинг (день есть, ещё никто не финишировал) */
        boardEmpty: string;
    };
    /**
     * Timed Mode CTA — только mode lobby `/quiz`.
     * Правила count/duration — TIMED_MODE_MVP_RULES; meta в словаре держим в синхроне.
     */
    timedMode: {
        eyebrow: string;
        title: string;
        description: string;
        /** Мета: 10 Q · 60s · pick difficulty */
        meta: string;
        /**
         * Одна строка у Blitz CTA.
         * Смысл: недельный рейтинг за 7 дней; при равных очках выше скорость.
         */
        leaderboardHint: string;
        startButton: string;
        loginPrompt: string;
        loginLink: string;
    };
    /**
     * Survival Mode CTA — только mode lobby `/quiz`.
     * Правила count/bank — SURVIVAL_MODE_MVP_RULES; meta в словаре держим в синхроне.
     * Result end-of-wave: rematch + honest plaque (`?wave=cut|bank` / pool).
     */
    survivalMode: {
        eyebrow: string;
        title: string;
        description: string;
        /** Мета: 12 Q · банк 20с · без Mix */
        meta: string;
        startButton: string;
        loginPrompt: string;
        loginLink: string;
        remainingLabel: string;
        expiredLabel: string;
        /** Legacy hint; mid-wave теперь auto-submit, не freeze. */
        timeUpHint: string;
        savingAnswers: string;
        chooseAnswerHint: string;
        finishWaveButton: string;
        restartButton: string;
        /** Result primary CTA: новая волна с той же difficulty (новый run). */
        tryAgainWave: string;
        /** Result CTA: continue того же SurvivalRun. */
        nextWaveButton: string;
        /** Result plaque `?wave=bank`: все lock-in, банк = 0. */
        waveEndBankEyebrow: string;
        waveEndBankTitle: string;
        waveEndBankBody: string;
        /** Result plaque `?wave=cut`: банк = 0 до всех ответов. */
        waveEndCutEyebrow: string;
        waveEndCutTitle: string;
        waveEndCutBody: string;
        /** Result plaque: published pool difficulty исчерпан. */
        waveEndPoolEyebrow: string;
        waveEndPoolTitle: string;
        waveEndPoolBody: string;
        /** Result: hero run total (доска). */
        runScoreEyebrow: string;
        runScoreTitle: string;
        runTotalLabel: string;
        /** `{n}` = номер волны. */
        waveLineLabel: string;
        waveNotCounted: string;
        thisWaveLabel: string;
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
        /**
         * Mobile: показать весь список в открытой секции. `{count}` = всего строк.
         */
        showAll: string;
        /** Mobile: закрыть всю секцию `<details>`, не урезать до превью. */
        collapseSection: string;
        /** Заголовок секции агрегатов (не путать с историей строк). */
        statsTitle: string;
        statsQuizzesCompleted: string;
        statsBestScore: string;
        statsAverageAccuracy: string;
        statsLastPlayed: string;
        /** Когда QuizResult у пользователя ещё нет. */
        statsEmpty: string;
        statsLoadFailed: string;
        /** Сворачиваемый блок: аватар, username, пароль. */
        sectionSettings: string;
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
        /**
         * Подписи агрегатов на хабе `/admin` (числа подставляются в JSX).
         * homeStatUsers — подпись числа на карточке Users, не дублирует usersLink.
         */
        homeStatUsers: string;
        homeStatQuestionsActive: string;
        homeStatQuestionsInactive: string;
        /** Формат IMAGE_GUESS на хабе `/admin` (uppercase-лейбл, не formQuestionTypeImageGuess). */
        homeStatQuestionsImage: string;
        /** Формат TEXT на хабе `/admin` (uppercase-лейбл, не formQuestionTypeText). */
        homeStatQuestionsText: string;
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
        /** Пагинация списка вопросов (offset, URL ?page=). */
        paginationNavLabel: string;
        /** «Показаны {from}–{to} из {total}». */
        paginationSummary: string;
        /** Mobile: «{page} из {totalPages}». */
        paginationPageStatus: string;
        paginationPrev: string;
        paginationNext: string;
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
        /** Caps eyebrow Classic на lobby (как timedMode.eyebrow). */
        classicEyebrow: string;
        classicTitle: string;
        classicDescription: string;
        classicMeta: string;
        /**
         * Одна строка у Classic CTA (не модалка).
         * Смысл: в недельном рейтинге — игры за последние 7 дней.
         * Не писать «сойдёт с доски».
         */
        classicLeaderboardHint: string;
        difficultyLabel: string;
        questionCountLabel: string;
        /** Прогресс сессии: отвечено / всего (не число вопросов в setup). */
        progressAnsweredLabel: string;
        /** Timed: подпись countdown, пока время не вышло. */
        timedRemainingLabel: string;
        /** Timed: подпись на 00:00. */
        timedExpiredLabel: string;
        /** Текст подсказки при auto-save; roast plaque — на result (?clock=1). */
        timedExpiredBody: string;
        /** Timed: CTA «ещё раз» после просрочки grace. */
        timedTryAgain: string;
        /** Timed: статус пока идёт auto-submit на 00:00. */
        timedSavingAnswers: string;
        /**
         * Timed: баннер на result после auto-submit по таймеру (`?clock=1`).
         * Roast на result после finish по таймеру (?clock=1).
         */
        timedClockRoast: string;
        /** Timed roast plaque: короткий eyebrow над title. */
        timedClockRoastEyebrow: string;
        /** Timed roast plaque: display title. */
        timedClockRoastTitle: string;
        /** В разборе: вопрос без ответа (timed partial). */
        unansweredLabel: string;
        easy: string;
        medium: string;
        hard: string;
        /** Option select + чип сессии (не сложность вопроса). */
        mixed: string;
        /** Meta под select, когда выбрана Смешанная (Classic 3). */
        mixedSplitMeta3: string;
        /** Classic 5. */
        mixedSplitMeta5: string;
        /** Classic 10 и Blitz 10. */
        mixedSplitMeta10: string;
        startButton: string;
        sessionTitle: string;
        resultTitle: string;
        session: string;
        submitButton: string;
        /** Подпись для взвешенных очков (не число верных ответов) */
        scoreLabel: string;
        correctAnswersLabel: string;
        imageUnavailable: string;
        /** Под превью IMAGE_GUESS: нажмите, чтобы увеличить. */
        imageExpandHint: string;
        /** aria-label кнопки открытия лайтбокса. */
        imageExpandLabel: string;
        /** Кнопка / backdrop закрытия лайтбокса. */
        imageCloseLabel: string;
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
            /** Daily Challenge: попытка дня уже закрыта/потрачена. */
            dailyAttemptUsed: string;
            rateLimited: string;
            /** Timed mode: submit после timedEndsAt + grace. */
            timedOut: string;
            /**
             * Neon/direct pg timeout на start — не путать с rateLimited.
             * Обычно помогает повторить через пару секунд / restart dev.
             */
            dbTimeout: string;
            /** Neon/timeout при загрузке result — не путать с submitFailed. */
            resultLoadFailed: string;
            /** Разбор (JSONB) не загрузился — score уже на экране. */
            reviewLoadFailed: string;
            /** Сессия есть в БД, но первый RSC после start отдал miss / stale 404. */
            sessionLoadFailed: string;
        };
    };
    leaderboard: {
        title: string;
        /**
         * Одна строка под h1. Правила очков — scoringDetails, не сюда.
         */
        description: string;
        /** `<summary>` свёрнутых правил. */
        scoringDetailsLabel: string;
        /**
         * Тело `<details>`: веса 1/2/3, потолок Classic HARD 10, режимы раздельно.
         */
        scoringDetails: string;
        /**
         * Когда открыта неделя (default). Коротко: окно 7 дней.
         * Не писать «сойдёт с доски». Не обещать сброс в понедельник.
         */
        weekWindowHint: string;
        /**
         * Когда открыто «Всё время».
         * Смысл: это рекорды без окна в 7 дней; живая гонка — вкладка «Неделя».
         */
        allTimeHint: string;
        /**
         * На доске Blitz: при равных очках выше более быстрый забег.
         */
        blitzSpeedHint: string;
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
        /** Пусто при не-default ?difficulty= / ?period= / ?mode= */
        emptyFiltered: string;
        loadFailed: string;
        /** aria-label группы чипов режима */
        filterModeLabel: string;
        filterModeClassic: string;
        filterModeBlitz: string;
        filterModeDaily: string;
        filterModeSurvival: string;
        /** aria-label группы чипов сложности */
        filterDifficultyLabel: string;
        /** Чип «все сложности» → URL без ?difficulty= */
        filterAll: string;
        /** Короткий chip фильтра mix-сессий (`?difficulty=MIXED`). */
        filterMixed: string;
        /** aria-label группы чипов периода */
        filterPeriodLabel: string;
        /** Чип all-time → явный `?period=all` (больше не default) */
        filterPeriodAll: string;
        /** Скользящие 7×24ч — default живой доски, в URL не пишем */
        filterPeriodWeek: string;
        /** Скользящие 30×24ч */
        filterPeriodMonth: string;
    };
    /**
     * Ephemeral toasts (Sonner). Сообщения для helpers; call site может
     * передать свой текст — эти ключи = общие дефолты (profile/admin later).
     * Canon: DECISIONS → Toast Notifications MVP.
     */
    notifications: {
        successSaved: string;
        errorGeneric: string;
        /** aria-label кнопки закрытия toast. */
        closeToast: string;
        /** Admin flash `?notice=` — ключи = AdminNoticeCode. */
        question_saved: string;
        bulk_deactivated: string;
        bulk_activated: string;
        bulk_submitted: string;
        bulk_published: string;
    };
    /**
     * Achievements MVP на профиле.
     * `items` ключи = AchievementCode (стабильные slug из каталога).
     */
    achievements: {
        sectionTitle: string;
        loadFailed: string;
        locked: string;
        /** Шаблон с `{date}` — дата уже локализована в UI. */
        unlockedOn: string;
        /** Счётчик в шапке секции: `{unlocked}` / `{total}` бейджей. */
        progressCount: string;
        /**
         * Прогресс к критерию одного бейджа: `{current}` / `{target}`.
         * Не путать с `progressCount` (сколько бейджей открыто).
         */
        criteriaProgress: string;
        /**
         * Сколько осталось до цели count-критерия: `{remaining}`.
         * Показываем только при target > 1 и remaining > 0 (мотивация на mobile).
         */
        criteriaRemaining: string;
        /**
         * Affordance тапа: показать условие бейджа (desktop = title hover).
         */
        tapHint: string;
        /** Mobile: раскрыть список после превью. `{count}` = всего. */
        showAll: string;
        /**
         * Mobile: закрыть всю секцию `<details>` (не возвращать к превью).
         * Как Settings / inventory — «я закончил смотреть».
         */
        collapseSection: string;
        /** Подзаголовок unlock-toast (title = имя бейджа). */
        toastUnlocked: string;
        /**
         * Когда unlock’ов больше лимита отдельных тостов.
         * `{count}` = сколько ещё (не показаны по одному).
         */
        toastMoreSummary: string;
        items: {
            FIRST_QUIZ: { title: string; description: string };
            QUIZZES_5: { title: string; description: string };
            QUIZZES_10: { title: string; description: string };
            QUIZZES_25: { title: string; description: string };
            QUIZZES_50: { title: string; description: string };
            PERFECT_QUIZ: { title: string; description: string };
            PERFECT_3: { title: string; description: string };
            DAILY_COMPLETE: { title: string; description: string };
            DAILY_3: { title: string; description: string };
            TIMED_COMPLETE: { title: string; description: string };
            CLASSIC_AND_TIMED: { title: string; description: string };
            HIGH_ACCURACY_90: { title: string; description: string };
            POINTS_250: { title: string; description: string };
            MEDIUM_QUIZ: { title: string; description: string };
            MEDIUM_5: { title: string; description: string };
            HARD_QUIZ: { title: string; description: string };
            HARD_3: { title: string; description: string };
        };
    };
};
