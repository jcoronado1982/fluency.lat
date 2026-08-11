use axum::{extract::State, http::StatusCode, response::IntoResponse, Json};

use mod_shell::local_agent_use_cases::AgentRequest;

use crate::AppState;

#[allow(dead_code)]
pub async fn local_agent_turn(

    State(state): State<AppState>,
    Json(payload): Json<AgentRequest>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    match state.local_agent_use_cases.run(payload).await {
        Ok(response) => Ok((StatusCode::OK, Json(response)).into_response()),
        Err(err) => Err((StatusCode::INTERNAL_SERVER_ERROR, err.to_string())),
    }
}
