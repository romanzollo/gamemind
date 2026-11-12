/**
 * Знак «сетка ответов» для превью (satori не читает SVG-компонент шапки):
 * три зелёные клетки и одна красная, пропорции как у GameMindMark.
 */
export function OgAnswerGridMark({ size }: { size: number }) {
    const cell = (size * 13) / 32;
    const gap = (size * 2) / 32;
    const radius = (size * 3) / 32;
    const colors = ['#3ecf8e', '#3ecf8e', '#3ecf8e', '#f47e84'];

    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', width: cell * 2 + gap, gap }}>
            {colors.map((color, index) => (
                <div
                    key={index}
                    style={{ width: cell, height: cell, borderRadius: radius, background: color }}
                />
            ))}
        </div>
    );
}
