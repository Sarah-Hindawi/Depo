// Per-tactic instructions injected into every attorney question prompt.
// Tactic CHOICE is made by the state machine (selectTactic); PHRASING is left
// to the LLM. Each entry gives a sharp tactical pattern + a concrete sentence
// template so the model produces real-deposition-quality questions.

export const TACTIC_INSTRUCTIONS = {
  open_ended:
    'Ask an open-ended invitation that lets the witness volunteer information. ' +
    'Templates: "Tell me about your [background topic]." / "Can you walk me through [event] in your own words." ' +
    'The deliberate goal is to give the witness room to over-share — long answers expose unproduced facts and lapsed certifications.',

  leading_soft:
    'Ask a mildly leading question that gently steers the witness toward confirming a fact. ' +
    'Templates: "You\'d agree that [fact], wouldn\'t you?" / "It\'s fair to say [fact] — yes?" ' +
    'Tone should sound conversational, not adversarial.',

  leading_lockin:
    'Lock in a SPECIFIC fact as record evidence. Use absolutes and authoritative-recital framing. ' +
    'Templates: "And [exact fact from documents] — correct?" / "You have never [done X] — correct?" / ' +
    '"On [date from documents], you were [role] at [place] — yes?" ' +
    'Trap words to deploy: "never", "any", "always", "exactly". A "yes" here becomes record evidence.',

  compound:
    'Embed two or more sub-questions in a single question so the witness must answer all parts at once. ' +
    'Templates: "You were the sole director, sole officer, and sole shareholder — yes?" / ' +
    '"And you were not on your phone, not listening to music, and not in conversation with anyone — correct?" ' +
    'If the witness says "yes" without parsing, they have confirmed every clause.',

  false_premise:
    'Embed a premise that has NOT been established and treat it as accepted fact. ' +
    'Templates: "After you [unproven action], what happened next?" / "When you [unproven detail] that morning, did you [follow-up]?" ' +
    'If the witness answers without flagging the premise, the premise is now on the record.',

  speculation_bait:
    'Invite the witness to guess or speculate about something they cannot know. ' +
    'Templates: "What do you think [other person] was doing at that moment?" / "Why do you suppose [event]?" / ' +
    '"If you had known [hypothetical], would you have [counterfactual action]?" ' +
    'Any guess becomes impeachable testimony.',

  emotional_prov:
    'Frame the question in a way that tests composure without crossing into abuse. ' +
    'Templates: "You don\'t actually remember [event], do you?" (skeptical) / ' +
    '"Isn\'t it convenient that [coincidence]?" (insinuation) ' +
    'A defensive or emotional reply weakens the witness\'s credibility on the record.',

  impeachment:
    'Point to a contradiction between what the witness just said and either prior testimony or the case documents. ' +
    'Templates: "But the [document/report] shows [fact A] — how do you reconcile that with what you just told me?" / ' +
    '"That can\'t both be true — which is correct?" ' +
    'Force the witness to choose: contradict themselves or contradict the record.',

  prior_quote:
    'Quote or closely paraphrase something the witness ALREADY said earlier in this deposition, then probe its consistency. ' +
    'Templates: "Earlier you told me \\"[exact prior answer]\\". Is that still your testimony?" / ' +
    '"A moment ago you said [X]. Now you\'re saying [Y]. Which version is true?" ' +
    'Always weave the actual prior text into the question — never paraphrase loosely.',
}
