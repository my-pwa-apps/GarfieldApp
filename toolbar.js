export function makeDraggable(element, dragHandle, storageKey, options = {}) {
    if (!element || !dragHandle) return;

    const isToolbar = options.isToolbar === true || storageKey === 'toolbarPosition';
    const clampPosition = options.clampPosition || ((left, top) => ({ left, top }));
    const onDrop = options.onDrop || (() => {});

    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let dragging = false;

    function getPoint(event) {
        if (event.touches && event.touches[0]) {
            return { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }
        return { x: event.clientX, y: event.clientY };
    }

    function applyPointerState(event) {
        const point = getPoint(event);
        const deltaX = point.x - startX;
        const deltaY = point.y - startY;

        let nextLeft = startLeft + deltaX;
        let nextTop = startTop + deltaY;

        if (isToolbar) {
            nextLeft = parseFloat(element.style.left) || startLeft;
            nextTop = startTop + deltaY;
        }

        const rect = element.getBoundingClientRect();
        const width = rect.width || element.offsetWidth || 0;
        const height = rect.height || element.offsetHeight || 0;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        if (nextTop < 0) nextTop = 0;
        if (nextLeft < 0) nextLeft = 0;
        if (nextTop + height > viewportHeight) nextTop = viewportHeight - height;
        if (nextLeft + width > viewportWidth) nextLeft = viewportWidth - width;

        element.style.top = nextTop + 'px';
        element.style.left = nextLeft + 'px';
        element.style.transform = 'none';
    }

    function onDown(event) {
        if (event.target.closest('button, a, input, select, textarea')) return;
        if (event.button && event.button !== 0) return;
        if (!(event.target === dragHandle || dragHandle.contains(event.target))) return;

        dragging = true;
        const point = getPoint(event);
        startX = point.x;
        startY = point.y;
        startLeft = parseFloat(element.style.left || getComputedStyle(element).left || '0');
        startTop = parseFloat(element.style.top || getComputedStyle(element).top || '0');

        if (event.touches) event.preventDefault();
        element.style.cursor = dragHandle === element ? 'grabbing' : 'grabbing';
        document.body.style.userSelect = 'none';

        function moveHandler(moveEvent) {
            if (!dragging) return;
            applyPointerState(moveEvent);
        }

        function upHandler(upEvent) {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
            element.style.cursor = dragHandle === element ? 'grab' : '';

            const rect = element.getBoundingClientRect();
            const clamped = clampPosition(rect.left, rect.top, rect.width, rect.height);
            if (clamped.left !== rect.left || clamped.top !== rect.top) {
                element.style.left = clamped.left + 'px';
                element.style.top = clamped.top + 'px';
            }

            onDrop({
                element,
                storageKey,
                left: parseFloat(element.style.left || '0'),
                top: parseFloat(element.style.top || '0')
            });

            document.removeEventListener('mousemove', moveHandler);
            document.removeEventListener('mouseup', upHandler);
            document.removeEventListener('touchmove', moveHandler, { passive: false });
            document.removeEventListener('touchend', upHandler);
        }

        document.addEventListener('mousemove', moveHandler);
        document.addEventListener('mouseup', upHandler);
        document.addEventListener('touchmove', moveHandler, { passive: false });
        document.addEventListener('touchend', upHandler);
    }

    dragHandle.addEventListener('mousedown', onDown);
    dragHandle.addEventListener('touchstart', onDown, { passive: false });
}
