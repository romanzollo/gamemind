/**
 * Порядок вариантов у каждого игрока свой: по нажатию соседа («второй
 * сверху») ответ не подсмотреть. Порядок детерминированный — от комнаты,
 * игрока и позиции, поэтому не меняется при перезагрузке и опросах.
 *
 * Canon: docs/DECISIONS.md → Quiz room.
 */

import { hashStringToSeed, shuffleWithSeed } from '@/shared/utils';

export function orderOptionsForPlayer<T extends { key: string }>(
    options: readonly T[],
    roomId: string,
    playerId: string,
    position: number,
): T[] {
    return shuffleWithSeed(
        options,
        hashStringToSeed(`room:${roomId}:${playerId}:${position}`),
        (left, right) => left.key.localeCompare(right.key),
    );
}
