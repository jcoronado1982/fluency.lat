use crate::config::Settings;
use crate::domain::repositories::image::ImageGenerator;
use anyhow::{anyhow, Context, Result};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::json;
use std::time::Instant;
use tokio::time::{sleep, Duration};
use tracing::{debug, warn};

#[allow(dead_code)]
fn preview_for_log(text: &str, max_chars: usize) -> String {
    let compact = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = String::new();
    for ch in compact.chars().take(max_chars) {
        preview.push(ch);
    }
    if compact.chars().count() > max_chars {
        preview.push_str("...");
    }
    preview
}

pub struct ComfyUIProvider {
    client: Client,
    url: String,
}

const FLUX_IMAGE_WIDTH: u32 = 768;
const FLUX_IMAGE_HEIGHT: u32 = 512;
const FLUX_GUIDANCE: f32 = 3.6;
const FLUX_STEPS: u32 = 20;
const COMFY_HISTORY_POLL_MAX_ATTEMPTS: u32 = 180;
const COMFY_AVAILABLE_MAX_ATTEMPTS: u32 = 180;

impl ComfyUIProvider {
    pub fn new(settings: &Settings) -> Self {
        // ComfyUI corre en localhost: TCP_NODELAY elimina el delay Nagle
        // que de otro modo añade ~40 ms en loopback.
        let client = Client::builder()
            .pool_max_idle_per_host(4)
            .tcp_nodelay(true)
            .timeout(std::time::Duration::from_secs(180))
            .build()
            .expect("Error building ComfyUI HTTP client");
        Self {
            client,
            url: settings.comfy_url.clone(),
        }
    }

    async fn wait_for_idle(&self) -> Result<()> {
        let queue_url = format!("{}/queue", self.url);
        let mut attempts = 0;
        loop {
            match self
                .client
                .get(&queue_url)
                .timeout(Duration::from_secs(5))
                .send()
                .await
            {
                Ok(resp) => {
                    if let Ok(json) = resp.json::<serde_json::Value>().await {
                        let running_empty = json
                            .get("queue_running")
                            .and_then(|v| v.as_array())
                            .map(|a| a.is_empty())
                            .unwrap_or(true);
                        let pending_empty = json
                            .get("queue_pending")
                            .and_then(|v| v.as_array())
                            .map(|a| a.is_empty())
                            .unwrap_or(true);

                        if running_empty && pending_empty {
                            return Ok(());
                        }
                    }
                }
                Err(_) => {
                    // ComfyUI puede estar bloqueado cargando tensores
                }
            }

            if attempts >= COMFY_AVAILABLE_MAX_ATTEMPTS {
                return Err(anyhow!(
                    "ComfyUI not idle after {} attempts",
                    COMFY_AVAILABLE_MAX_ATTEMPTS
                ));
            }

            sleep(Duration::from_secs(5)).await;
            attempts += 1;
        }
    }
}

#[async_trait]
impl ImageGenerator for ComfyUIProvider {
    async fn generate(&self, prompt: &str) -> Result<Vec<u8>> {
        let request_started_at = Instant::now();
        /*
        info!(
            prompt_len = prompt.len(),
            prompt_preview = %preview_for_log(prompt, 180),
            comfy_url = %self.url,
            "comfy:start"
        );
        */
        // Robustness: Wait for ComfyUI to be completely idle before submitting
        self.wait_for_idle().await?;

        let client_id = uuid::Uuid::new_v4().to_string();

        let workflow = json!({
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        // Flux/Klein converges more reliably with native guidance in the 3.5-3.8 range.
                        "cfg": FLUX_GUIDANCE,
                        "denoise": 1,
                        "latent_image": ["5", 0],
                        "model": ["10", 0],
                        "negative": ["21", 0],
                        "positive": ["20", 0],
                        "sampler_name": "euler",
                        "scheduler": "simple",
                        "seed": rand::random::<u32>(),
                        "steps": FLUX_STEPS
                    }
                },
                "5": {
                    "class_type": "EmptyLatentImage",
                    "inputs": {
                        "batch_size": 1,
                        "height": FLUX_IMAGE_HEIGHT,
                        "width": FLUX_IMAGE_WIDTH
                    }
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {
                        "samples": ["3", 0],
                        "vae": ["12", 0]
                    }
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": format!("rust_gen_{}", client_id),
                        "images": ["8", 0]
                    }
                },
                "10": {
                    "class_type": "UnetLoaderGGUF",
                    "inputs": {
                        "unet_name": "flux-2-klein-9b-Q8_0.gguf"
                    }
                },
                "11": {
                    "class_type": "CLIPLoaderGGUF",
                    "inputs": {
                        "clip_name": "Qwen_Qwen3-8B-Q8_0.gguf",
                        "type": "flux2"
                    }
                },
                "12": {
                    "class_type": "VAELoader",
                    "inputs": {
                        "vae_name": "flux2-vae.safetensors"
                    }
                },
                "20": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["11", 0],
                        "text": prompt
                    }
                },
                "21": {
                    "class_type": "CLIPTextEncode",
                    "inputs": {
                        "clip": ["11", 0],
                        "text": "text, words, letters, font, typography, watermark, signature, blurry, low quality"
                    }
                }
            }
        });

        /*
        info!(
            prompt_len = prompt.len(),
            workflow_model = "flux-2-klein-9b-Q8_0.gguf",
            workflow_clip = "Qwen_Qwen3-8B-Q8_0.gguf",
            workflow_vae = "flux2-vae.safetensors",
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "comfy:workflow-built"
        );
        */

        /*
        let workflow = json!({
            "prompt": {
                "3": {
                    "class_type": "KSampler",
                    "inputs": {
                        "cfg": 3.0,
                        "denoise": 1.0,
                        "latent_image": ["5", 0],
                        "model": ["10", 0],
                        "negative": ["23", 0],
                        "positive": ["22", 0],
                        "sampler_name": "euler",
                        "scheduler": "simple",
                        "seed": rand::random::<u32>(),
                        "steps": 25
                    }
                },
                "5": {
                    "class_type": "EmptySanaLatentImage",
                    "inputs": {
                        "batch_size": 1,
                        "height": 1024,
                        "width": 1024
                    }
                },
                "8": {
                    "class_type": "VAEDecode",
                    "inputs": {
                        "samples": ["3", 0],
                        "vae": ["12", 0]
                    }
                },
                "9": {
                    "class_type": "SaveImage",
                    "inputs": {
                        "filename_prefix": format!("rust_gen_{}", client_id),
                        "images": ["8", 0]
                    }
                },
                "10": {
                    "class_type": "SanaCheckpointLoader",
                    "inputs": {
                        "ckpt_name": "Sana_1600M_1024px.pth",
                        "model": "SanaMS_1600M_P1_D20"
                    }
                },
                "11": {
                    "class_type": "GemmaLoader",
                    "inputs": {
                        "model_name": "Efficient-Large-Model/gemma-2-2b-it",
                        "device": "cpu",
                        "dtype": "default"
                    }
                },
                "12": {
                    "class_type": "ExtraVAELoader",
                    "inputs": {
                        "vae_name": "sana_vae.safetensors",
                        "vae_type": "dcae-f32c32-sana-1.0",
                        "dtype": "auto"
                    }
                },
                "20": {
                    "class_type": "SanaTextEncode",
                    "inputs": {
                        "text": prompt,
                        "GEMMA": ["11", 0]
                    }
                },
                "21": {
                    "class_type": "SanaTextEncode",
                    "inputs": {
                        "text": "cartoon, illustration, drawing, painting, anime, graphic, digital art, vector, 3d render, CGI, outline, white outline, text, words, letters, font, typography, watermark, signature, blurry, low quality",
                        "GEMMA": ["11", 0]
                    }
                },
                "22": {
                    "class_type": "SanaResolutionCond",
                    "inputs": {
                        "cond": ["20", 0],
                        "width": 1024,
                        "height": 1024
                    }
                },
                "23": {
                    "class_type": "SanaResolutionCond",
                    "inputs": {
                        "cond": ["21", 0],
                        "width": 1024,
                        "height": 1024
                    }
                }
            }
        });
        */

        let url = format!("{}/prompt", self.url);
        let resp = self
            .client
            .post(&url)
            .json(&workflow)
            .send()
            .await?
            .error_for_status()?;

        let json: serde_json::Value = resp.json().await?;
        let prompt_id = json["prompt_id"]
            .as_str()
            .context("No prompt_id in response")?;

        /*
        info!(
            prompt_id = %prompt_id,
            elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "comfy:prompt-submitted"
        );
        */

        // Polling for completion using /history/{prompt_id}
        let history_url = format!("{}/history/{}", self.url, prompt_id);
        let mut attempts = 0;
        while attempts < COMFY_HISTORY_POLL_MAX_ATTEMPTS {
            let h_resp = match self.client.get(&history_url).send().await {
                Ok(resp) => resp,
                Err(err) => {
                    warn!(
                        prompt_id = %prompt_id,
                        attempt = attempts + 1,
                        error = %err,
                        "ComfyUI history poll failed, retrying"
                    );
                    sleep(Duration::from_secs(1)).await;
                    attempts += 1;
                    continue;
                }
            };
            if h_resp.status().is_success() {
                let h_json: serde_json::Value = h_resp.json().await?;
                if !h_json[prompt_id].is_null() {
                    /*
                    info!(
                        prompt_id = %prompt_id,
                        elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                        "comfy:history-complete"
                    );
                    */
                    // Completed!
                    let outputs = &h_json[prompt_id]["outputs"];
                    // Node 9 is SaveImage
                    let filename = outputs["9"]["images"][0]["filename"]
                        .as_str()
                        .context("No filename in output")?;
                    let subfolder = outputs["9"]["images"][0]["subfolder"]
                        .as_str()
                        .unwrap_or("");

                    // Download the image
                    let view_url = format!(
                        "{}/view?filename={}&subfolder={}&type=output",
                        self.url, filename, subfolder
                    );
                    let img_resp = self.client.get(&view_url).send().await?;
                    let bytes = img_resp.bytes().await?;
                    /*
                    info!(
                        prompt_id = %prompt_id,
                        bytes = bytes.len(),
                        total_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                        "comfy:image-downloaded"
                    );
                    */

                    // Liberar memoria y limpiar cache de ComfyUI
                    let free_url = format!("{}/free", self.url);
                    if let Err(e) = self
                        .client
                        .post(&free_url)
                        .json(&serde_json::json!({
                            "unload_models": false,
                            "free_memory": true
                        }))
                        .send()
                        .await
                    {
                        warn!("Failed to request ComfyUI cache purge: {}", e);
                    }

                    return Ok(bytes.to_vec());
                }
            }
            if attempts % 15 == 0 {
                debug!(
                    prompt_id = %prompt_id,
                    attempt = attempts + 1,
                    elapsed_ms = request_started_at.elapsed().as_millis() as u64,
                    "comfy:history-polling"
                );
            }
            sleep(Duration::from_secs(1)).await;
            attempts += 1;
        }

        warn!(
            prompt_id = %prompt_id,
            total_elapsed_ms = request_started_at.elapsed().as_millis() as u64,
            "comfy:timeout"
        );
        Err(anyhow!(
            "ComfyUI timeout for prompt {} after {} seconds",
            prompt_id,
            COMFY_HISTORY_POLL_MAX_ATTEMPTS
        ))
    }
}
