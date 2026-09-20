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
pub const STATUSES: [&str; 4] = ["proposed", "confirmed", "rejected", "archived"];
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
    // What would decide this prediction, as an expression. Only a prediction has
    // one, and a prediction is not valid without one -- see validate_object_input.
    #[serde(default)]
    pub criterion: Option<String>,
    // What the symbols stand for, and what has to hold alongside. Optional, and
    // it cannot stand without the expression it annotates.
    #[serde(default)]
    pub criterion_note: Option<String>,
    // The quantities the expression is written in terms of. Option rather than a
    // bare Vec because the response schema requires every key on every
    // operation, so this arrives as an explicit null on the ones that have no
    // symbols -- and serde will not read null into a Vec.
    #[serde(default)]
    pub symbols: Option<Vec<SymbolInput>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SymbolInput {
    pub name: String,
    #[serde(default)]
    pub meaning: Option<String>,
}

/// Names that can be read back out of an expression: letters, digits, `_`, and
/// the subscript dot in `p.A`. Not a grammar for the expression itself -- there
/// is no parser and the agent is the one that knows what it wrote -- just enough
/// that a name is a name and not a sentence that wandered into the wrong field.
pub fn validate_symbols(symbols: &[SymbolInput]) -> Result<()> {
    let mut seen: Vec<&str> = Vec::new();
    for symbol in symbols {
        let name = symbol.name.trim();
        if name.is_empty() {
            return err("記号に名前が要ります。");
        }
        if name.chars().any(char::is_whitespace) {
            return err(format!(
                "記号の名前に空白は使えません（受け取った値: {name}）。式の中でそのまま書ける形にしてください。"
            ));
        }
        // Two rows with one name would make the binding ambiguous the moment
        // there is one, and reading it ambiguous before that.
        if seen.contains(&name) {
            return err(format!("記号 {name} が二重に定義されています。"));
        }
        seen.push(name);
    }
    Ok(())
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
    // A prediction that cannot say what would decide it is not a prediction. It
    // is the hypothesis said again in the language of observation, and measuring
    // it settles nothing about the claim it hangs from -- which is exactly what
    // had happened: 「Xが生着率を左右している」 above 「Xで生着率が分かれる」, twice
    // over, with nothing in between them that could come out either way.
    //
    // So this is a rule about what a prediction is, and it lives here with the
    // other ones. Only the type that needs it is asked for it; the rest carry no
    // field that would be empty for a reason that has nothing to do with them.
    if input.type_ == "prediction" && criterion_of(input).is_empty() {
        return err(
            "予測には判定条件が要ります。何と比べて、どうなったら外れるのかを書いてください（向き・順序・比べる大きさのどれか）。",
        );
    }
    // And only a prediction has one. set_object_criterion already refuses the
    // other types; without this, creation would quietly accept what the setter
    // rejects, and the same field would mean two different things depending on
    // which way it got written.
    if input.type_ != "prediction" && !criterion_of(input).is_empty() {
        return err("判定条件を持てるのは予測だけです。");
    }
    // The annotation explains the expression, so there is nothing for it to be
    // about on its own. Refused rather than dropped: prose arriving here with no
    // expression beside it is a criterion that was written the old way, and
    // silently keeping half of it would look like it had been accepted.
    if !criterion_note_of(input).is_empty() && criterion_of(input).is_empty() {
        return err("判定条件の補足だけを書くことはできません。先に式を書いてください。");
    }
    // Symbols belong to the expression that uses them, so they go the same way
    // the note does: only on a prediction, and not without one.
    if !symbols_of(input).is_empty() && criterion_of(input).is_empty() {
        return err("記号だけを定義することはできません。先に判定条件の式を書いてください。");
    }
    validate_symbols(symbols_of(input))?;
    Ok(())
}

/// The symbols as they will be stored, and an empty slice when there are none.
pub fn symbols_of(input: &ObjectInput) -> &[SymbolInput] {
    match &input.symbols {
        Some(list) => list,
        None => &[],
    }
}

/// The criterion as it will be stored: trimmed, and empty when there is none.
pub fn criterion_of(input: &ObjectInput) -> &str {
    trimmed(&input.criterion)
}

/// The note on the criterion, trimmed, and empty when there is none.
pub fn criterion_note_of(input: &ObjectInput) -> &str {
    trimmed(&input.criterion_note)
}

fn trimmed(value: &Option<String>) -> &str {
    match value {
        Some(v) => v.trim(),
        None => "",
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    fn input(type_: &str, criterion: Option<&str>) -> ObjectInput {
        ObjectInput {
            type_: type_.into(),
            title: "t".into(),
            body: None,
            origin: "agent".into(),
            status: "proposed".into(),
            criterion: criterion.map(str::to_string),
            criterion_note: None,
            symbols: None,
        }
    }

    // The rule is the definition, not a form field: a prediction that cannot say
    // what would decide it is the hypothesis restated, and measuring it settles
    // nothing about the claim it hangs from.
    #[test]
    fn a_prediction_needs_a_criterion() {
        assert!(validate_object_input(&input("prediction", None)).is_err());
        assert!(validate_object_input(&input("prediction", Some("   "))).is_err());
        assert!(validate_object_input(&input("prediction", Some("p_a > p_b"))).is_ok());
    }

    // And nothing else may carry one. set_object_criterion refuses the other
    // types; creation has to refuse them too, or the field would mean one thing
    // when written at birth and another when written later.
    #[test]
    fn only_a_prediction_may_carry_one() {
        assert!(validate_object_input(&input("hypothesis", Some("p_a > p_b"))).is_err());
        assert!(validate_object_input(&input("hypothesis", None)).is_ok());
        assert!(validate_object_input(&input("question", Some(""))).is_ok());
    }

    // The note explains the expression, so it has nothing to be about on its own.
    #[test]
    fn the_note_cannot_stand_without_the_expression() {
        let mut orphan = input("prediction", None);
        orphan.criterion_note = Some("{88dc}{8db3}{3060}{3051}".into());
        assert!(validate_object_input(&orphan).is_err());

        let mut both = input("prediction", Some("p_a > p_b"));
        both.criterion_note = Some("p は生着率".into());
        assert!(validate_object_input(&both).is_ok());
    }
}
