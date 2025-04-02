async function loadComicForDate(date) {
    const comic = await getGarfieldComic(date);
    if (comic.success) {
        document.getElementById('comic').src = comic.imageUrl;
        document.getElementById('DatePicker').value = getFormattedDate(parseArcamaxDate(comic.date));
        return true;
    }
    return false;
}

async function loadRandomComic() {
    const archives = await getArchiveLinks();
    if (archives.length > 0) {
        const randomIndex = Math.floor(Math.random() * archives.length);
        const randomComic = archives[randomIndex];
        return loadComicForDate(parseArcamaxDate(randomComic.date));
    }
    return false;
}
