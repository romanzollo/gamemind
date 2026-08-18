/**
 * Voice-pass стеммов механик 12 / w2 / w3: живая рамка вопроса, те же петли и опции.
 *
 * draftKey в БД не хранится (import не пишет metadata). Ищем TEXT-вопрос
 * по четырём RU-текстам опций, обновляем Question.text + QuestionTranslation.
 * Реимпорт запрещён: новые UUID = дубли в пуле.
 *
 * Usage:
 *   node scripts/voice-pass-mechanics-stems.cjs --write-json
 *   node scripts/voice-pass-mechanics-stems.cjs --dry-run
 *   node scripts/voice-pass-mechanics-stems.cjs
 *   node scripts/voice-pass-mechanics-stems.cjs --target=prod --dry-run
 *   node scripts/voice-pass-mechanics-stems.cjs --target=prod
 *
 * --write-json перезапишет RU/EN стеммы в трёх JSON из карты ниже.
 * После ручной правки JSON больше не вызывай --write-json — правки затрёт.
 * Apply читает уже файлы (включая твои правки).
 *
 * Canon: docs/CONTENT_PIPELINE.md; docs/QUESTION_I18N.md.
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ROOT = path.join(__dirname, '..');

const BATCH_FILES = [
    'content/drafts/batches/2026-08-12-text-mechanics-12.json',
    'content/drafts/batches/2026-08-13-text-mechanics-w2-24.json',
    'content/drafts/batches/2026-08-13-text-mechanics-w3-24.json',
];

const NOTE_TAG =
    'Voice-pass Aug 18: replace stems in place (UPDATE). Do not re-import.';

/** Новые стеммы по draftKey. Смысл и correct не трогаем. */
const STEMS = {
    'batch-2026-08-12-mech-easy-halo-shield-recharge': {
        ru: "Что в Halo делает энергетический щит в те секунды, когда по тебе никто не попадает?",
        en: "In Halo, what does the energy shield do in the seconds when nobody is hitting you?",
    },
    'batch-2026-08-12-mech-easy-minecraft-hunger-regen': {
        ru: "Что в Minecraft на Выживании нужно сделать, чтобы сердца начали восстанавливаться сами?",
        en: "In Minecraft Survival, what do you need to do so hearts start regenerating on their own?",
    },
    'batch-2026-08-12-mech-easy-botw-climb-stamina': {
        ru: "Что в Breath of the Wild происходит с выносливостью, пока Линк карабкается по скале?",
        en: "In Breath of the Wild, what happens to stamina while Link is climbing a cliff?",
    },
    'batch-2026-08-12-mech-easy-portal-momentum-fling': {
        ru: "Что Portal делает со скоростью Челл, когда она вылетает из портала после длинного падения?",
        en: "What does Portal do with Chell’s speed when she comes out of a portal after a long fall?",
    },
    'batch-2026-08-12-mech-medium-bloodborne-rally': {
        ru: "Как в Bloodborne сразу после удара вернуть часть только что снятого здоровья?",
        en: "In Bloodborne, how do you recover some of the health a hit just took off?",
    },
    'batch-2026-08-12-mech-medium-doom-glory-kill': {
        ru: "Что в Doom (2016) даёт добивание подсвеченного демона — glory kill?",
        en: "In Doom (2016), what does a glory kill on a glowing demon give you?",
    },
    'batch-2026-08-12-mech-medium-gears-active-reload': {
        ru: "Что в Gears of War даёт попадание в узкое окно на шкале перезарядки?",
        en: "In Gears of War, what do you get for hitting the narrow window on the reload bar?",
    },
    'batch-2026-08-12-mech-medium-hk-soul-from-hits': {
        ru: "Откуда в Hollow Knight берётся Душа на Фокус и заклинания?",
        en: "In Hollow Knight, where does SOUL for Focus and spells mainly come from?",
    },
    'batch-2026-08-12-mech-hard-nioh-ki-pulse': {
        ru: "Зачем в Nioh ловят Ki Pulse, когда после серии ударов Ки почти на нуле?",
        en: "In Nioh, why catch a Ki Pulse when Ki is nearly empty after a string of attacks?",
    },
    'batch-2026-08-12-mech-hard-hades-death-defiance': {
        ru: "Что в Hades будет с Загреем, если HP в нуле, а заряд Непокорности смерти ещё горит?",
        en: "In Hades, what happens to Zagreus if HP is at zero but a Death Defiance charge is still lit?",
    },
    'batch-2026-08-12-mech-hard-mh-weapon-sharpness': {
        ru: "Как в Monster Hunter бьют атаки, когда цвет остроты оружия сильно сполз вниз?",
        en: "In Monster Hunter, how do attacks hit when the weapon’s sharpness color has dropped a lot?",
    },
    'batch-2026-08-12-mech-hard-bayonetta-witch-time': {
        ru: "Что в Bayonetta включает уклон в самый последний кадр перед ударом?",
        en: "In Bayonetta, what does a last-frame dodge before a hit switch on?",
    },
    'batch-2026-08-13-mech-w2-easy-smb-grown-hit': {
        ru: "Что в классическом Super Mario Bros. происходит с уже большим Марио, если его ударили?",
        en: "In classic Super Mario Bros., what happens to Mario if he is already big when he gets hit?",
    },
    'batch-2026-08-13-mech-w2-easy-pacman-energizer': {
        ru: "Что в Pac-Man происходит с призраками сразу после большого мигающего шара в углу?",
        en: "In Pac-Man, what happens to the ghosts right after the big flashing pellet in the corner?",
    },
    'batch-2026-08-13-mech-w2-easy-tetris-line-clear': {
        ru: "Что Tetris делает с полностью заполненной горизонтальной линией?",
        en: "What does Tetris do with a completely filled horizontal line?",
    },
    'batch-2026-08-13-mech-w2-easy-superhot-time': {
        ru: "Что в SUPERHOT происходит со временем, пока ты стоишь на месте?",
        en: "In SUPERHOT, what happens to time while you are standing still?",
    },
    'batch-2026-08-13-mech-w2-easy-subnautica-oxygen': {
        ru: "Что в Subnautica делает шкала кислорода, пока плывёшь под водой без техники?",
        en: "In Subnautica, what does the oxygen bar do while you swim underwater with no vehicle?",
    },
    'batch-2026-08-13-mech-w2-easy-smash-percent-knock': {
        ru: "Что в Super Smash Bros. значит высокий процент на портрете для следующего сильного удара?",
        en: "In Super Smash Bros., what does a high percent on the portrait mean for the next strong hit?",
    },
    'batch-2026-08-13-mech-w2-easy-stardew-energy': {
        ru: "Что в Stardew Valley происходит с энергией, пока копаешь, рубишь и поливаешь?",
        en: "In Stardew Valley, what happens to energy while you dig, chop, and water?",
    },
    'batch-2026-08-13-mech-w2-easy-gta-wanted-stars': {
        ru: "Как в Grand Theft Auto меняется погоня, когда звёзд розыска становится больше?",
        en: "In Grand Theft Auto, how does the chase change as the wanted stars pile up?",
    },
    'batch-2026-08-13-mech-w2-med-mk-drift-miniturbo': {
        ru: "Что в современных Mario Kart даёт долгий занос, если отпустить его на искрах?",
        en: "In modern Mario Kart, what does a long drift give you if you release it on sparks?",
    },
    'batch-2026-08-13-mech-w2-med-rocket-league-boost': {
        ru: "Зачем в Rocket League подбирать светящиеся подушки и шары на арене?",
        en: "In Rocket League, why pick up the glowing pads and orbs on the arena?",
    },
    'batch-2026-08-13-mech-w2-med-bioshock-eve': {
        ru: "Что в BioShock тратится, когда запускаешь плазмид в бою?",
        en: "In BioShock, what gets spent when you fire a plasmid in combat?",
    },
    'batch-2026-08-13-mech-w2-med-dishonored-mana': {
        ru: "Что в Dishonored ограничивает, как часто можно использовать сверхъестественные силы?",
        en: "In Dishonored, what limits how often you can use supernatural powers?",
    },
    'batch-2026-08-13-mech-w2-med-dead-space-stasis': {
        ru: "Что в Dead Space делает луч stasis с некроморфом?",
        en: "In Dead Space, what does the stasis beam do to a necromorph?",
    },
    'batch-2026-08-13-mech-w2-med-cuphead-pink-parry': {
        ru: "Что в Cuphead даёт прыжок в такт по розовому снаряду?",
        en: "In Cuphead, what do you get for jumping on a pink projectile on the beat?",
    },
    'batch-2026-08-13-mech-w2-med-sts-energy': {
        ru: "Что в Slay the Spire ограничивает, сколько карт можно разыграть за один ход?",
        en: "In Slay the Spire, what limits how many cards you can play in one turn?",
    },
    'batch-2026-08-13-mech-w2-med-fallout-vats-ap': {
        ru: "Что в Fallout 3 / New Vegas / 4 тратится на выстрелы по частям тела в режиме V.A.T.S., где время почти замирает?",
        en: "In Fallout 3 / New Vegas / 4, what is spent on shots to body parts in V.A.T.S., where time almost freezes?",
    },
    'batch-2026-08-13-mech-w2-hard-sifu-age-on-death': {
        ru: "Что в Sifu происходит с героем, если после смерти принять воскрешение и продолжить бой?",
        en: "In Sifu, what happens to the hero if you take the resurrection after death and keep fighting?",
    },
    'batch-2026-08-13-mech-w2-hard-returnal-malfunction': {
        ru: "Какой риск в Returnal несёт расходник или перегруз станка за лишнюю награду?",
        en: "In Returnal, what risk comes with a consumable or overloading the fabricator for extra reward?",
    },
    'batch-2026-08-13-mech-w2-hard-ftl-power-grid': {
        ru: "Зачем в FTL в бою перекидывают энергию реактора между щитами, оружием и двигателями?",
        en: "In FTL, why shuffle reactor power between shields, weapons, and engines in a fight?",
    },
    'batch-2026-08-13-mech-w2-hard-itb-attack-telegraph': {
        ru: "Что в Into the Breach заранее видно на клетках — ещё до хода твоих мехов?",
        en: "In Into the Breach, what is already visible on the tiles — before your mechs’ turn?",
    },
    'batch-2026-08-13-mech-w2-hard-darkest-dungeon-stress': {
        ru: "Что в Darkest Dungeon случается с героем, когда шкала стресса забита до упора?",
        en: "In Darkest Dungeon, what happens to a hero when the stress bar is maxed out?",
    },
    'batch-2026-08-13-mech-w2-hard-som-orc-kill-you': {
        ru: "Что в Middle-earth: Shadow of Mordor происходит с урком, который сумел тебя убить?",
        en: "In Middle-earth: Shadow of Mordor, what happens to an orc who managed to kill you?",
    },
    'batch-2026-08-13-mech-w2-hard-cotnd-miss-beat': {
        ru: "Что в Crypt of the NecroDancer будет за шаг мимо доли музыки?",
        en: "In Crypt of the NecroDancer, what happens if you step off the beat?",
    },
    'batch-2026-08-13-mech-w2-hard-baba-rule-blocks': {
        ru: "Что Baba Is You делает с правилами уровня, если сложить на поле новую фразу вроде «флаг есть победа»?",
        en: "What does Baba Is You do with the level’s rules if you arrange the words into a new sentence like “flag is win”?",
    },
    'batch-2026-08-13-mech-w3-easy-katamari-roll-grow': {
        ru: "Что в Katamari Damacy происходит с предметом и шаром, когда шар наезжает на вещь меньше себя?",
        en: "In Katamari Damacy, what happens to the object and the ball when the ball rolls over something smaller than itself?",
    },
    'batch-2026-08-13-mech-w3-easy-fortnite-storm-damage': {
        ru: "Что в Fortnite Battle Royale делает шторм со здоровьем, если остаться вне круга?",
        en: "In Fortnite Battle Royale, what does the storm do to your health if you stay outside the circle?",
    },
    'batch-2026-08-13-mech-w3-easy-sims-needs-mood': {
        ru: "Что в The Sims будет с симом, если долго не закрывать голод, гигиену и туалет?",
        en: "In The Sims, what happens to a Sim if you ignore hunger, hygiene, and bladder for a long time?",
    },
    'batch-2026-08-13-mech-w3-easy-gow-axe-recall': {
        ru: "Что в God of War (2018) делает топор Левиафан по пути назад, когда призываешь его после броска?",
        en: "In God of War (2018), what does the Leviathan Axe do on the way back when you recall it after a throw?",
    },
    'batch-2026-08-13-mech-w3-easy-amongus-body-report': {
        ru: "Что в Among Us начинается сразу после report по найденному телу?",
        en: "In Among Us, what starts right after you report a body you found?",
    },
    'batch-2026-08-13-mech-w3-easy-hotline-one-hit': {
        ru: "Что в Hotline Miami будет с зачисткой, если вас хоть раз ударили?",
        en: "In Hotline Miami, what happens to the takedown if you get hit even once?",
    },
    'batch-2026-08-13-mech-w3-easy-metroid-ball-tunnels': {
        ru: "Зачем в классическом Metroid Самус сворачивается в маленький шар?",
        en: "In classic Metroid, why does Samus curl into a small ball?",
    },
    'batch-2026-08-13-mech-w3-easy-beatsaber-slash-direction': {
        ru: "Что в Beat Saber нужно сделать с цветным блоком, чтобы удар засчитали чисто?",
        en: "In Beat Saber, what do you need to do with a colored block for the slash to count clean?",
    },
    'batch-2026-08-13-mech-w3-med-p5-weakness-onemore': {
        ru: "Что в Persona 5 даёт удар по слабости врага — в том же ходе?",
        en: "In Persona 5, what does hitting an enemy’s weakness give you in that same turn?",
    },
    'batch-2026-08-13-mech-w3-med-xcom-high-cover': {
        ru: "Что в XCOM даёт солдату высокое укрытие, пока его не обошли с фланга?",
        en: "In XCOM, what does high cover give a soldier until they are flanked?",
    },
    'batch-2026-08-13-mech-w3-med-re-inventory-slots': {
        ru: "Зачем в классическом Resident Evil лишнее кладут в сундук, а не несут всё с собой?",
        en: "In classic Resident Evil, why stash extras in the item box instead of carrying everything?",
    },
    'batch-2026-08-13-mech-w3-med-alanwake-flashlight-burn': {
        ru: "Что в Alan Wake нужно сделать с Одержимым, прежде чем пули начинают ему по-настоящему вредить?",
        en: "In Alan Wake, what do you need to do to a Taken before bullets actually start hurting it?",
    },
    'batch-2026-08-13-mech-w3-med-gungeon-blank': {
        ru: "Зачем в Enter the Gungeon тратят редкий холостой патрон в комнате, полной пуль?",
        en: "In Enter the Gungeon, why spend a rare blank in a room full of bullets?",
    },
    'batch-2026-08-13-mech-w3-med-witcher-toxicity': {
        ru: "Что в The Witcher 3 ограничивает, сколько зелий можно выпить подряд?",
        en: "In The Witcher 3, what limits how many potions you can drink back-to-back?",
    },
    'batch-2026-08-13-mech-w3-med-valheim-food-caps': {
        ru: "Что в Valheim даёт еда поверх сытости?",
        en: "In Valheim, what does food give you on top of being full?",
    },
    'batch-2026-08-13-mech-w3-med-pikmin-sunset-return': {
        ru: "Что в Pikmin нужно успеть сделать с пикминами к закату?",
        en: "In Pikmin, what do you need to do with your Pikmin before sunset?",
    },
    'batch-2026-08-13-mech-w3-hard-bb-insight-perception': {
        ru: "Что в Bloodborne меняется в мире, когда охотник копит много озарения?",
        en: "In Bloodborne, what changes in the world when a hunter hoards a lot of Insight?",
    },
    'batch-2026-08-13-mech-w3-hard-mgs-alert-phases': {
        ru: "Что в Metal Gear Solid происходит с тревогой, если после обнаружения спрятаться и подождать?",
        en: "In Metal Gear Solid, what happens to the alert if you get spotted, then hide and wait?",
    },
    'batch-2026-08-13-mech-w3-hard-papersplease-daily-rules': {
        ru: "Что в Papers, Please меняется в правилах пропуска, когда на календаре новый день смены?",
        en: "In Papers, Please, what changes about the checkpoint rules when the calendar flips to a new shift day?",
    },
    'batch-2026-08-13-mech-w3-hard-ror-time-difficulty': {
        ru: "Что в Risk of Rain делает сложность со временем, даже если почти никого не убивать?",
        en: "In Risk of Rain, what does difficulty do over time, even if you barely kill anyone?",
    },
    'batch-2026-08-13-mech-w3-hard-ikaruga-polarity': {
        ru: "Зачем в Ikaruga переключают цвет корабля посреди потока пуль?",
        en: "In Ikaruga, why switch the ship’s color in the middle of a bullet stream?",
    },
    'batch-2026-08-13-mech-w3-hard-dontstarve-darkness': {
        ru: "Что в Don't Starve будет, если ночью остаться совсем без света?",
        en: "In Don't Starve, what happens if you stay in total darkness at night with no light?",
    },
    'batch-2026-08-13-mech-w3-hard-dos2-armor-cc': {
        ru: "Что в Divinity: Original Sin 2 нужно сломать, прежде чем стан или нокдаун по-настоящему сядет?",
        en: "In Divinity: Original Sin 2, what do you need to break before a stun or knockdown actually sticks?",
    },
    'batch-2026-08-13-mech-w3-hard-inscryption-blood-sac': {
        ru: "Чем в Inscryption платят за существо с ценой в кровь?",
        en: "In Inscryption, how do you pay for a creature with a blood cost?",
    },
};

function loadEnvFile(fileName, env) {
    const filePath = path.join(ROOT, fileName);
    if (!fs.existsSync(filePath)) return;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (!(key in env)) env[key] = value;
    }
}

function hostnameOf(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

function parseArgs(argv) {
    return {
        writeJson: argv.includes('--write-json'),
        dryRun: argv.includes('--dry-run'),
        target: argv.includes('--target=prod') ? 'prod' : 'local',
    };
}

function resolveConnectionString(target, env) {
    if (target === 'prod') {
        const url = env.PROD_DATABASE_URL_UNPOOLED;
        if (!url) {
            throw new Error(
                'PROD_DATABASE_URL_UNPOOLED is required for --target=prod',
            );
        }
        const host = hostnameOf(url);
        if (host.includes('jolly-river')) {
            throw new Error(
                `Refusing --target=prod: host looks like local Neon (${host})`,
            );
        }
        return url;
    }

    const url = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
    }
    return url;
}

function optionRuTexts(question) {
    return question.options.map((option) => option.translations.ru.text.trim());
}

function loadBatchQuestions() {
    const questions = [];
    for (const rel of BATCH_FILES) {
        const abs = path.join(ROOT, rel);
        const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));
        for (const question of batch.questions) {
            questions.push({
                file: rel,
                draftKey: question.draftKey,
                difficulty: question.difficulty,
                ru: question.translations.ru.text.trim(),
                en: question.translations.en.text.trim(),
                optionRu: optionRuTexts(question),
            });
        }
    }
    return questions;
}

function writeJsonFromMap() {
    let updated = 0;
    let missing = 0;

    for (const rel of BATCH_FILES) {
        const abs = path.join(ROOT, rel);
        const batch = JSON.parse(fs.readFileSync(abs, 'utf8'));

        if (
            typeof batch.notes === 'string' &&
            !batch.notes.includes('Voice-pass Aug 18')
        ) {
            batch.notes = `${batch.notes} ${NOTE_TAG}`;
        }

        for (const question of batch.questions) {
            const stem = STEMS[question.draftKey];
            if (!stem) {
                console.error(`No stem map for ${question.draftKey}`);
                missing += 1;
                continue;
            }
            question.translations.ru.text = stem.ru;
            question.translations.en.text = stem.en;
            updated += 1;
        }

        fs.writeFileSync(abs, `${JSON.stringify(batch, null, 2)}\n`, 'utf8');
        console.log(`Wrote ${rel}`);
    }

    console.log(`Stems written: ${updated}. Missing map: ${missing}.`);
    if (missing > 0) process.exitCode = 1;
}

async function withFreshClient(connectionString, run) {
    const client = new Client({
        connectionString,
        connectionTimeoutMillis: 20_000,
        ssl: { rejectUnauthorized: false },
    });
    client.on('error', () => undefined);
    await client.connect();
    try {
        return await run(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function findQuestionIds(connectionString, optionRu, difficulty) {
    return withFreshClient(connectionString, async (client) => {
        const result = await client.query(
            `
            SELECT q.id
            FROM "Question" q
            WHERE q."type" = 'TEXT'::"QuestionType"
              AND q."difficulty" = $2::"Difficulty"
              AND (
                SELECT COUNT(*)::int
                FROM "AnswerOption" ao
                WHERE ao."questionId" = q.id
              ) = 4
              AND (
                SELECT COUNT(*)::int
                FROM "AnswerOption" ao
                INNER JOIN "AnswerOptionTranslation" aot
                    ON aot."optionId" = ao.id
                   AND aot.locale = 'ru'::"ContentLocale"
                WHERE ao."questionId" = q.id
                  AND aot.text = ANY($1::text[])
              ) = 4
            `,
            [optionRu, difficulty],
        );
        return result.rows.map((row) => row.id);
    });
}

async function applyStem(connectionString, id, ru, en) {
    return withFreshClient(connectionString, async (client) => {
        const q = await client.query(
            `
            UPDATE "Question"
            SET text = $2, "updatedAt" = NOW()
            WHERE id = $1
            `,
            [id, ru],
        );
        const ruN = await client.query(
            `
            UPDATE "QuestionTranslation"
            SET text = $2
            WHERE "questionId" = $1 AND locale = 'ru'::"ContentLocale"
            `,
            [id, ru],
        );
        const enN = await client.query(
            `
            UPDATE "QuestionTranslation"
            SET text = $2
            WHERE "questionId" = $1 AND locale = 'en'::"ContentLocale"
            `,
            [id, en],
        );
        return {
            question: q.rowCount,
            ru: ruN.rowCount,
            en: enN.rowCount,
        };
    });
}

async function syncDatabase(target, dryRun) {
    const env = { ...process.env };
    loadEnvFile('.env', env);
    loadEnvFile('.env.local', env);
    const connectionString = resolveConnectionString(target, env);
    const host = hostnameOf(connectionString);
    const questions = loadBatchQuestions();

    console.log(`Voice-pass stems (${target}${dryRun ? ', dry-run' : ''})`);
    console.log(`  host: ${host || '(unknown)'}`);
    console.log(`  questions in JSON: ${questions.length}`);

    let matched = 0;
    let unchanged = 0;
    let missing = 0;
    let dupes = 0;
    let updated = 0;

    for (const item of questions) {
        const ids = await findQuestionIds(
            connectionString,
            item.optionRu,
            item.difficulty,
        );

        if (ids.length === 0) {
            missing += 1;
            console.error(`MISS ${item.draftKey} (${item.file})`);
            continue;
        }

        if (ids.length > 1) {
            dupes += 1;
            console.warn(`DUP ${item.draftKey}: ${ids.length} rows`);
        }

        matched += ids.length;

        for (const id of ids) {
            const current = await withFreshClient(connectionString, (client) =>
                client.query(
                    `
                    SELECT
                        q.text AS legacy,
                        ru.text AS ru,
                        en.text AS en
                    FROM "Question" q
                    LEFT JOIN "QuestionTranslation" ru
                        ON ru."questionId" = q.id AND ru.locale = 'ru'::"ContentLocale"
                    LEFT JOIN "QuestionTranslation" en
                        ON en."questionId" = q.id AND en.locale = 'en'::"ContentLocale"
                    WHERE q.id = $1
                    `,
                    [id],
                ),
            );
            const row = current.rows[0];
            const same =
                row?.ru === item.ru &&
                row?.en === item.en &&
                row?.legacy === item.ru;

            if (same) {
                unchanged += 1;
                continue;
            }

            if (dryRun) {
                console.log(`WOULD ${item.draftKey} ${id.slice(0, 8)}…`);
                console.log(`  old ru: ${row?.ru ?? '(none)'}`);
                console.log(`  new ru: ${item.ru}`);
                updated += 1;
                continue;
            }

            const counts = await applyStem(
                connectionString,
                id,
                item.ru,
                item.en,
            );
            console.log(
                `OK ${item.draftKey} ${id.slice(0, 8)}… q=${counts.question} ru=${counts.ru} en=${counts.en}`,
            );
            updated += 1;
        }
    }

    console.log('\nSummary:');
    console.log(`  JSON questions: ${questions.length}`);
    console.log(`  DB rows matched: ${matched}`);
    console.log(`  already same: ${unchanged}`);
    console.log(`  ${dryRun ? 'would update' : 'updated'}: ${updated}`);
    console.log(`  missing: ${missing}`);
    console.log(`  duplicate fingerprints: ${dupes}`);

    if (missing > 0) process.exitCode = 1;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));

    if (args.writeJson && (args.dryRun || args.target === 'prod')) {
        console.error(
            'Use --write-json alone (it only touches git JSON, not Neon).',
        );
        process.exit(1);
    }

    if (args.writeJson) {
        writeJsonFromMap();
        return;
    }

    await syncDatabase(args.target, args.dryRun);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
