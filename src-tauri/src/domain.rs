use crate::error::{err, Result};
use serde::Deserialize;

pub const OBJECT_TYPES: [&str; 5] = [
    "question",
    "hypothesis",
    "prediction",
    "measurement",
    "asset",
];
pub const ORIGINS: [&str; 5] = ["researcher", "agent", "system", "instrument", "imported"];
pub const STATUSES: [&str; 3] = ["proposed", "confirmed", "rejected"];
pub const PREDICATES: [&str; 6] = [
    "addresses",
    "predicts",
    "tested_by",
    "produces",
    "references",
    "related_to",
];

#[derive(Debug, Clone, Deserialize)]
pub struct ObjectInput {
    #[serde(rename = "type")]
    pub type_: String,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    pub origin: String,
    pub status: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelationInput {
    pub subject_id: String,
    pub predicate: String,
    pub object_id: String,
    pub origin: String,
    pub status: String,
}

fn assert_enum(name: &str, value: &str, allowed: &[&str]) -> Result<()> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        err(format!("Invalid {name}: {value}"))
    }
}

pub fn validate_object_input(input: &ObjectInput) -> Result<()> {
    assert_enum("object type", &input.type_, &OBJECT_TYPES)?;
    assert_enum("origin", &input.origin, &ORIGINS)?;
    assert_enum("status", &input.status, &STATUSES)?;
    if input.title.trim().is_empty() {
        return err("title is required");
    }
    Ok(())
}

pub fn validate_relation_input(input: &RelationInput) -> Result<()> {
    assert_enum("predicate", &input.predicate, &PREDICATES)?;
    assert_enum("origin", &input.origin, &ORIGINS)?;
    assert_enum("status", &input.status, &STATUSES)?;
    if input.subject_id.is_empty() || input.object_id.is_empty() {
        return err("relation subject/object are required");
    }
    if input.subject_id == input.object_id {
        return err("self-relations are not allowed in v0");
    }
    Ok(())
}

// The renderer draws one column per type, left to right, and does no layout search,
// so the chain below is the only shape it can lay out. Everything else has to come
// through the two loose predicates.
pub fn allowed_relation(subject_type: &str, predicate: &str, object_type: &str) -> bool {
    const EXACT: [&str; 4] = [
        "hypothesis|addresses|question",
        "hypothesis|predicts|prediction",
        "prediction|tested_by|measurement",
        "measurement|produces|asset",
    ];
    let key = format!("{subject_type}|{predicate}|{object_type}");
    EXACT.contains(&key.as_str()) || predicate == "references" || predicate == "related_to"
}
