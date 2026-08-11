use anyhow::{anyhow, bail, Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Component, Path, PathBuf};
use std::process::Stdio;
use tokio::time::{timeout, Duration};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRequest {
    pub prompt: String,
    pub workspace_root: Option<String>,
    pub model: Option<String>,
    pub max_steps: Option<u32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentStep {
    pub step: u32,
    pub tool: String,
    pub args: Value,
    pub observation: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AgentResponse {
    pub success: bool,
    pub model: String,
    pub answer: String,
    pub workspace_root: String,
    pub steps: Vec<AgentStep>,
}

#[derive(Debug, Clone)]
pub struct LocalAgentSettings {
    pub ollama_url: String,
    pub local_agent_model: String,
    pub local_agent_workspace_root: String,
    pub local_agent_max_steps: u32,
    pub local_agent_allowed_command_prefixes: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
struct OllamaChatResponse {
    message: OllamaMessage,
}

#[derive(Debug, Deserialize)]
struct OllamaMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct AgentDecision {
    #[serde(rename = "type")]
    decision_type: String,
    tool: Option<String>,
    args: Option<Value>,
    message: Option<String>,
}

pub struct LocalAgentUseCases {
    settings: LocalAgentSettings,
    client: reqwest::Client,
}

impl LocalAgentUseCases {
    pub fn new(settings: LocalAgentSettings) -> Self {
        Self {
            settings,
            client: reqwest::Client::new(),
        }
    }

    pub async fn run(&self, request: AgentRequest) -> Result<AgentResponse> {
        let workspace_root = self.resolve_workspace_root(request.workspace_root.as_deref())?;
        let model = request
            .model
            .unwrap_or_else(|| self.settings.local_agent_model.clone());
        let max_steps = request
            .max_steps
            .unwrap_or(self.settings.local_agent_max_steps)
            .clamp(1, 16);

        let system_prompt = self.system_prompt(&workspace_root);
        let mut messages = vec![
            ChatMessage::system(system_prompt),
            ChatMessage::user(format!(
                "Task:\n{}\n\nWorkspace root:\n{}\n",
                request.prompt,
                workspace_root.display()
            )),
        ];
        let mut steps = Vec::new();

        for step in 1..=max_steps {
            let content = self.call_ollama(&model, &messages).await?;
            let decision = self.parse_decision(&content)?;

            match decision.decision_type.as_str() {
                "final" => {
                    let answer = decision
                        .message
                        .or_else(|| extract_text_fallback(&content))
                        .unwrap_or(content);
                    return Ok(AgentResponse {
                        success: true,
                        model,
                        answer,
                        workspace_root: workspace_root.display().to_string(),
                        steps,
                    });
                }
                "tool" => {
                    let tool = decision
                        .tool
                        .ok_or_else(|| anyhow!("La decisión del agente no incluyó `tool`"))?;
                    let args = decision.args.unwrap_or(Value::Null);
                    let observation = self.execute_tool(&workspace_root, &tool, &args).await?;
                    steps.push(AgentStep {
                        step,
                        tool: tool.clone(),
                        args: args.clone(),
                        observation: observation.clone(),
                    });
                    messages.push(ChatMessage::assistant(content));
                    messages.push(ChatMessage::user(format!(
                        "Tool result for `{tool}`:\n{observation}"
                    )));
                }
                other => {
                    return Err(anyhow!(
                        "Tipo de decisión desconocido `{other}`. Usa `tool` o `final`."
                    ));
                }
            }
        }

        Ok(AgentResponse {
            success: false,
            model,
            answer: "El agente alcanzó el máximo de pasos sin cerrar la tarea.".to_string(),
            workspace_root: workspace_root.display().to_string(),
            steps,
        })
    }

    fn resolve_workspace_root(&self, requested: Option<&str>) -> Result<PathBuf> {
        let default_root = Path::new(&self.settings.local_agent_workspace_root)
            .canonicalize()
            .with_context(|| {
                format!(
                    "No se pudo resolver LOCAL_AGENT_WORKSPACE_ROOT: {}",
                    self.settings.local_agent_workspace_root
                )
            })?;

        match requested {
            Some(root) => {
                let candidate = Path::new(root)
                    .canonicalize()
                    .with_context(|| format!("Workspace inválido: {root}"))?;
                if !candidate.starts_with(&default_root) {
                    bail!(
                        "El workspace solicitado está fuera de la raíz permitida: {}",
                        default_root.display()
                    );
                }
                Ok(candidate)
            }
            None => Ok(default_root),
        }
    }

    fn system_prompt(&self, workspace_root: &Path) -> String {
        let commands = self
            .settings
            .local_agent_allowed_command_prefixes
            .iter()
            .map(|prefix| prefix.join(" "))
            .collect::<Vec<_>>()
            .join(", ");

        format!(
            "Eres un agente local de programación para un workspace Rust/JS.\n\
             Objetivo: editar el proyecto y ejecutar acciones controladas.\n\
             No muestres razonamiento interno. Responde solo JSON válido.\n\
             Raiz del workspace: {}\n\
             Herramientas disponibles:\n\
             - list_files: {{\"path\":\"relativo/opcional\",\"limit\":50}}\n\
             - read_file: {{\"path\":\"relativo/requerido\"}}\n\
             - write_file: {{\"path\":\"relativo\",\"content\":\"texto completo\"}}\n\
             - search: {{\"query\":\"texto\",\"path\":\"relativo/opcional\",\"limit\":20}}\n\
             - run_command: {{\"command\":\"comando permitido\"}}\n\
             Reglas:\n\
             - Usa rutas relativas al workspace.\n\
             - `write_file` solo dentro del workspace.\n\
             - `run_command` solo para prefijos permitidos: {}\n\
             - Si ya terminaste, responde {{\"type\":\"final\",\"message\":\"...\"}}.\n\
             - Si necesitas una herramienta, responde {{\"type\":\"tool\",\"tool\":\"...\",\"args\":{{...}},\"message\":\"breve motivo\"}}.\n\
             - No inventes cambios que no hayas aplicado.\n",
            workspace_root.display(),
            commands
        )
    }

    async fn call_ollama(&self, model: &str, messages: &[ChatMessage]) -> Result<String> {
        let url = format!(
            "{}/api/chat",
            self.settings.ollama_url.trim_end_matches('/')
        );
        let payload = serde_json::json!({
            "model": model,
            "stream": false,
            "format": "json",
            "options": {
                "temperature": 0.2,
                "num_ctx": 8192,
                "num_predict": 1024
            },
            "messages": messages,
        });

        let response = self
            .client
            .post(url)
            .json(&payload)
            .send()
            .await
            .context("No se pudo llamar a Ollama")?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow!("Ollama respondió {status}: {body}"));
        }

        let parsed: OllamaChatResponse = response
            .json()
            .await
            .context("Respuesta inválida de Ollama")?;
        Ok(parsed.message.content)
    }

    fn parse_decision(&self, content: &str) -> Result<AgentDecision> {
        let json_text = extract_json_object(content)
            .ok_or_else(|| anyhow!("El agente no devolvió JSON parseable: {content}"))?;
        let decision: AgentDecision = serde_json::from_str(&json_text)
            .context("No se pudo parsear la decisión del agente")?;
        Ok(decision)
    }

    async fn execute_tool(
        &self,
        workspace_root: &Path,
        tool: &str,
        args: &Value,
    ) -> Result<String> {
        match tool {
            "list_files" => {
                let rel = args.get("path").and_then(Value::as_str).unwrap_or(".");
                let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(50) as usize;
                let path = self.resolve_relative_path(workspace_root, rel)?;
                self.list_files(&path, limit).await
            }
            "read_file" => {
                let rel = args
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("`read_file` requiere `path`"))?;

                let forbidden = [".env", ".env.local", ".env.production", "SECRETS_MAP.md", ".pem", ".key", "credentials.json", ".ssh"];
                let normalized_rel = rel.to_lowercase();
                if forbidden.iter().any(|f| normalized_rel.ends_with(f) || normalized_rel.contains(&format!("{}/", f))) {
                    anyhow::bail!("Lectura prohibida en archivo sensible: {}", rel);
                }

                let path = self.resolve_relative_path(workspace_root, rel)?;
                tokio::fs::read_to_string(&path)
                    .await
                    .with_context(|| format!("No se pudo leer {}", path.display()))
            }
            "write_file" => {
                let rel = args
                    .get("path")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("`write_file` requiere `path`"))?;

                let forbidden = [".env", ".env.local", ".env.production", "Cargo.toml", "Cargo.lock", "package.json", ".git", ".ssh", ".pem", ".key", "credentials.json", "SECRETS_MAP.md"];
                let normalized_rel = rel.to_lowercase();
                if forbidden.iter().any(|f| normalized_rel.ends_with(f) || normalized_rel.contains(&format!("{}/", f))) {
                    anyhow::bail!("Escritura prohibida en archivo sensible: {}", rel);
                }

                let content = args
                    .get("content")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("`write_file` requiere `content`"))?;
                let path = self.resolve_relative_path(workspace_root, rel)?;
                if let Some(parent) = path.parent() {
                    tokio::fs::create_dir_all(parent).await.with_context(|| {
                        format!("No se pudo crear el directorio {}", parent.display())
                    })?;
                }
                tokio::fs::write(&path, content)
                    .await
                    .with_context(|| format!("No se pudo escribir {}", path.display()))?;
                Ok(format!("Archivo escrito: {}", path.display()))
            }

            "search" => {
                let query = args
                    .get("query")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("`search` requiere `query`"))?;
                let rel = args.get("path").and_then(Value::as_str).unwrap_or(".");
                let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(20) as usize;
                let path = self.resolve_relative_path(workspace_root, rel)?;
                self.search_text(&path, query, limit).await
            }
            "run_command" => {
                let command = args
                    .get("command")
                    .and_then(Value::as_str)
                    .ok_or_else(|| anyhow!("`run_command` requiere `command`"))?;
                self.run_command(workspace_root, command).await
            }
            other => Err(anyhow!("Herramienta desconocida: {other}")),
        }
    }

    fn resolve_relative_path(&self, workspace_root: &Path, rel: &str) -> Result<PathBuf> {
        let rel = Path::new(rel);
        if rel.is_absolute() {
            bail!("La ruta debe ser relativa al workspace");
        }

        let mut cleaned = PathBuf::new();
        for component in rel.components() {
            match component {
                Component::CurDir => {}
                Component::Normal(part) => cleaned.push(part),
                _ => bail!("La ruta contiene segmentos no permitidos"),
            }
        }

        Ok(workspace_root.join(cleaned))
    }

    async fn list_files(&self, path: &Path, limit: usize) -> Result<String> {
        let mut out = Vec::new();
        self.collect_files(path, path, limit, &mut out).await?;
        Ok(out.join("\n"))
    }

    async fn collect_files(
        &self,
        base: &Path,
        dir: &Path,
        limit: usize,
        out: &mut Vec<String>,
    ) -> Result<()> {
        let mut stack = vec![dir.to_path_buf()];
        while let Some(current) = stack.pop() {
            let mut entries = tokio::fs::read_dir(&current)
                .await
                .with_context(|| format!("No se pudo listar {}", current.display()))?;
            while let Some(entry) = entries
                .next_entry()
                .await
                .with_context(|| format!("No se pudo leer {}", current.display()))?
            {
                if out.len() >= limit {
                    return Ok(());
                }
                let file_type = entry.file_type().await?;
                let path = entry.path();
                let relative = path.strip_prefix(base).unwrap_or(&path);
                if file_type.is_dir() {
                    out.push(format!("DIR  {}", relative.display()));
                    stack.push(path);
                } else if file_type.is_file() {
                    let size = entry.metadata().await?.len();
                    out.push(format!("FILE {} ({} bytes)", relative.display(), size));
                }
            }
        }
        Ok(())
    }

    async fn search_text(&self, path: &Path, query: &str, limit: usize) -> Result<String> {
        let mut matches = Vec::new();
        self.search_inner(path, query, limit, &mut matches).await?;
        if matches.is_empty() {
            Ok("Sin coincidencias".to_string())
        } else {
            Ok(matches.join("\n"))
        }
    }

    async fn search_inner(
        &self,
        path: &Path,
        query: &str,
        limit: usize,
        matches: &mut Vec<String>,
    ) -> Result<()> {
        let mut stack = vec![path.to_path_buf()];
        while let Some(current) = stack.pop() {
            let meta = tokio::fs::metadata(&current)
                .await
                .with_context(|| format!("No se pudo inspeccionar {}", current.display()))?;
            if meta.is_dir() {
                let mut entries = tokio::fs::read_dir(&current)
                    .await
                    .with_context(|| format!("No se pudo listar {}", current.display()))?;
                while let Some(entry) = entries.next_entry().await? {
                    stack.push(entry.path());
                }
                continue;
            }

            if !meta.is_file() || meta.len() > 1_500_000 {
                continue;
            }

            let content = match tokio::fs::read_to_string(&current).await {
                Ok(text) => text,
                Err(_) => continue,
            };
            for (idx, line) in content.lines().enumerate() {
                if line.contains(query) {
                    matches.push(format!(
                        "{}:{}: {}",
                        current.display(),
                        idx + 1,
                        line.trim()
                    ));
                    if matches.len() >= limit {
                        return Ok(());
                    }
                }
            }
        }
        Ok(())
    }

    async fn run_command(&self, workspace_root: &Path, command: &str) -> Result<String> {
        let parts: Vec<&str> = command.split_whitespace().collect();
        if parts.is_empty() {
            bail!("Comando vacío");
        }
        if !self.is_allowed_command(&parts) {
            bail!("Comando no permitido por la lista blanca: {command}");
        }

        let mut child = tokio::process::Command::new(parts[0]);
        child
            .args(&parts[1..])
            .current_dir(workspace_root)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let output = timeout(Duration::from_secs(120), child.output())
            .await
            .context("Tiempo de espera agotado al ejecutar el comando")?
            .context("No se pudo ejecutar el comando")?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr = String::from_utf8_lossy(&output.stderr);
        let combined = format!(
            "exit_code={}\nstdout:\n{}\nstderr:\n{}",
            output.status.code().unwrap_or(-1),
            stdout,
            stderr
        );
        Ok(truncate_text(&combined, 16_000))
    }

    fn is_allowed_command(&self, parts: &[&str]) -> bool {
        self.settings
            .local_agent_allowed_command_prefixes
            .iter()
            .any(|prefix| {
                parts.len() >= prefix.len()
                    && prefix
                        .iter()
                        .map(|s| s.as_str())
                        .zip(parts.iter().copied())
                        .all(|(a, b)| a == b)
            })
    }
}

#[derive(Debug, Clone, Serialize)]
struct ChatMessage {
    role: String,
    content: String,
}

impl ChatMessage {
    fn system(content: String) -> Self {
        Self {
            role: "system".to_string(),
            content,
        }
    }

    fn user(content: String) -> Self {
        Self {
            role: "user".to_string(),
            content,
        }
    }

    fn assistant(content: String) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
        }
    }
}

fn extract_json_object(text: &str) -> Option<String> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    if end < start {
        return None;
    }
    Some(text[start..=end].to_string())
}

fn extract_text_fallback(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn truncate_text(text: &str, limit: usize) -> String {
    if text.len() <= limit {
        text.to_string()
    } else {
        let mut truncated = text.chars().take(limit).collect::<String>();
        truncated.push_str("\n...[truncated]");
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_workspace() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "fluency-local-agent-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("system clock before Unix epoch")
                .as_nanos()
        ));
        std::fs::create_dir_all(&root).expect("create isolated workspace dir");
        root
    }

    fn fixture_agent(workspace_root: &Path) -> LocalAgentUseCases {
        LocalAgentUseCases::new(LocalAgentSettings {
            ollama_url: "http://127.0.0.1:0".to_string(),
            local_agent_model: "test-model".to_string(),
            local_agent_workspace_root: workspace_root.display().to_string(),
            local_agent_max_steps: 4,
            local_agent_allowed_command_prefixes: vec![
                vec!["git".to_string(), "status".to_string()],
                vec!["cargo".to_string(), "test".to_string()],
            ],
        })
    }

    #[test]
    fn extract_json_object_pulls_the_outermost_braces() {
        assert_eq!(
            extract_json_object(r#"here is json: {"a":1} thanks"#),
            Some(r#"{"a":1}"#.to_string())
        );
        assert_eq!(
            extract_json_object("```json\n{\"type\":\"final\"}\n```"),
            Some(r#"{"type":"final"}"#.to_string())
        );
    }

    #[test]
    fn extract_json_object_returns_none_without_a_matching_brace_pair() {
        assert_eq!(extract_json_object("no braces here"), None);
        assert_eq!(extract_json_object("only { open"), None);
        assert_eq!(extract_json_object("only } close"), None);
    }

    #[test]
    fn extract_text_fallback_trims_and_rejects_blank_strings() {
        assert_eq!(extract_text_fallback("  hola  "), Some("hola".to_string()));
        assert_eq!(extract_text_fallback("   \n\t  "), None);
        assert_eq!(extract_text_fallback(""), None);
    }

    #[test]
    fn truncate_text_keeps_short_text_untouched_and_marks_long_text() {
        assert_eq!(truncate_text("hola", 10), "hola");
        let long = "a".repeat(20);
        let truncated = truncate_text(&long, 5);
        assert!(truncated.starts_with("aaaaa"));
        assert!(truncated.ends_with("[truncated]"));
    }

    #[test]
    fn resolve_relative_path_joins_a_clean_relative_path_under_the_workspace() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        let resolved = agent
            .resolve_relative_path(&root, "src/main.rs")
            .expect("relative path resolves");
        assert_eq!(resolved, root.join("src").join("main.rs"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_relative_path_rejects_absolute_paths() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        assert!(agent.resolve_relative_path(&root, "/etc/passwd").is_err());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_relative_path_rejects_parent_directory_traversal() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        assert!(agent
            .resolve_relative_path(&root, "../../etc/passwd")
            .is_err());
        assert!(agent
            .resolve_relative_path(&root, "subdir/../../escape")
            .is_err());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn resolve_workspace_root_rejects_a_requested_root_outside_the_configured_one() {
        let root = temp_workspace();
        let outside = temp_workspace();
        let agent = fixture_agent(&root);
        assert!(agent
            .resolve_workspace_root(Some(outside.to_str().unwrap()))
            .is_err());
        std::fs::remove_dir_all(&root).ok();
        std::fs::remove_dir_all(&outside).ok();
    }

    #[test]
    fn resolve_workspace_root_defaults_to_the_configured_root() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        let resolved = agent.resolve_workspace_root(None).expect("default root");
        assert_eq!(resolved, root.canonicalize().unwrap());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn is_allowed_command_matches_configured_prefixes_and_extra_args() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        assert!(agent.is_allowed_command(&["git", "status"]));
        assert!(agent.is_allowed_command(&["cargo", "test", "-p", "mod_shell"]));
        assert!(!agent.is_allowed_command(&["git", "push"]));
        assert!(!agent.is_allowed_command(&["rm", "-rf", "/"]));
        assert!(!agent.is_allowed_command(&["git"]));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn parse_decision_reads_a_final_or_tool_json_payload() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        let final_decision = agent
            .parse_decision(r#"{"type":"final","message":"listo"}"#)
            .expect("parses final decision");
        assert_eq!(final_decision.decision_type, "final");
        assert_eq!(final_decision.message.as_deref(), Some("listo"));

        let tool_decision = agent
            .parse_decision(r#"{"type":"tool","tool":"list_files","args":{"path":"."}}"#)
            .expect("parses tool decision");
        assert_eq!(tool_decision.decision_type, "tool");
        assert_eq!(tool_decision.tool.as_deref(), Some("list_files"));
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn parse_decision_rejects_content_without_valid_json() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        assert!(agent.parse_decision("no json here at all").is_err());
        std::fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn system_prompt_lists_the_configured_allowed_command_prefixes() {
        let root = temp_workspace();
        let agent = fixture_agent(&root);
        let prompt = agent.system_prompt(&root);
        assert!(prompt.contains("git status"));
        assert!(prompt.contains("cargo test"));
        assert!(prompt.contains(&root.display().to_string()));
        std::fs::remove_dir_all(&root).ok();
    }
}
