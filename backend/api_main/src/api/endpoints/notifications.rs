use crate::AppState;
use axum::{
    extract::State,
    response::sse::{Event, Sse},
};
use futures::stream::{self, Stream};
use std::{convert::Infallible, time::Duration};
use tokio_stream::StreamExt;

pub async fn stream_notifications(
    State(state): State<AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    // 1. Corazón de la conexión (Heartbeat cada 15s)
    let heartbeats = stream::repeat_with(|| Event::default().data(r#"{"type":"ping"}"#))
        .throttle(Duration::from_secs(15));

    // 2. Suscribirse a los eventos reales del sistema (vía broadcast channel)
    let receiver = state.notification_sender.subscribe();
    let events = stream::unfold(receiver, |mut rx| async move {
        match rx.recv().await {
            Ok(msg) => Some((Event::default().data(msg), rx)),
            Err(_) => None, // Ocurre si el canal se cierra o hay lag (remedio: reconexión)
        }
    });

    // 3. Fusionar ambos flujos para que el cliente reciba pings y datos reales
    let stream = stream::select(heartbeats, events).map(Ok);

    Sse::new(stream).keep_alive(axum::response::sse::KeepAlive::new())
}
