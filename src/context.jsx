import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef } from 'react';
import {
  getAllCards, putCard, deleteCard as dbDeleteCard,
  getAllProfiles, putProfile, deleteProfile as dbDeleteProfile,
  getAllTags, addTag as dbAddTag, removeTag as dbRemoveTag,
  getSetting, setSetting,
  migrateFromLocalStorage, createBackup, DND_PROFILE, genId,
  getQAState as dbGetQAState, saveQAState as dbSaveQAState, resetQAState as dbResetQAState,
} from './db';

const AppContext = createContext(null);

const initialState = {
  cards: [],
  profiles: [],
  tags: [],
  apiKey: '',
  loading: true,
  currentTab: 'library',
  selectedCardId: null,
  editingCardId: null,
  editingProfileId: null,
  filterProfile: 'all',
  filterTag: 'all',
  searchQuery: '',
  scanProfileId: '',
};

function reducer(state, action) {
  switch (action.type) {
    case 'INIT':
      return { ...state, ...action.payload, loading: false };
    case 'SET_TAB':
      return { ...state, currentTab: action.tab, selectedCardId: null, editingCardId: null, editingProfileId: null };
    case 'SELECT_CARD':
      return { ...state, selectedCardId: action.id, editingCardId: null };
    case 'EDIT_CARD':
      return { ...state, editingCardId: action.id };
    case 'STOP_EDITING':
      return { ...state, editingCardId: null };
    case 'DESELECT_CARD':
      return { ...state, selectedCardId: null, editingCardId: null };
    case 'SET_CARDS':
      return { ...state, cards: action.cards };
    case 'SET_PROFILES':
      return { ...state, profiles: action.profiles };
    case 'SET_TAGS':
      return { ...state, tags: action.tags };
    case 'SET_API_KEY':
      return { ...state, apiKey: action.key };
    case 'SET_FILTER_PROFILE':
      return { ...state, filterProfile: action.value };
    case 'SET_FILTER_TAG':
      return { ...state, filterTag: action.value };
    case 'SET_SEARCH':
      return { ...state, searchQuery: action.value };
    case 'SET_SCAN_PROFILE':
      return { ...state, scanProfileId: action.id };
    case 'EDIT_PROFILE':
      return { ...state, editingProfileId: action.id };
    case 'STOP_EDITING_PROFILE':
      return { ...state, editingProfileId: null };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const saveCountRef = useRef(0);

  // ── Initialize ──
  useEffect(() => {
    async function init() {
      // Try migrating from localStorage
      const migrated = localStorage.getItem('grimoire-migrated-to-idb');
      if (!migrated) {
        await migrateFromLocalStorage();
      }

      const [cards, profiles, tags, apiKey, scanProfileId] = await Promise.all([
        getAllCards(),
        getAllProfiles(),
        getAllTags(),
        getSetting('apiKey'),
        getSetting('scanProfileId'),
      ]);

      dispatch({
        type: 'INIT',
        payload: {
          cards,
          profiles,
          tags,
          apiKey: apiKey || '',
          scanProfileId: scanProfileId || profiles[0]?.id || '',
        },
      });
    }
    init();
  }, []);

  // ── Auto-backup every 10 saves ──
  useEffect(() => {
    if (saveCountRef.current > 0 && saveCountRef.current % 10 === 0) {
      createBackup().catch(console.error);
    }
  }, [state.cards, state.profiles, state.tags]);

  // ── Card actions ──
  const saveCard = useCallback(async (card) => {
    await putCard(card);
    const cards = await getAllCards();
    dispatch({ type: 'SET_CARDS', cards });
    saveCountRef.current++;
  }, []);

  const addCard = useCallback(async (card) => {
    const newCard = { ...card, id: card.id || genId(), createdAt: card.createdAt || Date.now() };
    await putCard(newCard);
    const cards = await getAllCards();
    dispatch({ type: 'SET_CARDS', cards });
    saveCountRef.current++;
    return newCard;
  }, []);

  const removeCard = useCallback(async (id) => {
    await dbDeleteCard(id);
    const cards = await getAllCards();
    dispatch({ type: 'SET_CARDS', cards });
    dispatch({ type: 'DESELECT_CARD' });
    saveCountRef.current++;
  }, []);

  // ── Profile actions ──
  const saveProfile = useCallback(async (profile) => {
    await putProfile(profile);
    const profiles = await getAllProfiles();
    dispatch({ type: 'SET_PROFILES', profiles });
    saveCountRef.current++;
  }, []);

  const addProfile = useCallback(async (profile) => {
    const newProfile = { ...profile, id: profile.id || genId() };
    await putProfile(newProfile);
    const profiles = await getAllProfiles();
    dispatch({ type: 'SET_PROFILES', profiles });
    return newProfile;
  }, []);

  const removeProfile = useCallback(async (id) => {
    await dbDeleteProfile(id);
    const profiles = await getAllProfiles();
    dispatch({ type: 'SET_PROFILES', profiles });
    dispatch({ type: 'STOP_EDITING_PROFILE' });
  }, []);

  // ── Tag actions ──
  const addTagAction = useCallback(async (name) => {
    await dbAddTag(name);
    const tags = await getAllTags();
    dispatch({ type: 'SET_TAGS', tags });
  }, []);

  const removeTagAction = useCallback(async (name) => {
    await dbRemoveTag(name);
    // Also remove from cards
    const cards = await getAllCards();
    for (const card of cards) {
      if (card.tags?.includes(name)) {
        card.tags = card.tags.filter((t) => t !== name);
        await putCard(card);
      }
    }
    const updatedCards = await getAllCards();
    dispatch({ type: 'SET_TAGS', tags: await getAllTags() });
    dispatch({ type: 'SET_CARDS', cards: updatedCards });
  }, []);

  // ── Settings actions ──
  const setApiKey = useCallback(async (key) => {
    await setSetting('apiKey', key);
    dispatch({ type: 'SET_API_KEY', key });
  }, []);

  const setScanProfileId = useCallback(async (id) => {
    await setSetting('scanProfileId', id);
    dispatch({ type: 'SET_SCAN_PROFILE', id });
  }, []);

  // ── QA state actions ──
  const getQAState = useCallback(async (checklistId) => {
    return dbGetQAState(checklistId);
  }, []);

  const saveQAState = useCallback(async (checklistId, stateData) => {
    await dbSaveQAState(checklistId, stateData);
  }, []);

  const resetQAState = useCallback(async (checklistId) => {
    await dbResetQAState(checklistId);
  }, []);

  // ── Card navigation with browser history ──
  const navigateToCard = useCallback((id, isRoot) => {
    dispatch({ type: 'SET_TAB', tab: 'library' });
    dispatch({ type: 'SELECT_CARD', id });
    history.pushState({ cardId: id, root: isRoot }, '');
  }, []);

  // Handle browser back/forward within card stack
  useEffect(() => {
    function onPopState(e) {
      const s = e.state;
      if (s?.cardId) {
        dispatch({ type: 'SET_TAB', tab: 'library' });
        dispatch({ type: 'SELECT_CARD', id: s.cardId });
      } else {
        dispatch({ type: 'DESELECT_CARD' });
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // ── Reload all data (after import) ──
  const reloadAll = useCallback(async () => {
    const [cards, profiles, tags] = await Promise.all([
      getAllCards(), getAllProfiles(), getAllTags(),
    ]);
    dispatch({ type: 'INIT', payload: { cards, profiles, tags, apiKey: state.apiKey, scanProfileId: state.scanProfileId } });
  }, [state.apiKey, state.scanProfileId]);

  const value = {
    state,
    dispatch,
    saveCard,
    addCard,
    removeCard,
    saveProfile,
    addProfile,
    removeProfile,
    addTag: addTagAction,
    removeTag: removeTagAction,
    setApiKey,
    setScanProfileId,
    reloadAll,
    navigateToCard,
    getQAState,
    saveQAState,
    resetQAState,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
