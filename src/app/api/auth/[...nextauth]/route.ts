import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import {
    readVkIdCallbackParams,
    runWithVkIdCallbackParams,
} from '@/lib/auth/vk-id';

/**
 * Маршруты Auth.js. Колбэк VK ID обёрнут: `device_id` и `state` из адреса
 * нужны при обмене кода, а Auth.js их не передаёт (см. lib/auth/vk-id.ts).
 */
export const { POST } = handlers;

export function GET(request: NextRequest) {
    const vkIdParams = readVkIdCallbackParams(request.nextUrl);

    return vkIdParams
        ? runWithVkIdCallbackParams(vkIdParams, () => handlers.GET(request))
        : handlers.GET(request);
}
