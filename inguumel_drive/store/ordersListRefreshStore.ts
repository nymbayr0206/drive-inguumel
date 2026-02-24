import { create } from 'zustand';

/** Trigger list refetch from outside (e.g. after COD confirm on detail). List screen subscribes and refetches when trigger changes. */
interface OrdersListRefreshState {
  refreshTrigger: number;
  requestListRefresh: () => void;
}

export const useOrdersListRefreshStore = create<OrdersListRefreshState>((set) => ({
  refreshTrigger: 0,
  requestListRefresh: () =>
    set((s) => {
      if (__DEV__) console.log('[ordersListRefresh] requestListRefresh');
      return { refreshTrigger: s.refreshTrigger + 1 };
    }),
}));
