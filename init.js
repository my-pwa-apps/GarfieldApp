export async function initialize() {
    if (window.onLoad) {
        await window.onLoad();
    }
}
