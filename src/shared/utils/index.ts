export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function shuffleArray<T>(items: readonly T[]): T[] {
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = result[i];
    result[i] = result[j];
    result[j] = current;
  }

  return result;
}
