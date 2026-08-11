use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;
use std::env;
use std::io::{self, BufRead};

#[derive(Deserialize, Debug)]
struct McpRequest {
    jsonrpc: String,
    method: String,
    params: serde_json::Value,
    id: Option<serde_json::Value>,
}

#[derive(Serialize, Debug)]
struct McpResponse {
    jsonrpc: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<serde_json::Value>,
    id: Option<serde_json::Value>,
}

#[tokio::main]
async fn main() -> Result<()> {
    dotenvy::dotenv().ok();
    let db_url = env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let sentinel_ip = env::var("SENTINEL_IP").unwrap_or_else(|_| "127.0.0.1".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    let stdin = io::stdin();
    for line in stdin.lock().lines() {
        let line = line?;
        if let Ok(req) = serde_json::from_str::<McpRequest>(&line) {
            let res = handle_request(req, &pool, &sentinel_ip).await;
            println!("{}", serde_json::to_string(&res)?);
        }
    }

    Ok(())
}

async fn handle_request(req: McpRequest, pool: &sqlx::PgPool, sentinel_ip: &str) -> McpResponse {
    let result = match req.method.as_str() {
        "list_tools" => Some(json!({
            "tools": [
                {
                    "name": "db_list_tables",
                    "description": "Lista las tablas de la base de datos",
                    "inputSchema": { "type": "object", "properties": {} }
                },
                {
                    "name": "db_query",
                    "description": "Ejecuta una consulta SELECT segura",
                    "inputSchema": { 
                        "type": "object", 
                        "properties": { 
                            "query": { "type": "string", "description": "Consulta SQL (solo SELECT)" } 
                        },
                        "required": ["query"]
                    }
                },
                {
                    "name": "sentinel_health",
                    "description": "Verifica el estado del centinela de RAM",
                    "inputSchema": { "type": "object", "properties": {} }
                },
                {
                    "name": "az_cli",
                    "description": "Ejecuta cualquier comando de Azure CLI (az)",
                    "inputSchema": { 
                        "type": "object", 
                        "properties": { 
                            "command": { "type": "string", "description": "Comando de Azure CLI (ej: 'group list')" } 
                        },
                        "required": ["command"]
                    }
                },
                {
                    "name": "oci_cli",
                    "description": "Ejecuta cualquier comando de Oracle Cloud CLI (oci)",
                    "inputSchema": { 
                        "type": "object", 
                        "properties": { 
                            "command": { "type": "string", "description": "Comando de OCI CLI (ej: 'compute instance list')" } 
                        },
                        "required": ["command"]
                    }
                },
                {
                    "name": "aws_cli",
                    "description": "Ejecuta cualquier comando de AWS CLI (aws)",
                    "inputSchema": { 
                        "type": "object", 
                        "properties": { 
                            "command": { "type": "string", "description": "Comando de AWS CLI (ej: 's3 ls')" } 
                        },
                        "required": ["command"]
                    }
                }
            ]
        })),
        "call_tool" => {
            let name = req.params["name"].as_str().unwrap_or("");
            let arguments = &req.params["arguments"];
            
            match name {
                "db_list_tables" => {
                    match sqlx::query_as::<_, (String,)>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
                        .fetch_all(pool).await {
                            Ok(tables) => Some(json!({ "content": [{"type": "text", "text": format!("{:?}", tables.iter().map(|t| &t.0).collect::<Vec<_>>())}] })),
                            Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error: {}", e)}] })),
                        }
                },
                "db_query" => {
                    let query_str = arguments["query"].as_str().unwrap_or("");
                    if !query_str.to_uppercase().trim().starts_with("SELECT") {
                        Some(json!({ "content": [{"type": "text", "text": "Error: Solo se permiten consultas SELECT por seguridad"}] }))
                    } else {
                        match sqlx::query(query_str).fetch_all(pool).await {
                            Ok(rows) => {
                                // Simplificado para el ejemplo
                                Some(json!({ "content": [{"type": "text", "text": format!("Resultados: {} filas", rows.len())}] }))
                            },
                            Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error: {}", e)}] })),
                        }
                    }
                },
                "sentinel_health" => {
                    match reqwest::get(format!("http://{}:8888/canenter", sentinel_ip)).await {
                        Ok(res) => {
                            let text = res.text().await.unwrap_or_default();
                            Some(json!({ "content": [{"type": "text", "text": format!("Sentinel Response: {}", text)}] }))
                        },
                        Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error al contactar centinela: {}", e)}] })),
                    }
                },
                "az_cli" => {
                    let cmd_str = arguments["command"].as_str().unwrap_or("");
                    let full_cmd = format!("az {}", cmd_str);
                    let output = std::process::Command::new("sh")
                        .arg("-c")
                        .arg(full_cmd)
                        .output();
                    
                    match output {
                        Ok(out) => {
                            let stdout = String::from_utf8_lossy(&out.stdout);
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            let combined = format!("STDOUT:\n{}\n\nSTDERR:\n{}", stdout, stderr);
                            Some(json!({ "content": [{"type": "text", "text": combined}] }))
                        },
                        Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error al ejecutar az: {}", e)}] })),
                    }
                },
                "oci_cli" => {
                    let cmd_str = arguments["command"].as_str().unwrap_or("");
                    let oci_path = "/home/jcoronado/.local/bin/oci";
                    let full_cmd = format!("{} {}", oci_path, cmd_str);
                    let output = std::process::Command::new("sh")
                        .arg("-c")
                        .arg(full_cmd)
                        .output();
                    
                    match output {
                        Ok(out) => {
                            let stdout = String::from_utf8_lossy(&out.stdout);
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            let combined = format!("STDOUT:\n{}\n\nSTDERR:\n{}", stdout, stderr);
                            Some(json!({ "content": [{"type": "text", "text": combined}] }))
                        },
                        Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error al ejecutar oci: {}", e)}] })),
                    }
                },
                "aws_cli" => {
                    let cmd_str = arguments["command"].as_str().unwrap_or("");
                    let full_cmd = format!("aws {}", cmd_str);
                    let output = std::process::Command::new("sh")
                        .arg("-c")
                        .arg(full_cmd)
                        .output();
                    
                    match output {
                        Ok(out) => {
                            let stdout = String::from_utf8_lossy(&out.stdout);
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            let combined = format!("STDOUT:\n{}\n\nSTDERR:\n{}", stdout, stderr);
                            Some(json!({ "content": [{"type": "text", "text": combined}] }))
                        },
                        Err(e) => Some(json!({ "content": [{"type": "text", "text": format!("Error al ejecutar aws: {}", e)}] })),
                    }
                },
                _ => Some(json!({ "content": [{"type": "text", "text": "Herramienta no encontrada"}] })),
            }
        },
        _ => None,
    };

    McpResponse {
        jsonrpc: "2.0".to_string(),
        error: if result.as_ref().is_none() { Some(json!({"code": -32601, "message": "Method not found"})) } else { None },
        result,
        id: req.id,
    }
}
