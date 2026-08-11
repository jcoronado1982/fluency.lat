use crate::domain::models::flashcard::DeckData;
use anyhow::Result;
use async_trait::async_trait;

#[async_trait]
pub trait StorageRepository: Send + Sync {
    /// Manifiesto global generado durante build/deploy; contiene solo metadatos.
    async fn get_catalog_manifest(&self) -> Result<Vec<u8>>;
    async fn list_categories_for_direction(&self, course_direction: &str) -> Result<Vec<String>>;
    async fn list_decks_for_direction(
        &self,
        course_direction: &str,
        category: &str,
    ) -> Result<Vec<String>>;
    async fn get_deck_data_for_direction(
        &self,
        course_direction: &str,
        category: &str,
        deck_name: &str,
    ) -> Result<DeckData>;
    async fn save_deck_data_for_direction(
        &self,
        course_direction: &str,
        category: &str,
        deck_name: &str,
        data: &DeckData,
    ) -> Result<()>;
    async fn list_categories(&self) -> Result<Vec<String>> {
        self.list_categories_for_direction("es_en").await
    }
    async fn list_decks(&self, category: &str) -> Result<Vec<String>> {
        self.list_decks_for_direction("es_en", category).await
    }
    async fn get_deck_data(&self, category: &str, deck_name: &str) -> Result<DeckData> {
        self.get_deck_data_for_direction("es_en", category, deck_name)
            .await
    }
    async fn save_deck_data(&self, category: &str, deck_name: &str, data: &DeckData) -> Result<()> {
        self.save_deck_data_for_direction("es_en", category, deck_name, data)
            .await
    }
    async fn get_phonics_data(&self) -> Result<serde_json::Value>;
    async fn download_blob(&self, blob_path: &str) -> Result<Vec<u8>>;
    async fn upload_blob(
        &self,
        blob_path: &str,
        content: Vec<u8>,
        content_type: &str,
    ) -> Result<()>;
    async fn blob_exists(&self, blob_path: &str) -> Result<bool>;
    /// Versión estable del blob para cache-busting/ETag (p. ej. mtime).
    async fn blob_version(&self, blob_path: &str) -> Result<Option<String>>;
    async fn find_blob_by_prefix(&self, prefix: &str) -> Result<Option<String>>;
    async fn delete_blob(&self, blob_path: &str) -> Result<()>;
    /// Mueve/renombra un blob (p. ej. archivar audio activo sin borrarlo).
    async fn rename_blob(&self, from_path: &str, to_path: &str) -> Result<()>;
    /// Lista nombres de archivo en un directorio relativo (sin HEAD por archivo).
    async fn list_files_in_dir(&self, rel_dir: &str) -> Result<Vec<String>>;
    /// Gate temporal del runner de preprod local (`.local-preprod-media.lock`):
    /// mientras esté activo, las mutaciones de media deben rechazarse con 423.
    /// Los adapters sin runner de preprod local pueden dejar el default `false`.
    async fn is_locked_for_local_preprod(&self) -> bool {
        false
    }
}
