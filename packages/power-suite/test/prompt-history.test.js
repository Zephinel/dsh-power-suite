import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_PROMPTS,
  collectPromptHistory,
  promptTextOfEvent
} from '../lib/features/prompt-history/history.js'

/** One recorded user message event. */
function userEvent(seq, text, source = { kind: 'user' }) {
  return {
    seq,
    type: 'user/message',
    data: {
      source,
      content: [{ type: 'text', text }]
    }
  }
}

test('only human-authorized user messages count', () => {
  assert.equal(promptTextOfEvent(userEvent(1, 'hello')), 'hello')
  assert.equal(promptTextOfEvent(userEvent(2, 'injected', { kind: 'runtime-context' })), null)
  assert.equal(promptTextOfEvent(userEvent(3, 'instructions', { kind: 'agent-instructions' })), null)
  assert.equal(promptTextOfEvent({ seq: 4, type: 'assistant/message', data: {} }), null)
  assert.equal(promptTextOfEvent(null), null)
})

test('text blocks are joined and trimmed; other blocks do not count', () => {
  const event = {
    seq: 1,
    type: 'user/message',
    data: {
      source: { kind: 'user' },
      content: [
        { type: 'image', attachment: { attachmentId: 'x' } },
        { type: 'text', text: '  first line\nsecond line  ' }
      ]
    }
  }
  assert.equal(promptTextOfEvent(event), 'first line\nsecond line')
  const imageOnly = {
    seq: 2,
    type: 'user/message',
    data: { source: { kind: 'user' }, content: [{ type: 'image', attachment: {} }] }
  }
  assert.equal(promptTextOfEvent(imageOnly), null)
})

test('history keeps log order and records the event seq', () => {
  const prompts = collectPromptHistory([
    userEvent(3, 'first'),
    { seq: 4, type: 'session/end-seed', data: {} },
    userEvent(7, 'second'),
    userEvent(9, 'third')
  ])
  assert.deepEqual(prompts, [
    { seq: 3, text: 'first' },
    { seq: 7, text: 'second' },
    { seq: 9, text: 'third' }
  ])
})

test('history is capped to the most recent prompts', () => {
  const events = []
  for (let index = 0; index < 5; index += 1) events.push(userEvent(index + 1, `prompt ${index}`))
  const prompts = collectPromptHistory(events, 2)
  assert.deepEqual(prompts.map((prompt) => prompt.text), ['prompt 3', 'prompt 4'])
  assert.equal(MAX_PROMPTS, 500)
})

test('malformed event lists read as empty history', () => {
  assert.deepEqual(collectPromptHistory(undefined), [])
  assert.deepEqual(collectPromptHistory([null, 3, 'x']), [])
})
