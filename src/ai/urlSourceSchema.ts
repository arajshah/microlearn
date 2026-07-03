/** JSON schema sent to Gemini Interactions API for URL extraction. */
export const URL_EXTRACTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    contentType: { type: 'string' },
    summary: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          summary: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
        },
        required: ['heading', 'summary', 'keyPoints'],
      },
    },
    keyConcepts: { type: 'array', items: { type: 'string' } },
    importantTerms: { type: 'array', items: { type: 'string' } },
    suggestedTopic: { type: 'string' },
    suggestedLearningGoal: { type: 'string' },
    sourceWarnings: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'title',
    'summary',
    'sections',
    'keyConcepts',
    'importantTerms',
    'suggestedTopic',
    'suggestedLearningGoal',
    'sourceWarnings',
  ],
} as const;

export function buildExtractionPrompt(normalizedUrl: string): string {
  return `Read ONLY this public URL using the URL Context tool and extract educational content from it:

${normalizedUrl}

Instructions:
- Extract the primary educational content only.
- Ignore navigation, ads, cookie banners, unrelated recommendations, footers, and boilerplate.
- Preserve the source's actual meaning — do not add facts not present in the source.
- Identify whether the source is an article, documentation, paper, PDF, reference page, course material, or other.
- Produce a concise overall summary (about 100–400 words).
- Divide content into meaningful sections with headings, summaries, and key points.
- Extract key concepts and important terminology from the source.
- Suggest a suitable learning topic and learning goal grounded in the source.
- Note limitations, missing context, paywalls, login requirements, or quality concerns in sourceWarnings.
- Do NOT generate a lesson or roadmap — structured extraction only.
- Return JSON matching the provided schema exactly.`;
}
