// Dialog focus helpers shared by the settings panel and the Top Favorites modal.
const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Collect the currently focusable, visible, enabled descendants of a container.
 * @param {Element|null} container
 * @returns {HTMLElement[]}
 */
export function getFocusableElements(container) {
    if (!container) return [];

    return [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => !element.disabled && element.getAttribute('aria-hidden') !== 'true' && element.offsetParent !== null);
}

/**
 * Keep Tab / Shift+Tab inside a dialog container.
 * @param {KeyboardEvent} event
 * @param {Element|null} container
 */
export function trapFocusWithin(event, container) {
    if (!container) return;

    const focusable = getFocusableElements(container);
    if (!focusable.length) {
        event.preventDefault();
        if (container instanceof HTMLElement) container.focus();
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
