/**
 * Wires the Zustand stores to IndexedDB: hydrates them on startup and autosaves
 * (debounced) the content snapshot and the working draft on every change. The
 * saved-character roster is persisted directly by the store's library actions.
 */

import { useCharacterStore } from "../store/characterStore";
import { useContentStore } from "../store/contentStore";
import {
  loadCharacters,
  loadContentSnapshot,
  loadDraft,
  saveContentSnapshot,
  saveDraft,
} from "./persistence";

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

let started = false;

export async function bootstrapPersistence(): Promise<void> {
  if (started) return;
  started = true;

  try {
    const [content, draft, roster] = await Promise.all([
      loadContentSnapshot(),
      loadDraft(),
      loadCharacters(),
    ]);
    if (content) useContentStore.getState().hydrate(content);
    if (draft) useCharacterStore.getState().loadDraft(draft);
    useCharacterStore.getState().hydrateSaved(roster);
  } catch (err) {
    console.error("Failed to load saved data:", err);
  }

  const persistContent = debounce(() => {
    const s = useContentStore.getState();
    void saveContentSnapshot({
      entities: s.entities,
      metaSources: s.metaSources,
      activeSources: s.activeSources,
      edition: s.edition,
      spellClasses: s.spellClasses,
      showReprinted: s.showReprinted,
    });
  }, 400);
  // Only the persisted slices trigger a save: a full 5eTools import is tens of
  // megabytes, so writing it again on every unrelated state change (issues,
  // index rebuilds) would stall the UI.
  useContentStore.subscribe((state, prev) => {
    if (
      state.entities !== prev.entities ||
      state.metaSources !== prev.metaSources ||
      state.activeSources !== prev.activeSources ||
      state.edition !== prev.edition ||
      state.spellClasses !== prev.spellClasses ||
      state.showReprinted !== prev.showReprinted
    ) {
      persistContent();
    }
  });

  const persistDraft = debounce(() => void saveDraft(useCharacterStore.getState().draft), 500);
  useCharacterStore.subscribe((state, prev) => {
    if (state.draft !== prev.draft) persistDraft();
  });
}
