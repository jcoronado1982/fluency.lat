/// Instrucción opcional para una caché compartida/CDN. El puerto no conoce HTTP
/// frameworks ni proveedores concretos; cada adaptador define su header.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SharedCacheControl {
    pub header_name: &'static str,
    pub value: &'static str,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct MediaCachePolicy {
    pub browser_cache_control: &'static str,
    pub shared_cache_control: Option<SharedCacheControl>,
}

/// Puerto de entrega de media. Agregar un CDN nuevo requiere otro adaptador y
/// registrarlo en el composition root, sin modificar handlers ni casos de uso.
pub trait MediaDeliveryProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn cache_policy(&self, versioned: bool) -> MediaCachePolicy;
}
