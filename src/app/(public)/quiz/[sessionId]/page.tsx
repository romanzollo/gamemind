type QuizSessionPageProps = {
  params: Promise<{ sessionId: string }>;
};

export default async function QuizSessionPage({ params }: QuizSessionPageProps) {
  const { sessionId } = await params;

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Quiz session</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        Session: {sessionId}
      </p>
    </main>
  );
}
