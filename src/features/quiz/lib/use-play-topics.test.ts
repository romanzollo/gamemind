/**
 * Разбор ответа `/api/quiz/topics` и выбор темы, которая уйдёт в форму.
 */

import { describe, expect, it } from "vitest";

import { toPlayTopicOptions } from "@/entities/play-topic/play-topic";

import {
  parsePlayTopicsResponse,
  resolveSelectedTopic,
  type PlayTopicsState,
} from "./use-play-topics";

const topics = toPlayTopicOptions([
  {
    id: "games.era.2010s",
    nameRu: "2010-е",
    nameEn: "2010s",
    easy: 52,
    medium: 82,
    hard: 39,
  },
  {
    id: "games.genre.rpg",
    nameRu: "Ролевые",
    nameEn: "RPGs",
    easy: 15,
    medium: 41,
    hard: 44,
  },
]);
const ready: PlayTopicsState = { status: "ready", topics };

describe("toPlayTopicOptions", () => {
  it("marks a difficulty available from 20 questions", () => {
    expect(topics[1]?.available).toEqual({
      EASY: false,
      MEDIUM: true,
      HARD: true,
    });
  });
});

describe("resolveSelectedTopic", () => {
  it("keeps a topic that has questions at this difficulty", () => {
    expect(resolveSelectedTopic(ready, "games.genre.rpg", "HARD")).toBe(
      "games.genre.rpg",
    );
  });

  it("drops a topic that is greyed out, Mix needs all three", () => {
    expect(resolveSelectedTopic(ready, "games.genre.rpg", "EASY")).toBe("");
    expect(resolveSelectedTopic(ready, "games.genre.rpg", "MIXED")).toBe("");
    expect(resolveSelectedTopic(ready, "games.era.2010s", "MIXED")).toBe(
      "games.era.2010s",
    );
  });

  it("sends no topic before the list is known or for an unknown id", () => {
    expect(
      resolveSelectedTopic({ status: "loading" }, "games.era.2010s", "EASY"),
    ).toBe("");
    expect(resolveSelectedTopic(ready, "games.era.1980s", "EASY")).toBe("");
  });
});

describe("parsePlayTopicsResponse", () => {
  it("accepts the API shape and rejects anything else", () => {
    expect(parsePlayTopicsResponse({ topics })).toEqual(topics);
    expect(parsePlayTopicsResponse({ topics: null })).toBeNull();
    expect(parsePlayTopicsResponse({ topics: [{ id: "x" }] })).toBeNull();
    expect(parsePlayTopicsResponse("oops")).toBeNull();
  });
});
