/** 'initial' = carga/recarga; 'user' = el usuario eligió categoría/nivel/grupo */
export const navigationIntentRef = { current: 'initial' };

export const markUserNavigation = () => {
    navigationIntentRef.current = 'user';
};

export const markInitialNavigation = () => {
    navigationIntentRef.current = 'initial';
};
