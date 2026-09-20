// The agent answers with one JSON object, `{ "reply": ..., "operations": [...] }`,
// and that contract is left alone: it survives fences, chatter and retries, and
// changing it would move the risk into the model's behaviour. Streaming instead
// means reading the `reply` string out of a JSON document that is still being
// written, which is a job for code that can be tested.

/// The decoded `reply` seen so far in a partial JSON document, or None before the
/// string has opened. A trailing incomplete escape is held back rather than shown.
pub fn partial_reply(raw: &str) -> Option<String> {
    let start = value_start(raw, "reply")?;
    let mut out = String::new();
    let mut chars = raw[start..].chars();

    while let Some(ch) = chars.next() {
        match ch {
            // The string closed, so this is the whole reply.
            '"' => return Some(out),
            '\\' => match chars.next() {
                // The escape is still arriving; hold it back.
                None => break,
                Some('u') => {
                    let hex: String = chars.by_ref().take(4).collect();
                    if hex.len() < 4 {
                        return Some(out);
                    }
                    match u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32) {
                        Some(decoded) => out.push(decoded),
                        // A surrogate half on its own cannot be decoded until its
                        // pair arrives, so wait rather than emit a replacement.
                        None => return Some(out),
                    }
                }
                Some(escaped) => out.push(match escaped {
                    'n' => '\n',
                    't' => '\t',
                    'r' => '\r',
                    'b' => '\u{8}',
                    'f' => '\u{c}',
                    // Covers \" \\ and \/
                    other => other,
                }),
            },
            other => out.push(other),
        }
    }
    Some(out)
}

// Finds the byte index just past the opening quote of the given key's string
// value. The key is matched as a quoted token followed by a colon, so the same
// word appearing inside an earlier string value is not mistaken for it.
fn value_start(raw: &str, key: &str) -> Option<usize> {
    let needle = format!("\"{key}\"");
    let mut from = 0;
    while let Some(found) = raw[from..].find(&needle) {
        let after = from + found + needle.len();
        let rest = &raw[after..];
        let colon = rest.find(|c: char| !c.is_whitespace())?;
        if rest[colon..].starts_with(':') {
            let value = &rest[colon + 1..];
            let quote = value.find(|c: char| !c.is_whitespace())?;
            if value[quote..].starts_with('"') {
                return Some(after + colon + 1 + quote + 1);
            }
            // The value is there but is not a string, so there is nothing to show.
            return None;
        }
        from = after;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::partial_reply;

    #[test]
    fn nothing_until_the_string_opens() {
        assert_eq!(partial_reply(""), None);
        assert_eq!(partial_reply("{"), None);
        assert_eq!(partial_reply("{\"rep"), None);
        assert_eq!(partial_reply("{\"reply\""), None);
        assert_eq!(partial_reply("{\"reply\":"), None);
    }

    #[test]
    fn grows_as_the_document_arrives() {
        assert_eq!(partial_reply("{\"reply\":\"").unwrap(), "");
        assert_eq!(partial_reply("{\"reply\":\"20K").unwrap(), "20K");
        assert_eq!(
            partial_reply("{\"reply\":\"20Kで急に下がった").unwrap(),
            "20Kで急に下がった"
        );
    }

    #[test]
    fn stops_at_the_closing_quote() {
        let whole = r#"{"reply":"done","operations":[{"op":"create_object"}]}"#;
        assert_eq!(partial_reply(whole).unwrap(), "done");
    }

    #[test]
    fn decodes_escapes_and_holds_back_partial_ones() {
        assert_eq!(partial_reply(r#"{"reply":"a\nb"#).unwrap(), "a\nb");
        assert_eq!(partial_reply(r#"{"reply":"say \"hi\""#).unwrap(), "say \"hi\"");
        assert_eq!(partial_reply(r#"{"reply":"back\\slash"#).unwrap(), "back\\slash");
        // A lone trailing backslash is the front half of an escape still in flight.
        assert_eq!(partial_reply(r#"{"reply":"a\"#).unwrap(), "a");
        assert_eq!(partial_reply(r#"{"reply":"a\u30"#).unwrap(), "a");
        assert_eq!(partial_reply(r#"{"reply":"aあb"#).unwrap(), "aあb");
    }

    #[test]
    fn survives_a_leading_code_fence() {
        assert_eq!(partial_reply("```json\n{\"reply\":\"ok").unwrap(), "ok");
    }

    #[test]
    fn is_not_fooled_by_the_word_reply_inside_another_value() {
        // `operations` first, with the literal text reply inside a title.
        let raw = r#"{"operations":[{"title":"the \"reply\" field"}],"reply":"real"#;
        assert_eq!(partial_reply(raw).unwrap(), "real");
    }

    #[test]
    fn returns_none_when_reply_is_not_a_string() {
        assert_eq!(partial_reply(r#"{"reply":null,"#), None);
    }
}
