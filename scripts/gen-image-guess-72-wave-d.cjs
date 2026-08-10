/**
 * One-shot generator: IMAGE_GUESS ×72 manifest + CHECKLIST for Wave D.
 * Run: node scripts/gen-image-guess-72-wave-d.cjs
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** @typedef {{ stem: string, game: string, folder: 'easy'|'medium'|'hard', hint: string, distractors: [string, string, string] }} Entry */

/** @type {Entry[]} */
const EASY = [
  { stem: 'half-life-2', game: 'Half-Life 2', folder: 'easy', hint: 'City 17, Gravity Gun / гражданские в масках Combine. Узнаваемый HL2-кадр, без меню.', distractors: ['Half-Life: Alyx', 'Doom (2016)', 'BioShock'] },
  { stem: 'gta-san-andreas', game: 'Grand Theft Auto: San Andreas', folder: 'easy', hint: 'CJ / Grove Street / San Andreas 2000-х. НЕ GTA V / Los Santos HD.', distractors: ['Grand Theft Auto V', 'Grand Theft Auto IV', 'Saints Row 2'] },
  { stem: 'gears-of-war', game: 'Gears of War', folder: 'easy', hint: 'Marcus в тяжёлой броне, Lancer с бензопилой, укрытия. Классический Gears.', distractors: ['Halo: Combat Evolved', 'Killzone 2', 'Resistance: Fall of Man'] },
  { stem: 'resident-evil-2-remake', game: 'Resident Evil 2 (Remake)', folder: 'easy', hint: 'RPD / Леон или Клэр, зомби, ремейк-графика. НЕ деревня RE4.', distractors: ['Resident Evil 4', 'Resident Evil 7', 'Silent Hill 2'] },
  { stem: 'stalker-shadow-of-chernobyl', game: 'S.T.A.L.K.E.R.: Shadow of Chernobyl', folder: 'easy', hint: 'Зона, сталкер в противогазе/экзоскелете, аномалии, постапок Чернобыля.', distractors: ['Metro 2033', 'Fallout 3', 'Escape from Tarkov'] },
  { stem: 'counter-strike-2', game: 'Counter-Strike 2', folder: 'easy', hint: 'Dust II / bomb site, Source 2 освещение, CT/T модели. Узнаваемый CS.', distractors: ['Valorant', 'Rainbow Six Siege', 'Overwatch 2'] },
  { stem: 'diablo-2', game: 'Diablo II', folder: 'easy', hint: 'Изометрия, Tristram/подземелье, тёмный ARPG 2000. НЕ Diablo IV.', distractors: ['Diablo IV', 'Path of Exile', 'Torchlight II'] },
  { stem: 'hitman-blood-money', game: 'Hitman: Blood Money', folder: 'easy', hint: 'Агент 47 в костюме, миссия/локация Blood Money (не WOA UI).', distractors: ['Hitman (2016)', 'Splinter Cell', 'Metal Gear Solid 2'] },
  { stem: 'zelda-breath-of-the-wild', game: 'The Legend of Zelda: Breath of the Wild', folder: 'easy', hint: 'Открытый Хайрул, Линк, параплан/башни. НЕ NES Zelda, НЕ TotK fuse-спагетти.', distractors: ['The Legend of Zelda: Tears of the Kingdom', 'Horizon Zero Dawn', 'Genshin Impact'] },
  { stem: 'dragon-age-origins', game: 'Dragon Age: Origins', folder: 'easy', hint: 'Фэнтези BioWare, партия, тёмный фэнтези UI Origins (не Inquisition open world).', distractors: ['Dragon Age: Inquisition', 'The Witcher 3', 'Baldur’s Gate 3'] },
  { stem: 'civilization-vi', game: 'Civilization VI', folder: 'easy', hint: 'Карта гексов, города/районы Civ VI, пошаговая стратегия. Узнаваемый UI.', distractors: ['Civilization V', 'Age of Empires II', 'Humankind'] },
  { stem: 'atomic-heart', game: 'Atomic Heart', folder: 'easy', hint: 'Советский ретрофутуризм, роботы-балерины / Предприятие 3826.', distractors: ['BioShock', 'Prey (2017)', 'Wolfenstein: The New Order'] },
  { stem: 'duke-nukem-3d', game: 'Duke Nukem 3D', folder: 'easy', hint: 'VGA FPS 90-х, Дюк, Pig Cops / город. Build-эстетика.', distractors: ['Doom (1993)', 'Quake', 'Shadow Warrior (classic)'] },
  { stem: 'tomb-raider-2013', game: 'Tomb Raider (2013)', folder: 'easy', hint: 'Лара reboot, остров Яматай, survival. НЕ классика PS1 dual pistols only.', distractors: ['Uncharted 4', 'Rise of the Tomb Raider', 'Horizon Zero Dawn'] },
  { stem: 'hogwarts-legacy', game: 'Hogwarts Legacy', folder: 'easy', hint: 'Замок Хогвартс / магл vs магия, мантия ученика, открытый двор.', distractors: ['Harry Potter and the Chamber of Secrets', 'Elden Ring', 'Assassin’s Creed Valhalla'] },
  { stem: 'nfs-most-wanted', game: 'Need for Speed: Most Wanted (2005)', folder: 'easy', hint: 'Погоня полиции, чёрный список, аркадный NFS 2005. НЕ Heat/Unbound.', distractors: ['Need for Speed: Heat', 'Burnout Paradise', 'Forza Horizon 5'] },
  { stem: 'super-mario-64', game: 'Super Mario 64', folder: 'easy', hint: 'Замок Пич, N64 low-poly Марио, картины-миры. НЕ Odyssey.', distractors: ['Super Mario Odyssey', 'Super Mario Sunshine', 'Banjo-Kazooie'] },
  { stem: 'spyro-the-dragon', game: 'Spyro the Dragon', folder: 'easy', hint: 'Фиолетовый дракон, PS1 платформер, яркие миры Insomniac.', distractors: ['Crash Bandicoot', 'Jak and Daxter', 'Rayman 2'] },
  { stem: 'super-mario-galaxy', game: 'Super Mario Galaxy', folder: 'easy', hint: 'Планеты, гравитация, Марио в космосе на Wii.', distractors: ['Super Mario 64', 'Super Mario Odyssey', 'Kirby and the Forgotten Land'] },
  { stem: 'left-4-dead-2', game: 'Left 4 Dead 2', folder: 'easy', hint: 'Четверо выживших, зомби-орда, Valve co-op кампания.', distractors: ['Back 4 Blood', 'Resident Evil 5', 'Dying Light'] },
  { stem: 'fable-2', game: 'Fable II', folder: 'easy', hint: 'Альбион, герой + собака, сказочный Xbox 360 RPG.', distractors: ['Fable (2004)', 'The Elder Scrolls IV: Oblivion', 'Dragon Age: Origins'] },
  { stem: 'cs-go', game: 'Counter-Strike: Global Offensive', folder: 'easy', hint: 'Классический CS:GO UI/модели до CS2. Можно Mirage/Inferno.', distractors: ['Counter-Strike 2', 'Valorant', 'Team Fortress 2'] },
  { stem: 'diablo-4', game: 'Diablo IV', folder: 'easy', hint: 'Современный изометрический Sanctuary, Diablo IV UI/графика.', distractors: ['Diablo II', 'Diablo III', 'Last Epoch'] },
  { stem: 'gears-of-war-3', game: 'Gears of War 3', folder: 'easy', hint: 'Финал оригинальной трилогии: COG, тяжёлые перестрелки, Lancer.', distractors: ['Gears 5', 'Gears of War (2006)', 'Army of Two'] },
];

/** @type {Entry[]} */
const MEDIUM = [
  { stem: 'half-life-alyx', game: 'Half-Life: Alyx', folder: 'medium', hint: 'VR HL: Alyx с резаком/перчатками, City 17 близко. Узнаваемый Alyx-кадр.', distractors: ['Half-Life 2', 'Boneworks', 'Lone Echo'] },
  { stem: 'gta-iv', game: 'Grand Theft Auto IV', folder: 'medium', hint: 'Liberty City / Niko, серый реализм IV. НЕ Vice City, НЕ V.', distractors: ['Grand Theft Auto V', 'Grand Theft Auto: Vice City', 'Mafia II'] },
  { stem: 'resident-evil-village', game: 'Resident Evil Village', folder: 'medium', hint: 'Деревня/замок Дмитриеску, Итан, Village. НЕ RE4 деревня.', distractors: ['Resident Evil 4', 'Resident Evil 7', 'The Evil Within'] },
  { stem: 'stalker-call-of-pripyat', game: 'S.T.A.L.K.E.R.: Call of Pripyat', folder: 'medium', hint: 'Припять / Зона, военный/сталкер CoP. Отличимо от SoC UI если можно.', distractors: ['S.T.A.L.K.E.R.: Shadow of Chernobyl', 'Metro: Last Light', 'Chernobylite'] },
  { stem: 'hitman-world-of-assassination', game: 'Hitman World of Assassination', folder: 'medium', hint: 'Современный Hitman WOA: 47, маскировка, уровни IOI (Париж/Дубай и т.п.).', distractors: ['Hitman: Blood Money', 'Hitman: Absolution', 'Assassin’s Creed'] },
  { stem: 'zelda-ocarina-of-time', game: 'The Legend of Zelda: Ocarina of Time', folder: 'medium', hint: 'N64 Линк, Хайрул/Замок/Храм времени. НЕ BotW open wild.', distractors: ['The Legend of Zelda: Breath of the Wild', 'The Legend of Zelda: Twilight Princess', 'Okami'] },
  { stem: 'dragon-age-inquisition', game: 'Dragon Age: Inquisition', folder: 'medium', hint: 'Инквизиция, открытые зоны, Skyhold / тактический бой Frostbite.', distractors: ['Dragon Age: Origins', 'Mass Effect: Andromeda', 'The Witcher 3'] },
  { stem: 'civilization-v', game: 'Civilization V', folder: 'medium', hint: 'Civ V гексы, один юнит на клетку, UI V (не VI districts).', distractors: ['Civilization VI', 'Civilization IV', 'Endless Legend'] },
  { stem: 'tomb-raider-anniversary', game: 'Tomb Raider: Anniversary', folder: 'medium', hint: 'Классическая Лара / ремейк TR1 Anniversary, гробницы. НЕ 2013 survivor.', distractors: ['Tomb Raider (2013)', 'Tomb Raider (1996)', 'Uncharted 2'] },
  { stem: 'nfs-underground-2', game: 'Need for Speed: Underground 2', folder: 'medium', hint: 'Ночной тюнинг, винил, open-city UG2. Эстетика 2004.', distractors: ['Need for Speed: Most Wanted', 'Forza Horizon 4', 'Juiced'] },
  { stem: 'metroid-prime', game: 'Metroid Prime', folder: 'medium', hint: 'Самус FPS, visor HUD, Tallon IV. GameCube Prime.', distractors: ['Halo: Combat Evolved', 'Metroid Dread', 'Doom (2016)'] },
  { stem: 'devil-may-cry', game: 'Devil May Cry', folder: 'medium', hint: 'Данте, стильный action, демоны, PS2-эстетика DMC1/3.', distractors: ['Bayonetta', 'God of War III', 'Ninja Gaiden'] },
  { stem: 'ratchet-and-clank', game: 'Ratchet & Clank', folder: 'medium', hint: 'Ломбакс + робот, гаджеты, яркий платформер Insomniac.', distractors: ['Jak and Daxter', 'Crash Bandicoot', 'Spyro the Dragon'] },
  { stem: 'alan-wake', game: 'Alan Wake', folder: 'medium', hint: 'Писатель с фонарём, Bright Falls, тьма/horror Remedy.', distractors: ['Control', 'Max Payne', 'Silent Hill 2'] },
  { stem: 'forza-horizon-4', game: 'Forza Horizon 4', folder: 'medium', hint: 'Британский open-world фестиваль, сезоны, Forza Horizon.', distractors: ['Forza Motorsport 7', 'Need for Speed: Heat', 'Gran Turismo 7'] },
  { stem: 'fable', game: 'Fable', folder: 'medium', hint: 'Оригинальный Fable / Albion, герой гильдии, Xbox classic.', distractors: ['Fable II', 'Fable III', 'The Elder Scrolls III: Morrowind'] },
  { stem: 'half-life-1', game: 'Half-Life', folder: 'medium', hint: 'Black Mesa, GoldSrc коридоры, HEV / учёные 1998.', distractors: ['Half-Life 2', 'Quake II', 'System Shock 2'] },
  { stem: 'gta-vice-city', game: 'Grand Theft Auto: Vice City', folder: 'medium', hint: '80-е Vice City, пальмы, пастель, Томми. НЕ V / IV.', distractors: ['Grand Theft Auto: San Andreas', 'Grand Theft Auto V', 'Scarface: The World Is Yours'] },
  { stem: 'resident-evil-7', game: 'Resident Evil 7: Biohazard', folder: 'medium', hint: 'От первого лица, дом Бейкеров, Louisiana horror. НЕ Village замок.', distractors: ['Resident Evil Village', 'Outlast', 'Resident Evil 2 (Remake)'] },
  { stem: 'diablo-3', game: 'Diablo III', folder: 'medium', hint: 'Яркий изометрический Diablo III, умения/UI D3.', distractors: ['Diablo II', 'Diablo IV', 'Marvel Heroes'] },
  { stem: 'zelda-tears-of-the-kingdom', game: 'The Legend of Zelda: Tears of the Kingdom', folder: 'medium', hint: 'Небесные острова / Ultrahand постройки. Отличимо от BotW.', distractors: ['The Legend of Zelda: Breath of the Wild', 'The Legend of Zelda: Skyward Sword', 'Genshin Impact'] },
  { stem: 'nfs-heat', game: 'Need for Speed Heat', folder: 'medium', hint: 'День/ночь Heat, полиция ночью, Palm City эстетика.', distractors: ['Need for Speed: Most Wanted', 'Need for Speed Unbound', 'The Crew 2'] },
  { stem: 'sea-of-thieves', game: 'Sea of Thieves', folder: 'medium', hint: 'Пиратские корабли Rare, яркое море, Xbox/PC co-op.', distractors: ['Assassin’s Creed IV: Black Flag', 'Skull and Bones', 'Raft'] },
  { stem: 'uncharted-2', game: 'Uncharted 2: Among Thieves', folder: 'medium', hint: 'Нейтан Дрейк, Непал/поезд — культовый Uncharted 2. НЕ 4.', distractors: ['Uncharted 4', 'Tomb Raider (2013)', 'The Last of Us'] },
];

/** @type {Entry[]} */
const HARD = [
  { stem: 'phantasy-star-iv', game: 'Phantasy Star IV', folder: 'hard', hint: '16-bit JRPG Sega, sci-fi фэнтези, меню/спрайты Genesis.', distractors: ['Chrono Trigger', 'Final Fantasy VI', 'Shining Force II'] },
  { stem: 'gravity-rush', game: 'Gravity Rush', folder: 'hard', hint: 'Кат / гравитация, летающий город Vita. Узнаваемый стиль.', distractors: ['Infamous Second Son', 'Jet Set Radio', 'Mirror’s Edge'] },
  { stem: 'patapon', game: 'Patapon', folder: 'hard', hint: 'Ритм-армия one-eyed tribe, PSP силуэты/барабаны.', distractors: ['Lemnis Gate', 'Crypt of the NecroDancer', 'Final Fantasy Tactics'] },
  { stem: 'jade-empire', game: 'Jade Empire', folder: 'hard', hint: 'Уся BioWare, original Xbox, восточный фэнтези action-RPG.', distractors: ['Dragon Age: Origins', 'Kung Fu Chaos', 'Sleeping Dogs'] },
  { stem: 'streets-of-rage-2', game: 'Streets of Rage 2', folder: 'hard', hint: '16-bit beat ’em up, Axel/Blaze, улицы Sega.', distractors: ['Final Fight', 'Streets of Rage 4', 'Double Dragon Neon'] },
  { stem: 'silent-hill-3', game: 'Silent Hill 3', folder: 'hard', hint: 'Хедер / туманный Silent Hill, PS2 horror. НЕ SH2 Джеймс.', distractors: ['Silent Hill 2', 'Resident Evil 4', 'Fatal Frame'] },
  { stem: 'demon-souls', game: 'Demon’s Souls', folder: 'hard', hint: 'Boletaria / оригинальный PS3 или Remake — один стиль. НЕ Dark Souls.', distractors: ['Dark Souls', 'Bloodborne', 'Elden Ring'] },
  { stem: 'quantum-break', game: 'Quantum Break', folder: 'hard', hint: 'Remedy time-powers, живые вставки/сериал-эстетика Xbox One.', distractors: ['Control', 'Max Payne 3', 'Alan Wake'] },
  { stem: 'bayonetta', game: 'Bayonetta', folder: 'hard', hint: 'Ведьма с пистолетами на каблуках, stylish action Platinum.', distractors: ['Devil May Cry 5', 'NieR:Automata', 'Wonderful 101'] },
  { stem: 'fire-emblem-three-houses', game: 'Fire Emblem: Three Houses', folder: 'hard', hint: 'Монастырь Гаррег Мах / тактическая сетка Three Houses.', distractors: ['Persona 5', 'Final Fantasy Tactics', 'XCOM 2'] },
  { stem: 'pikmin', game: 'Pikmin', folder: 'hard', hint: 'Капитан Олимар, цветные пикмины, GameCube микромир.', distractors: ['Overcooked 2', 'Lemnis Gate', 'Animal Crossing'] },
  { stem: 'wave-race-64', game: 'Wave Race 64', folder: 'hard', hint: 'Гидроциклы N64, вода Nintendo 64.', distractors: ['Mario Kart 64', 'Hydro Thunder', 'Sonic Riders'] },
  { stem: 'jak-and-daxter', game: 'Jak and Daxter: The Precursor Legacy', folder: 'hard', hint: 'Джак и Дастер, Precursor, PS2 Naughty Dog платформер.', distractors: ['Ratchet & Clank', 'Crash Bandicoot', 'Sly Cooper'] },
  { stem: 'heavy-rain', game: 'Heavy Rain', folder: 'hard', hint: 'Интерактивное кино Quantic Dream, дождь, Ethan Mars.', distractors: ['Detroit: Become Human', 'Beyond: Two Souls', 'LA Noire'] },
  { stem: 'until-dawn', game: 'Until Dawn', folder: 'hard', hint: 'Подростки в домике, butterfly effect, PS4 horror.', distractors: ['The Quarry', 'Heavy Rain', 'Resident Evil Village'] },
  { stem: 'crackdown', game: 'Crackdown', folder: 'hard', hint: 'Агент Xbox 360, паркур по городу, орбы, sandbox.', distractors: ['Saints Row', 'Prototype', 'inFAMOUS'] },
  { stem: 'monster-hunter-freedom-unite', game: 'Monster Hunter Freedom Unite', folder: 'hard', hint: 'PSP Monster Hunter, изометрия/охота, классический MH UI.', distractors: ['Monster Hunter: World', 'God Eater', 'Dauntless'] },
  { stem: 'persona-4-golden', game: 'Persona 4 Golden', folder: 'hard', hint: 'Инаба / TV world, школьники Atlus, Persona 4 (не P5 красно-чёрный).', distractors: ['Persona 5', 'Persona 3 Reload', 'Catherine'] },
  { stem: 'god-of-war-chains-of-olympus', game: 'God of War: Chains of Olympus', folder: 'hard', hint: 'Кратос на PSP, греческий миф handheld. НЕ 2018 скандинавия.', distractors: ['God of War (2018)', 'God of War III', 'Dante’s Inferno'] },
  { stem: 'shining-force', game: 'Shining Force', folder: 'hard', hint: 'Тактическая JRPG Sega, сетка, фэнтези Mega Drive.', distractors: ['Fire Emblem', 'Final Fantasy Tactics', 'Tactics Ogre'] },
  { stem: 'fable-3', game: 'Fable III', folder: 'hard', hint: 'Альбион как король/королева, Fable III UI/мир. НЕ Fable II собака.', distractors: ['Fable II', 'Fable (2004)', 'Dragon Age II'] },
  { stem: 'stalker-clear-sky', game: 'S.T.A.L.K.E.R.: Clear Sky', folder: 'hard', hint: 'Clear Sky фракция/болота, приквел. Отличимый кадр CS.', distractors: ['S.T.A.L.K.E.R.: Shadow of Chernobyl', 'S.T.A.L.K.E.R.: Call of Pripyat', 'Metro 2033'] },
  { stem: 'hitman-codename-47', game: 'Hitman: Codename 47', folder: 'hard', hint: 'Ранний Hitman PC, угловатый 47, Hong Kong/первые миссии.', distractors: ['Hitman: Blood Money', 'Hitman (2016)', 'No One Lives Forever'] },
  { stem: 'civilization-iv', game: 'Civilization IV', folder: 'hard', hint: 'Civ IV классический UI/юниты (не V/VI). Baba Yetu era vibe.', distractors: ['Civilization V', 'Civilization VI', 'Age of Empires III'] },
];

const ALL = [...EASY, ...MEDIUM, ...HARD];

const AVOID = [
  'super-mario-bros', 'legend-of-zelda', 'pokemon-red-blue', 'the-witcher-3',
  'elden-ring', 'final-fantasy-vii', 'tetris', 'doom-1993', 'metal-gear-solid',
  // batch 90 sample critical overlaps
  'gta-v', 'resident-evil-4', 'portal', 'minecraft', 'halo-combat-evolved',
];

function opt(text) {
  return {
    isCorrect: false,
    translations: { ru: { text }, en: { text } },
  };
}

function correct(text) {
  return {
    isCorrect: true,
    translations: { ru: { text }, en: { text } },
  };
}

function toQuestion(entry) {
  const diffKey = entry.folder === 'easy' ? 'EASY' : entry.folder === 'medium' ? 'MEDIUM' : 'HARD';
  return {
    draftKey: `img2-${entry.folder}-${entry.stem}`,
    type: 'IMAGE_GUESS',
    difficulty: diffKey,
    category: 'video-games',
    imageStem: entry.stem,
    imageFolder: entry.folder,
    promptImageUrl: `/quiz-images/${entry.folder}/${entry.stem}.webp`,
    rawDropAs: `raw-quiz-images/${entry.folder}/${entry.stem}.png`,
    captureHint: entry.hint,
    metadata: {
      game: entry.game,
      topic: 'image-guess',
      localizationStrategy: 'shared-brand',
      batch: '2026-08-07-image-guess-72',
    },
    translations: {
      ru: { text: 'Угадай игру по изображению.' },
      en: { text: 'Guess the game from the image.' },
    },
    options: [
      correct(entry.game),
      opt(entry.distractors[0]),
      opt(entry.distractors[1]),
      opt(entry.distractors[2]),
    ],
  };
}

// validations
const stems = new Set();
for (const e of ALL) {
  if (stems.has(e.stem)) throw new Error(`Duplicate stem ${e.stem}`);
  stems.add(e.stem);
  if (AVOID.includes(e.stem)) throw new Error(`Avoid list hit ${e.stem}`);
}
if (ALL.length !== 72) throw new Error(`Expected 72, got ${ALL.length}`);
if (EASY.length !== 24 || MEDIUM.length !== 24 || HARD.length !== 24) {
  throw new Error('Need 24 per difficulty');
}

const batch = {
  version: 1,
  source: 'ai',
  kind: 'IMAGE_GUESS_BATCH',
  notes:
    'Wave D Content Scale ×72. Not TEXT draft-questions v1. Collect raw → images:optimize → content:import-image-guess -- --file=… DRAFT only. Do not bloat seed. Avoid seed §1 + 2026-08-05 stems (esp. gta-v, resident-evil-4, legend-of-zelda).',
  existingSeedImageGuessAvoid: [
    'super-mario-bros',
    'legend-of-zelda',
    'pokemon-red-blue',
    'the-witcher-3',
    'elden-ring',
    'final-fantasy-vii',
    'tetris',
    'doom-1993',
    'metal-gear-solid',
  ],
  existingBatchImageGuessAvoidNote:
    'Also avoid all stems from content/drafts/batches/2026-08-05-image-guess-90.json',
  questions: ALL.map(toQuestion),
};

const outJson = path.join(ROOT, 'content/drafts/batches/2026-08-07-image-guess-72.json');
fs.writeFileSync(outJson, JSON.stringify(batch, null, 2) + '\n', 'utf8');

function checklistSection(title, folder, entries) {
  let md = `\n## ${title} → \`raw-quiz-images/${folder}/\`\n\n`;
  md += `|   # | Имя файла (копируй) | Игра | Что снять на скрине | Готово |\n`;
  md += `| --: | ------------------- | ---- | ------------------- | :----: |\n`;
  entries.forEach((e, i) => {
    md += `| ${String(i + 1).padStart(3)} | \`${e.stem}.png\` | **${e.game}** | ${e.hint} |  [ ]   |\n`;
  });
  return md;
}

let checklist = `# IMAGE_GUESS ×72 (2026-08-07) — чеклист сбора скринов

Иди **сверху вниз**. Для каждой строки:

1. Скопируй имя файла из колонки «Имя файла».
2. Положи скрин в нужную папку (\`easy\` / \`medium\` / \`hard\`).
3. Отметь \`[x]\` когда файл на месте.

Расширение может быть \`.png\`, \`.jpg\`, \`.jpeg\`, \`.webp\` — **stem** (имя без расширения) должен совпасть.

**Не пересекать** со старым чеклистом ×90 и seed (§1 QUIZ_IMAGES): особенно не \`gta-v\`, \`resident-evil-4\`, \`legend-of-zelda\`.

Когда всё готово:

\`\`\`powershell
npm run images:optimize
npm run content:import-image-guess -- --file=content/drafts/batches/2026-08-07-image-guess-72.json --dry-run
\`\`\`

Затем напиши в чат «картинки готовы».

**Помни:** WebP из \`public/quiz-images/**\` нужно закоммитить и задеплоить — иначе на prod 404. local Neon ≠ prod Neon. Import = DRAFT only; Publish в admin.
`;

checklist += checklistSection('EASY', 'easy', EASY);
checklist += checklistSection('MEDIUM', 'medium', MEDIUM);
checklist += checklistSection('HARD', 'hard', HARD);

const outCheck = path.join(ROOT, 'raw-quiz-images/CHECKLIST-2026-08-07.md');
fs.writeFileSync(outCheck, checklist + '\n', 'utf8');

console.log('Wrote', path.relative(ROOT, outJson));
console.log('Wrote', path.relative(ROOT, outCheck));
console.log('Counts', { easy: EASY.length, medium: MEDIUM.length, hard: HARD.length, total: ALL.length });
