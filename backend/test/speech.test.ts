import { SpeechResponseSchema } from '@actionbridge/contracts';
import { describe, expect, it } from 'vitest';
import { PollySynthesizer, speechRoutes, type SpeechSynthesizer } from '../src/features/speech/speech.js';
import { MAYA } from './helpers.js';

const event = (body: unknown, user: string | null = MAYA) => ({
  version: '2.0',
  routeKey: 'POST /v1/speech',
  rawPath: '/v1/speech',
  headers: { 'content-type': 'application/json', ...(user ? { 'x-demo-user-id': user } : {}) },
  body: JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { requestId: 'req-1', http: { method: 'POST', path: '/v1/speech' } },
});

describe('read aloud (Amazon Polly)', () => {
  const fake: SpeechSynthesizer = { synthesize: async (text) => ({ audio: new TextEncoder().encode(`mp3:${text}`), voice: 'Joanna' }) };

  it('returns MP3 audio for short text, validated by the shared contract', async () => {
    const route = speechRoutes({ synthesizer: fake, authMode: 'demo' })['POST /v1/speech']!;
    const result = await route(event({ text: 'You pay about $1,200.' }) as never);
    expect(result.statusCode).toBe(200);
    const body = SpeechResponseSchema.parse(JSON.parse(result.body as string));
    expect(Buffer.from(body.audioBase64, 'base64').toString()).toBe('mp3:You pay about $1,200.');
  });

  it('refuses empty or very long text', async () => {
    const route = speechRoutes({ synthesizer: fake, authMode: 'demo' })['POST /v1/speech']!;
    await expect(route(event({ text: '' }) as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(route(event({ text: 'x'.repeat(1501) }) as never)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('asks Polly for a neural MP3 voice', async () => {
    const sent: { input: Record<string, unknown> }[] = [];
    const client = { send: async (command: { input: Record<string, unknown> }) => (sent.push(command), { AudioStream: { transformToByteArray: async () => new Uint8Array([1, 2]) } }) };
    const result = await new PollySynthesizer(client as never).synthesize('Hello');
    expect(result.audio).toEqual(new Uint8Array([1, 2]));
    expect(sent[0]?.input).toMatchObject({ Text: 'Hello', OutputFormat: 'mp3', Engine: 'neural', VoiceId: 'Joanna' });
  });
});
