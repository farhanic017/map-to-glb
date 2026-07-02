// Map to GLB - 3D Building Mapping Service
// Copyright (C) 2026 Farhan Dhrubo
// Licensed under GNU General Public License v3.0
// https://github.com/farhanic017/map-to-glb

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize)]
pub struct Bounds {
    pub south: f64,
    pub west: f64,
    pub north: f64,
    pub east: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Building {
    pub id: u64,
    pub tags: HashMap<String, String>,
    pub geometry: Option<Vec<GeometryPoint>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeometryPoint {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SceneStatus {
    pub building_count: usize,
    pub road_count: usize,
    pub material_preset: String,
    pub height_scale: f64,
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Map to GLB.", name)
}

#[tauri::command]
fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[tauri::command]
fn get_scene_status() -> SceneStatus {
    SceneStatus {
        building_count: 0,
        road_count: 0,
        material_preset: "realistic".to_string(),
        height_scale: 1.0,
    }
}

#[tauri::command]
fn set_material(preset: String) -> Result<String, String> {
    Ok(format!("Material set to: {}", preset))
}

#[tauri::command]
fn set_height_scale(scale: f64) -> Result<String, String> {
    Ok(format!("Height scale set to: {}", scale))
}

#[tauri::command]
fn export_glb(path: String) -> Result<String, String> {
    Ok(format!("GLB exported to: {}", path))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            greet,
            get_app_version,
            get_scene_status,
            set_material,
            set_height_scale,
            export_glb
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
