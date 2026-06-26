const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

function readEnv(name) {
  const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  const match = env.match(new RegExp(`${name}="([^"]+)"`));
  if (!match) throw new Error(`Missing ${name}`);
  return match[1];
}

const questions = [
  {
    id: "q-vg-easy-001",
    text: "Which company created the Super Mario series?",
    difficulty: "EASY",
    metadata: { franchise: "Super Mario", topic: "developer" },
    options: [
      { text: "Nintendo", isCorrect: true, order: 1 },
      { text: "Sega", isCorrect: false, order: 2 },
      { text: "Sony", isCorrect: false, order: 3 },
      { text: "Capcom", isCorrect: false, order: 4 },
    ],
  },
  {
    id: "q-vg-easy-002",
    text: "What is the name of the main character in The Legend of Zelda series?",
    difficulty: "EASY",
    metadata: { franchise: "The Legend of Zelda", topic: "character" },
    options: [
      { text: "Link", isCorrect: true, order: 1 },
      { text: "Zelda", isCorrect: false, order: 2 },
      { text: "Ganondorf", isCorrect: false, order: 3 },
      { text: "Epona", isCorrect: false, order: 4 },
    ],
  },
  {
    id: "q-vg-easy-003",
    text: "In Minecraft, which material is required to craft a Nether portal frame?",
    difficulty: "EASY",
    metadata: { game: "Minecraft", topic: "crafting" },
    options: [
      { text: "Obsidian", isCorrect: true, order: 1 },
      { text: "Bedrock", isCorrect: false, order: 2 },
      { text: "End Stone", isCorrect: false, order: 3 },
      { text: "Blackstone", isCorrect: false, order: 4 },
    ],
  },
  {
    id: "q-vg-medium-001",
    text: "Which studio developed The Witcher 3: Wild Hunt?",
    difficulty: "MEDIUM",
    metadata: { game: "The Witcher 3: Wild Hunt", topic: "developer" },
    options: [
      { text: "CD Projekt Red", isCorrect: true, order: 1 },
      { text: "BioWare", isCorrect: false, order: 2 },
      { text: "Bethesda Game Studios", isCorrect: false, order: 3 },
      { text: "Larian Studios", isCorrect: false, order: 4 },
    ],
  },
  {
    id: "q-vg-medium-002",
    text: "What is the name of the city where most of Cyberpunk 2077 takes place?",
    difficulty: "MEDIUM",
    metadata: { game: "Cyberpunk 2077", topic: "location" },
    options: [
      { text: "Night City", isCorrect: true, order: 1 },
      { text: "Rapture", isCorrect: false, order: 2 },
      { text: "City 17", isCorrect: false, order: 3 },
      { text: "Los Santos", isCorrect: false, order: 4 },
    ],
  },
  {
    id: "q-vg-hard-001",
    text: "Which game popularized the term 'roguelike' by inspiring the genre name?",
    difficulty: "HARD",
    metadata: { topic: "genre history" },
    options: [
      { text: "Rogue", isCorrect: true, order: 1 },
      { text: "NetHack", isCorrect: false, order: 2 },
      { text: "Diablo", isCorrect: false, order: 3 },
      { text: "Spelunky", isCorrect: false, order: 4 },
    ],
  },
];

const TEST_QUESTION_IDS = [
  "q-test-write",
  "q-test-write-2",
  "q-test-write-3",
  "q-test-raw",
];

function validateQuestions(seedQuestions) {
  for (const question of seedQuestions) {
    const correctOptions = question.options.filter((option) => option.isCorrect);

    if (question.options.length < 2) {
      throw new Error(`Question "${question.id}" must have at least 2 options.`);
    }

    if (correctOptions.length !== 1) {
      throw new Error(
        `Question "${question.id}" must have exactly one correct option.`,
      );
    }
  }
}

function createClient() {
  return new Client({
    connectionString: readEnv("DATABASE_URL_UNPOOLED"),
    ssl: { rejectUnauthorized: true },
    keepAlive: true,
  });
}

async function withClient(run) {
  const client = createClient();
  await client.connect();

  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

async function cleanupTestQuestions() {
  await withClient(async (client) => {
    if (TEST_QUESTION_IDS.length === 0) return;

    await client.query('DELETE FROM "AnswerOption" WHERE "questionId" = ANY($1::text[])', [
      TEST_QUESTION_IDS,
    ]);
    await client.query('DELETE FROM "Question" WHERE id = ANY($1::text[])', [
      TEST_QUESTION_IDS,
    ]);
  });
}

async function seedQuestion(question) {
  await withClient(async (client) => {
    await client.query(
      `INSERT INTO "Question" (
        id, text, difficulty, category, metadata, "isActive", "createdAt", "updatedAt"
      )
      VALUES ($1, $2, $3::"Difficulty", $4, $5::jsonb, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        text = EXCLUDED.text,
        difficulty = EXCLUDED.difficulty,
        category = EXCLUDED.category,
        metadata = EXCLUDED.metadata,
        "isActive" = true,
        "updatedAt" = NOW()`,
      [
        question.id,
        question.text,
        question.difficulty,
        "video-games",
        JSON.stringify(question.metadata ?? null),
      ],
    );

    await client.query('DELETE FROM "AnswerOption" WHERE "questionId" = $1', [
      question.id,
    ]);

    const values = [];
    const params = [question.id];
    let paramIndex = 2;

    for (const option of question.options) {
      values.push(
        `($${paramIndex}, $1, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`,
      );
      params.push(
        `${question.id}-opt-${option.order}`,
        option.text,
        option.isCorrect,
        option.order,
      );
      paramIndex += 4;
    }

    await client.query(
      `INSERT INTO "AnswerOption" (
        id, "questionId", text, "isCorrect", "order"
      )
      VALUES ${values.join(", ")}`,
      params,
    );
  });
}

async function main() {
  validateQuestions(questions);

  await cleanupTestQuestions();

  for (const question of questions) {
    await seedQuestion(question);
    console.log(`Seeded ${question.id}`);
  }

  const result = await withClient((client) =>
    client.query('SELECT COUNT(*)::int AS count FROM "Question"'),
  );

  console.log(
    `Done. Seeded ${questions.length} questions. Total in DB: ${result.rows[0].count}.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
