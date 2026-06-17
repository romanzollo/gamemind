import { prisma } from "@/lib/prisma";

export const quizResultRepository = {
  findBestScores(limit: number) {
    return prisma.quizResult.findMany({
      distinct: ["userId"],
      orderBy: [{ userId: "asc" }, { score: "desc" }, { completedAt: "asc" }],
      take: limit,
      include: {
        user: {
          select: { id: true, username: true },
        },
      },
    });
  },
};
