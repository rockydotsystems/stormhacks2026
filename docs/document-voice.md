# Document voice conversations

On `/documents/:id`, select the mic + sparkle button beside Send, then **Start
conversation**. Voice mode replaces the chat pane rather than opening a dialog.
Speak normally; after about 1.3 seconds of silence, the utterance
is sent. The planning agent replies aloud and the microphone starts listening
again. Voice turns use the same persisted conversation and document-edit flow as
typed messages.

The teal blob responds to microphone and reply audio volume. Listening has an
expanding ring; thinking has a rotating ring. Reduced-motion preferences disable
the motion while retaining visible status labels.

Only one compact thought bubble appears at a time: the latest thinking segment
while the agent reasons, then its final response. **Read more** stops voice mode
and returns to the full transcript, including the complete response and available
thought process. Typed drafts and conversation state are preserved.

**Pause mic** discards an unfinished recording. **Interrupt and speak** stops the
spoken reply and starts the next turn. Selecting **Read more**, pressing Escape, or
ending the conversation releases microphone tracks and stops audio. A document
change already sent to the planning agent can still finish after voice mode ends.

## Configuration

Set `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` as Worker secrets, or in
`.dev.vars` locally. Keys remain on the server. The existing ElevenLabs speech
adapter provides transcription and synthesis; this mode does not require or
create an ElevenLabs hosted agent. The planning model still owns reasoning and
document changes.

The browser must support microphone capture, MediaRecorder, and Web Audio.
Microphone access requires HTTPS (or localhost). Permission, provider, and audio
playback errors pause the loop; recover with **Try voice again**, **Play reply**,
or return to typing. The microphone is released while a reply is being prepared
or played to avoid recording speaker audio. Interruption is button-driven, not
automatic voice barge-in.

## Verification

- `pnpm check` covers types, lint, formatting, speech adapter tests, and voice
  activity tests (silence, short clicks, pauses, and the recording limit).
- `pnpm deploy:check` builds and dry-runs the Worker without publishing.
- In a browser with configured speech credentials, verify a document edit by
  voice, then reload to confirm the transcript and document change persist.
- Verify the chat transforms in place with no dialog; one thinking bubble is
  replaced by one final-response bubble. Read more restores the full transcript.
- Verify listening → thinking → speaking → listening, audio-reactive size,
  interruption, mic pause/resume, Escape/end cleanup, denied permission,
  and a browser-blocked reply. Test a narrow viewport and reduced motion.
- Provider-mocked browser checks establish UI and browser audio behavior, not
  live ElevenLabs integration or authenticated document persistence.
