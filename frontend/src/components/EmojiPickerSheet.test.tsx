import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmojiPickerSheet } from './EmojiPickerSheet';

describe('EmojiPickerSheet', () => {
  it('renders a "Ninguno" button', () => {
    render(
      <EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(
      screen.getByRole('button', { name: /ninguno/i }),
    ).toBeInTheDocument();
  });

  it('calls onSelect(null) when Ninguno is clicked', () => {
    const onSelect = vi.fn();
    render(
      <EmojiPickerSheet current="🍎" onSelect={onSelect} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /ninguno/i }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect with emoji when an emoji button is clicked', () => {
    const onSelect = vi.fn();
    render(
      <EmojiPickerSheet current={null} onSelect={onSelect} onClose={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '🛒' }));
    expect(onSelect).toHaveBeenCalledWith('🛒');
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={onClose} />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <EmojiPickerSheet current={null} onSelect={vi.fn()} onClose={onClose} />,
    );
    fireEvent.click(container.querySelector('.emoji-picker-sheet__overlay')!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('marks the current emoji button as active', () => {
    render(
      <EmojiPickerSheet current="🍎" onSelect={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: '🍎' })).toHaveClass(
      'emoji-picker-sheet__item--active',
    );
  });
});
