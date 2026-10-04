/**
 * Input methods that depend on backend features (doc 05 U-06, U-07). Turn one on only when its
 * API is deployed and verified; until then Home shows it as "Coming soon" instead of simulating it.
 */
export const capabilities = {
  /** Press-to-record → private upload → Amazon Transcribe job (`transcribe_audio`). */
  voice: true,
  /** Document picker → private upload → `analyze_document` job. */
  upload: true,
  /** Camera photo of a document → same pipeline as upload. */
  photo: true,
  /** Describe in your own words → agent job (`interpret`) → confirm → adaptive questions. Live since Phase 5. */
  assistant: true,
  /** Manual entry; works with today's API. */
  typing: true,
} as const;
