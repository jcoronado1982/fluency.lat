import { createContext, useContext } from 'react';

/** Contexto de sesión de estudio (deck, tarjeta actual, navegación). */
export const FlashcardContext = createContext(null);
export const useFlashcardContext = () => useContext(FlashcardContext);

/** UI del módulo de estudio (catálogo, modales IPA, audio loading). */
export const FlashcardUiContext = createContext(null);
export const useFlashcardUiContext = () => useContext(FlashcardUiContext);

/** Categoría activa del deck. */
export const CategoryContext = createContext(null);
export const useCategoryContext = () => useContext(CategoryContext);
