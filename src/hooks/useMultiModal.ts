import { useState, useCallback } from 'react';

/**
 * Hook for managing multiple persistent modals.
 * Each entity gets its own modal that stays mounted when minimized.
 *
 * Usage:
 *   const { openModals, openModal, closeModal } = useMultiModal<MyEntity>();
 *   // Open: openModal(entity.id, entity)
 *   // Close: closeModal(id)
 *   // Render: openModals.map(({ id, data }) => <Modal key={id} open ...>)
 */
export default function useMultiModal<T extends { id: string }>() {
  const [modals, setModals] = useState<Map<string, T>>(new Map());

  const openModal = useCallback((entity: T) => {
    setModals(prev => {
      const m = new Map(prev);
      m.set(entity.id, entity);
      return m;
    });
  }, []);

  const closeModal = useCallback((id: string) => {
    setModals(prev => {
      const m = new Map(prev);
      m.delete(id);
      return m;
    });
  }, []);

  const openModals = Array.from(modals.entries()).map(([id, data]) => ({ id, data }));

  return { openModals, openModal, closeModal, modalsMap: modals };
}
