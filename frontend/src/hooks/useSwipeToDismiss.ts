import { useRef } from 'react';

/**
 * Attaches swipe-down-to-dismiss touch handling to a sheet element.
 * Spread `handleProps` onto the drag-handle element to initiate drags from there.
 * The sheet element (sheetRef) translates as the user drags and snaps back or closes.
 */
export function useSwipeToDismiss(
  sheetRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  threshold = 80,
) {
  const startY = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startY.current = e.touches[0].clientY;
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'none';
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || !sheetRef.current) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (startY.current === null || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    sheetRef.current.style.transition = '';
    if (dy > threshold) {
      onClose();
    } else {
      sheetRef.current.style.transform = '';
    }
    startY.current = null;
  };

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
  };
}
