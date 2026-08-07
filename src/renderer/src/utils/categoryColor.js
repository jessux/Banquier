export function categoryHue(cat) {
    const name = cat.includes(' > ') ? cat.slice(0, cat.indexOf(' > ')) : cat;
    let h = 0;
    for (let i = 0; i < name.length; i++)
        h = name.charCodeAt(i) + ((h << 5) - h);
    return Math.abs(h) % 360;
}
export function categoryBadgeStyle(cat) {
    if (!cat)
        return {};
    const hue = categoryHue(cat);
    return {
        background: `hsl(${hue},45%,16%)`,
        borderColor: `hsl(${hue},45%,28%)`,
        color: `hsl(${hue},70%,72%)`
    };
}
