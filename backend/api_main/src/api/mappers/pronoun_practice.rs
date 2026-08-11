use crate::api::dto::pronoun_practice::UpdateProgressRequest;
use crate::domain::models::story::ProgressUpdate;

pub fn to_progress_update(payload: UpdateProgressRequest) -> ProgressUpdate {
    ProgressUpdate {
        user_id: payload.user_id,
        story_id: payload.story_id,
        current_episode_id: payload.current_episode_id,
        current_step_order: payload.current_step_order,
        score_increment: payload.score_increment,
        status: payload.status,
    }
}
