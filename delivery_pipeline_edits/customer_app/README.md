# Customer app (React Native) — how to apply

1. **`src/utils/errors.ts`**
   - Replace or merge with your existing error util. Never show raw "Internal error"; use `getErrorMessageMn` / `normalizeApiError` so default is «Алдаа гарлаа. Дахин оролдоно уу.»

2. **`src/api/endpoints.ts`**
   - Add or replace `createOrder`: on 2xx treat success only when response has `order_id` (or `data.id`) and `order_number`; return `{ orderId, orderNumber }`. On malformed 2xx return `{ ambiguousSuccess: true }`.
   - Add `getMxmOrders(warehouseId, { limit, offset })` for fallback after ambiguous create.

3. **`src/screens/OrderInfoScreen.tsx`**
   - Use `useOrderSubmit(warehouseId, resetCart, refreshCart, navigateToOrder)` and call `submit(payload)` on «Захиалга баталгаажуулах». On success: show success banner, `resetCart()`, refresh cart, navigate to order. On ambiguous/error: run fallback (getMxmOrders, newest within 2 min, match phone/amount); if found treat as success and clear cart; else show Mongolian error and do not clear cart.

4. **`src/screens/OrdersScreen.tsx`**
   - Use tabs: Бүгд | Идэвхтэй | Хүргэгдсэн | Цуцлагдсан. Filter with `isOrderInTab(order.delivery_status_code, tab)`. Use `BADGE_COLORS`, `getProgressStepIndex`, `isCancelled` for badge and progress dots (list item uses `delivery_status_code` from list only — no N+1).
