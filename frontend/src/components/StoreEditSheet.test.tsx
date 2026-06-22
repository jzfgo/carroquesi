import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ListItem } from '../types';
import { StoreEditSheet } from './StoreEditSheet';

const BASE_ITEM: ListItem = {
  id: 'i1',
  list_id: 'l1',
  name: 'Leche',
  quantity: null,
  brand: null,
  stores: ['Mercadona', 'Carrefour'],
  purchased: false,
  purchased_at: null,
  ean: null,
  price: null,
  price_per: null,
  price_store: null,
  added_by: 'u1',
  created_at: '',
  updated_at: '',
};

const OTHER_ITEMS: ListItem[] = [
  { ...BASE_ITEM, id: 'i2', stores: ['Lidl'] },
  { ...BASE_ITEM, id: 'i3', stores: ['Alcampo'] },
];

describe('StoreEditSheet', () => {
  it('renders existing stores as chips', () => {
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Mercadona')).toBeInTheDocument();
    expect(screen.getByText('Carrefour')).toBeInTheDocument();
  });

  it('clicking the remove button on a store removes it and calls onSave', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: /eliminar mercadona/i }),
    );
    expect(onSave).toHaveBeenCalledWith(['Carrefour']);
  });

  it('typing a new store and clicking + adds it and calls onSave', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Lidl' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }));
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Lidl']);
  });

  it('pressing Enter in the input adds the store', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Dia' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Dia']);
  });

  it('does not add duplicate stores', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Mercadona' },
    });
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not add empty string', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /añadir tienda/i }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows client-side suggestions from other items', () => {
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={OTHER_ITEMS}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Li' } });
    expect(screen.getByText('Lidl')).toBeInTheDocument();
  });

  it('clicking a suggestion adds the store', () => {
    const onSave = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={OTHER_ITEMS}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Li' } });
    fireEvent.click(screen.getByText('Lidl'));
    expect(onSave).toHaveBeenCalledWith(['Mercadona', 'Carrefour', 'Lidl']);
  });

  it('ESC key calls onClose', () => {
    const onClose = vi.fn();
    render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('tapping overlay calls onClose', () => {
    const onClose = vi.fn();
    const { container } = render(
      <StoreEditSheet
        item={BASE_ITEM}
        items={[]}
        onSave={vi.fn()}
        onClose={onClose}
      />,
    );
    fireEvent.click(container.querySelector('.store-edit-sheet__overlay')!);
    expect(onClose).toHaveBeenCalled();
  });
});
