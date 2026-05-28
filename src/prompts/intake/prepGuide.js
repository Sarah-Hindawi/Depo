// Intake — prep guide generation
// Produces case-specific DOs, DON'Ts, and reminders shown before the simulation.

export function prepGuidePrompt(combinedDocText, summary) {
  return `Based on these case documents, generate a deposition prep guide for this specific client.

Case summary: ${summary}
Documents:
${combinedDocText}

Return ONLY valid JSON, no markdown:
{
  "dos": ["5-6 specific DOs based on this case, plain language, start with a verb like 'Answer', 'Stay', 'Keep'"],
  "donts": ["5-6 specific DON'Ts based on this case, plain language, start with 'Don't' or 'Never'"],
  "reminders": ["3-4 key things specific to this case the client must remember going in"]
}

Base everything on the actual documents. Be specific — not generic advice.`
}
