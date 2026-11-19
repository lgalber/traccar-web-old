import { createSlice } from '@reduxjs/toolkit';

// Newest first; alarms stay until marked as seen, only other notifications are capped (newest 50 kept)
const normalize = (items) => {
  items.sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime));
  let others = 0;
  return items.filter((item) => item.type === 'alarm' || (others += 1) <= 50);
};

// Pending alerts of the current user. Filled from live notifications and from the server's unseen
// list; an item is removed when the user marks it as seen.
const { reducer, actions } = createSlice({
  name: 'events',
  initialState: {
    items: [],
  },
  reducers: {
    add(state, action) {
      const known = new Set(state.items.map((item) => item.id));
      state.items = normalize([
        ...state.items,
        ...action.payload.filter((item) => !known.has(item.id)),
      ]);
    },
    // Replaces the list with the server's unseen alerts (the source of truth), e.g. after the app
    // resumes; also drops alerts that were marked as seen on another device
    set(state, action) {
      state.items = normalize([...action.payload]);
    },
    delete(state, action) {
      state.items = state.items.filter((item) => item.id !== action.payload.id);
    },
    deleteAll(state) {
      state.items = [];
    },
  },
});

export { actions as eventsActions };
export { reducer as eventsReducer };
