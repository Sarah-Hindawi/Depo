// Per-tactic instructions injected into every attorney question prompt.
// Tactic choice is made by the state machine; phrasing is left to the LLM.
export const TACTIC_INSTRUCTIONS = {
  open_ended:
    'Ask an open-ended question to gather information. Use "Tell me about…" or "Can you describe…"',
  leading_soft:
    'Ask a mildly leading question that gently steers the witness toward confirming a fact.',
  leading_lockin:
    "Lock the witness into a specific concession they've already implied. E.g., \"So you're saying…\" or \"Let me make sure I understand — you [fact]?\"",
  compound:
    'Embed two or more sub-questions in a single question so the witness must answer all parts.',
  false_premise:
    "Embed a false or unproven premise. E.g., \"After you did X…\" (where X may not have happened).",
  speculation_bait:
    'Invite the witness to speculate. E.g., "What do you think he was planning?" or "Why do you suppose…?"',
  emotional_prov:
    'Use emotionally challenging framing to test composure. Stay professional but pointed.',
  impeachment:
    'Point to a weakness or inconsistency in what the witness has said and press on it.',
  prior_quote:
    'Quote or paraphrase something the witness said earlier in this deposition and probe its consistency.',
}
