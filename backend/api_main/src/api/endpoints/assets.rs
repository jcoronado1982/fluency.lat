use crate::{domain::repositories::media_delivery::MediaDeliveryProvider, AppState};
use axum::{
    extract::{OriginalUri, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
};

fn asset_request_version(uri: &http::Uri) -> Option<&str> {
    uri.query()?.split('&').find_map(|parameter| {
        let (name, value) = parameter.split_once('=')?;
        let safe = !value.is_empty()
            && value
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
        (matches!(name, "v" | "t") && safe).then_some(value)
    })
}

fn asset_is_versioned(uri: &http::Uri) -> bool {
    asset_request_version(uri).is_some()
}

fn insert_asset_cache_headers(
    headers: &mut HeaderMap,
    uri: &http::Uri,
    provider: &dyn MediaDeliveryProvider,
) {
    let policy = provider.cache_policy(asset_is_versioned(uri));
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_str(policy.browser_cache_control)
            .unwrap_or_else(|_| HeaderValue::from_static("no-store")),
    );
    if let Some(shared) = policy.shared_cache_control {
        if let (Ok(name), Ok(value)) = (
            header::HeaderName::from_bytes(shared.header_name.as_bytes()),
            HeaderValue::from_str(shared.value),
        ) {
            headers.insert(name, value);
        }
    }
}

pub async fn redirect_images(
    Path(file_path): Path<String>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de imagen inválida.").into_response();
    }

    let blob_path = format!("{}/{}", state.settings.gcs_images_prefix, file_path);
    // Una URL ?v= ya identificó el contenido al resolver la tarjeta. Repetir
    // blob_version aquí agregaba otro HEAD contra Oracle antes de cada descarga.
    let version = match asset_request_version(&uri) {
        Some(value) => Some(value.to_string()),
        None => state
            .storage_repo
            .blob_version(&blob_path)
            .await
            .ok()
            .flatten(),
    };
    let etag = version.as_ref().map(|value| format!("\"{value}\""));

    if let (Some(client_tag), Some(server_tag)) = (
        headers
            .get(header::IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok()),
        etag.as_deref(),
    ) {
        if client_tag == server_tag {
            return StatusCode::NOT_MODIFIED.into_response();
        }
    }

    // 1. Servir bytes (local u Oracle vía StorageRepository del shell)
    if let Ok(bytes) = state.storage_repo.download_blob(&blob_path).await {
        let content_type = if file_path.ends_with(".png") {
            "image/png"
        } else if file_path.ends_with(".webp") {
            "image/webp"
        } else if file_path.ends_with(".jpg") || file_path.ends_with(".jpeg") {
            "image/jpeg"
        } else {
            "image/avif"
        };
        let mut response = Response::new(bytes.into());
        let response_headers = response.headers_mut();
        response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
        insert_asset_cache_headers(
            response_headers,
            &uri,
            state.media_delivery_provider.as_ref(),
        );
        if let Some(server_tag) = etag {
            if let Ok(value) = HeaderValue::from_str(&server_tag) {
                response_headers.insert(header::ETAG, value);
            }
        }
        return response;
    }

    // Sin redirect cross-origin: si no existe, 404 claro para el cliente
    StatusCode::NOT_FOUND.into_response()
}

fn audio_content_type(file_path: &str) -> &'static str {
    if file_path.ends_with(".wav") {
        "audio/wav"
    } else if file_path.ends_with(".mp3") {
        "audio/mpeg"
    } else {
        "audio/ogg"
    }
}

pub async fn redirect_audio(
    Path(file_path): Path<String>,
    headers: HeaderMap,
    OriginalUri(uri): OriginalUri,
    State(state): State<AppState>,
) -> impl IntoResponse {
    if file_path.contains("..") || file_path.starts_with('/') {
        return (StatusCode::BAD_REQUEST, "Ruta de audio inválida.").into_response();
    }

    // El nombre determinista hashea los INPUTS del TTS (texto/idioma/modelo), no el
    // contenido: rotar voz reescribe el mismo archivo. Misma política que imágenes:
    // ?v=/?t= → caché larga solo en Cloudflare; navegador y URLs sin versión revalidan.
    let blob_path = format!("{}/{}", state.settings.gcs_audio_prefix, file_path);
    let content_type = audio_content_type(&file_path);

    let version = match asset_request_version(&uri) {
        Some(value) => Some(value.to_string()),
        None => state
            .storage_repo
            .blob_version(&blob_path)
            .await
            .ok()
            .flatten(),
    };
    let etag = version.as_ref().map(|value| format!("\"{value}\""));

    if let (Some(client_tag), Some(server_tag)) = (
        headers
            .get(header::IF_NONE_MATCH)
            .and_then(|value| value.to_str().ok()),
        etag.as_deref(),
    ) {
        if client_tag == server_tag {
            return StatusCode::NOT_MODIFIED.into_response();
        }
    }

    match state.storage_repo.download_blob(&blob_path).await {
        Ok(bytes) => {
            let mut response = Response::new(axum::body::Body::from(bytes));
            let response_headers = response.headers_mut();
            response_headers.insert(header::CONTENT_TYPE, HeaderValue::from_static(content_type));
            insert_asset_cache_headers(
                response_headers,
                &uri,
                state.media_delivery_provider.as_ref(),
            );
            if let Some(server_tag) = etag {
                if let Ok(value) = HeaderValue::from_str(&server_tag) {
                    response_headers.insert(header::ETAG, value);
                }
            }
            response.into_response()
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

#[cfg(test)]
mod tests {
    use super::{asset_is_versioned, asset_request_version, insert_asset_cache_headers};
    use axum::http::{header, HeaderMap, Uri};
    use fluency_core::ports::media_delivery::{
        MediaCachePolicy, MediaDeliveryProvider, SharedCacheControl,
    };

    struct TestProvider {
        versioned: MediaCachePolicy,
        unversioned: MediaCachePolicy,
    }

    impl MediaDeliveryProvider for TestProvider {
        fn name(&self) -> &'static str {
            "test"
        }

        fn cache_policy(&self, versioned: bool) -> MediaCachePolicy {
            if versioned {
                self.versioned
            } else {
                self.unversioned
            }
        }
    }

    fn cloudflare_like_provider() -> TestProvider {
        TestProvider {
            versioned: MediaCachePolicy {
                browser_cache_control: "public, no-cache",
                shared_cache_control: Some(SharedCacheControl {
                    header_name: "cloudflare-cdn-cache-control",
                    value: "public, max-age=31536000",
                }),
            },
            unversioned: MediaCachePolicy {
                browser_cache_control: "public, no-cache",
                shared_cache_control: Some(SharedCacheControl {
                    header_name: "cloudflare-cdn-cache-control",
                    value: "public, no-cache",
                }),
            },
        }
    }

    #[test]
    fn versioned_assets_delegate_long_cache_only_to_cloudflare() {
        let uri: Uri = "/card_audio/example.ogg?v=123".parse().unwrap();
        let mut headers = HeaderMap::new();
        insert_asset_cache_headers(&mut headers, &uri, &cloudflare_like_provider());

        assert!(asset_is_versioned(&uri));
        assert_eq!(
            headers.get(header::CACHE_CONTROL).unwrap(),
            "public, no-cache"
        );
        assert_eq!(
            headers.get("cloudflare-cdn-cache-control").unwrap(),
            "public, max-age=31536000"
        );
    }

    #[test]
    fn oracle_mode_uses_the_browser_cache_without_cloudflare() {
        let uri: Uri = "/card_images/example.avif?v=123".parse().unwrap();
        let mut headers = HeaderMap::new();
        let provider = TestProvider {
            versioned: MediaCachePolicy {
                browser_cache_control: "public, max-age=31536000, immutable",
                shared_cache_control: None,
            },
            unversioned: MediaCachePolicy {
                browser_cache_control: "public, no-cache",
                shared_cache_control: None,
            },
        };
        insert_asset_cache_headers(&mut headers, &uri, &provider);

        assert_eq!(
            headers.get(header::CACHE_CONTROL).unwrap(),
            "public, max-age=31536000, immutable"
        );
        assert!(headers.get("cloudflare-cdn-cache-control").is_none());
    }

    #[test]
    fn unversioned_assets_revalidate_everywhere() {
        let uri: Uri = "/card_images/example.avif".parse().unwrap();
        let mut headers = HeaderMap::new();
        insert_asset_cache_headers(&mut headers, &uri, &cloudflare_like_provider());

        assert!(!asset_is_versioned(&uri));
        assert_eq!(
            headers.get(header::CACHE_CONTROL).unwrap(),
            "public, no-cache"
        );
        assert_eq!(
            headers.get("cloudflare-cdn-cache-control").unwrap(),
            "public, no-cache"
        );
    }

    #[test]
    fn similarly_named_query_parameter_is_not_a_version() {
        let uri: Uri = "/card_images/example.avif?preview=true".parse().unwrap();
        assert!(!asset_is_versioned(&uri));
    }

    #[test]
    fn extracts_safe_version_without_another_metadata_lookup() {
        let uri: Uri = "/card_audio/example.ogg?v=1783175236-21641"
            .parse()
            .unwrap();
        assert_eq!(asset_request_version(&uri), Some("1783175236-21641"));

        let unsafe_uri: Uri = "/card_audio/example.ogg?v=%0Ainvalid".parse().unwrap();
        assert_eq!(asset_request_version(&unsafe_uri), None);
    }
}
