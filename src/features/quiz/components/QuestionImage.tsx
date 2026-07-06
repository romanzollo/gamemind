import Image from 'next/image';

type QuestionImageProps = {
    src: string;
    alt: string;
    /** First visible image in the session — skip lazy load. */
    priority?: boolean;
};

function isSvgSource(src: string) {
    const path = src.split('?')[0]?.toLowerCase() ?? '';
    return path.endsWith('.svg');
}

export function QuestionImage({ src, alt, priority = false }: QuestionImageProps) {
    const unoptimized = isSvgSource(src);

    return (
        <div className="relative aspect-video w-full bg-surface-muted">
            <Image
                src={src}
                alt={alt}
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 672px"
                priority={priority}
                loading={priority ? undefined : 'lazy'}
                unoptimized={unoptimized}
            />
        </div>
    );
}
