import { SpeechRequestSchema, type SpeechResponse } from '@actionbridge/contracts';
import { SynthesizeSpeechCommand, type PollyClient, type VoiceId } from '@aws-sdk/client-polly';
import { resolveOwnerId, type AuthMode } from '../../shared/auth.js';
import { HttpError, jsonResult, parseBody, type RouteHandler } from '../../shared/http.js';
import { logEvent } from '../../shared/logger.js';

/** Port: turns short text into speech audio. */
export interface SpeechSynthesizer {
  synthesize(text: string): Promise<{ audio: Uint8Array; voice: string }>;
}

/**
 * `POST /v1/speech` (accessibility): reads short app text aloud for people who prefer listening.
 * Signed-in users only; text is capped by the contract (1,500 characters) and never stored.
 */
export function speechRoutes({ synthesizer, authMode }: { synthesizer: SpeechSynthesizer; authMode: AuthMode }): Record<string, RouteHandler> {
  return {
    'POST /v1/speech': async (event) => {
      resolveOwnerId(event, authMode);
      const { text } = parseBody(event, SpeechRequestSchema);
      let result: { audio: Uint8Array; voice: string };
      try {
        result = await synthesizer.synthesize(text);
      } catch (error) {
        logEvent('error', 'speech_failed', { errorName: error instanceof Error ? error.name : 'UnknownError' });
        throw new HttpError('UPSTREAM_UNAVAILABLE', 'Reading aloud isn’t available right now.');
      }
      const body: SpeechResponse = { audioBase64: Buffer.from(result.audio).toString('base64'), contentType: 'audio/mpeg', voice: result.voice };
      return jsonResult(200, body, event.requestContext.requestId);
    },
  };
}

/** Amazon Polly neural voice, MP3. */
export class PollySynthesizer implements SpeechSynthesizer {
  constructor(
    private readonly client: Pick<PollyClient, 'send'>,
    private readonly voice: VoiceId = 'Joanna',
  ) {}

  async synthesize(text: string) {
    const output = await this.client.send(new SynthesizeSpeechCommand({ Text: text, TextType: 'text', OutputFormat: 'mp3', VoiceId: this.voice, Engine: 'neural' }));
    if (!output.AudioStream) throw new Error('Polly returned no audio');
    return { audio: await output.AudioStream.transformToByteArray(), voice: this.voice };
  }
}
