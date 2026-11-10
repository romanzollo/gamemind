# raw-quiz-audio

Исходники клипов AUDIO_GUESS. Всё, кроме этого файла, в `.gitignore`:
музыку в публичный репозиторий не кладём.

1. Положи трек сюда (mp3 / flac / wav / ogg / m4a), имя — латиницей,
   например `skyrim-dragonborn.flac`.
2. В партии (`content/drafts/batches/*.json`, `kind: AUDIO_GUESS_BATCH`)
   укажи `audio.sourceFile`, `audio.startSeconds`, `audio.durationSeconds`.
3. `npm run audio:build -- --file=<партия> --review` — клипы в
   `public/media/audio/` + страница ревью в `raw-quiz-audio/_review/`.
4. Слушаешь страницу ревью, правишь таймкоды, повторяешь шаг 3.

Правила: docs/DECISIONS.md → Audio questions: AUDIO_GUESS.
