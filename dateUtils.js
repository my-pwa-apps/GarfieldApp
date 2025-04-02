function formatDateForArcamax(date) {
    return `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
}

function parseArcamaxDate(dateString) {
    const [month, day, year] = dateString.split('/');
    return new Date(year, month - 1, day);
}

function getFormattedDate(date) {
    return date.toISOString().split('T')[0];
}
