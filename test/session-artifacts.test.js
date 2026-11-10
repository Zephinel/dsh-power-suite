import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  artifactContentSecurityPolicy,
  artifactKind,
  contentDisposition,
  foldArtifacts,
  mutationPath,
  previewKindOf,
  resolveArtifactPath
} from '../src/features/session-artifacts/artifact-index.js'

/** Build one raw session event. */
function event(seq, type, data) {
  return { seq, type, data }
}

/** Parse a tool call's recorded arguments the way the log stores them. */
function args(value) {
  return JSON.stringify(value)
}

test('a successful write publishes one produced file', () => {
  const artifacts = foldArtifacts([
    event(1, 'tool/call', {
      turn: 1,
      step: 1,
      callId: 'call-1',
      name: 'write',
      arguments: args({ file_path: '/work/report.md', content: '# Report\n' })
    }),
    event(2, 'tool/result', {
      turn: 1,
      step: 1,
      message: { role: 'tool', source: { callId: 'call-1' }, isError: false },
      meta: { path: '/work/report.md' }
    })
  ], '/work')
  assert.deepEqual(artifacts, [{
    path: '/work/report.md',
    name: 'report.md',
    description: undefined,
    presented: false,
    generated: true,
    tool: 'write',
    turn: 1,
    seq: 2
  }])
})

test('a relative argument resolves against the session workspace', () => {
  const artifacts = foldArtifacts([
    event(3, 'tool/call', {
      turn: 2,
      callId: 'call-2',
      name: 'edit',
      arguments: args({
        file_path: 'src/app.ts',
        old_string: 'a',
        new_string: 'b'
      })
    }),
    event(4, 'tool/result', {
      turn: 2,
      message: { role: 'tool', source: { callId: 'call-2' }, isError: false }
    })
  ], '/work')
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].path, '/work/src/app.ts')
  assert.equal(artifacts[0].tool, 'edit')
})

test('failed calls and read-only calls contribute nothing', () => {
  const artifacts = foldArtifacts([
    event(1, 'tool/call', {
      turn: 1,
      callId: 'write-failed',
      name: 'write',
      arguments: args({ file_path: '/work/a.txt', content: 'x' })
    }),
    event(2, 'tool/result', {
      turn: 1,
      message: { role: 'tool', source: { callId: 'write-failed' }, isError: true }
    }),
    event(3, 'tool/call', {
      turn: 1,
      callId: 'read',
      name: 'read',
      arguments: args({ file_path: '/work/a.txt' })
    }),
    event(4, 'tool/result', {
      turn: 1,
      message: { role: 'tool', source: { callId: 'read' }, isError: false },
      meta: { path: '/work/a.txt' }
    })
  ], '/work')
  assert.deepEqual(artifacts, [])
})

test('str_replace_editor only counts mutating commands', () => {
  const events = [
    event(1, 'tool/call', {
      turn: 1,
      callId: 'view',
      name: 'str_replace_editor',
      arguments: args({ command: 'view', path: '/work/a.ts' })
    }),
    event(2, 'tool/result', {
      turn: 1,
      message: { role: 'tool', source: { callId: 'view' }, isError: false },
      meta: { path: '/work/a.ts' }
    }),
    event(3, 'tool/call', {
      turn: 1,
      callId: 'create',
      name: 'str_replace_editor',
      arguments: args({ command: 'create', path: '/work/b.ts', file_text: 'x' })
    }),
    event(4, 'tool/result', {
      turn: 1,
      message: { role: 'tool', source: { callId: 'create' }, isError: false },
      meta: { path: '/work/b.ts' }
    })
  ]
  const artifacts = foldArtifacts(events, '/work')
  assert.deepEqual(artifacts.map((artifact) => artifact.path), ['/work/b.ts'])
})

test('a delivered file lands once with its description', () => {
  const artifacts = foldArtifacts([
    event(5, 'tool/call', {
      turn: 1,
      callId: 'call-5',
      name: 'write',
      arguments: args({ file_path: '/work/deck.pptx', content: 'x' })
    }),
    event(6, 'tool/result', {
      turn: 1,
      message: { role: 'tool', source: { callId: 'call-5' }, isError: false },
      meta: { path: '/work/deck.pptx' }
    }),
    event(9, 'deliverables/presented', {
      turn: 1,
      callId: 'call-9',
      files: [{ path: '/work/deck.pptx', description: 'Launch deck' }]
    })
  ], '/work')
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].presented, true)
  assert.equal(artifacts[0].generated, true)
  assert.equal(artifacts[0].description, 'Launch deck')
  assert.equal(artifacts[0].seq, 9)
})

test('relative deliveries resolve against the workspace and malformed ones are ignored', () => {
  const artifacts = foldArtifacts([
    event(1, 'deliverables/presented', {
      turn: 2,
      callId: 'call-1',
      files: [
        { path: 'out/summary.pdf', description: 'Summary' },
        { path: '' },
        { nope: true }
      ]
    }),
    event(2, 'deliverables/presented', { turn: 'x', callId: 'call-2', files: [] })
  ], '/work')
  assert.equal(artifacts.length, 1)
  assert.equal(artifacts[0].path, '/work/out/summary.pdf')
  assert.equal(artifacts[0].name, 'summary.pdf')
})

test('unordered results keep paths unique and sort newest first', () => {
  const artifacts = foldArtifacts([
    event(1, 'deliverables/presented', { turn: 1, files: [{ path: '/work/old.pdf' }] }),
    event(2, 'deliverables/presented', { turn: 2, files: [{ path: '/work/new.pdf' }] }),
    event(3, 'deliverables/presented', { turn: 2, files: [{ path: '/work/new.pdf', description: 'again' }] })
  ], '/work')
  assert.deepEqual(artifacts.map((artifact) => artifact.path), ['/work/new.pdf', '/work/old.pdf'])
  assert.equal(artifacts[0].description, 'again')
})

test('absolute detection and mutation argument extraction', () => {
  assert.equal(resolveArtifactPath('/a/b', undefined), '/a/b')
  assert.equal(resolveArtifactPath('c/d', undefined), null)
  assert.equal(resolveArtifactPath('c/d', '/root'), '/root/c/d')
  assert.equal(mutationPath('write', args({ file_path: '/x', content: '' })), '/x')
  assert.equal(mutationPath('write', args({ file_path: '/x' })), null)
  assert.equal(mutationPath('edit', args({ file_path: '/x', old_string: 'a', new_string: 'a' })), null)
  assert.equal(mutationPath('bash', args({ command: 'touch /x' })), null)
})

test('MIME kinds and download headers are browser-safe', () => {
  assert.deepEqual(artifactKind('index.html'), { mime: 'text/html; charset=utf-8', previewable: true })
  assert.equal(artifactKind('deck.pptx').previewable, false)
  assert.equal(artifactKind('photo.unknown').mime, 'application/octet-stream')
})

test('hover previews pick a surface per artifact type', () => {
  assert.equal(previewKindOf('readme.md'), 'text')
  assert.equal(previewKindOf('script.js'), 'text')
  assert.equal(previewKindOf('photo.png'), 'image')
  assert.equal(previewKindOf('icon.svg'), 'image')
  assert.equal(previewKindOf('clip.mp4'), 'media')
  assert.equal(previewKindOf('voice.mp3'), 'media')
  assert.equal(previewKindOf('paper.pdf'), 'pdf')
  assert.equal(previewKindOf('page.html'), 'html')
  assert.equal(previewKindOf('deck.pptx'), 'binary')
  assert.equal(
    contentDisposition('attachment', '报告 "Q3".pdf'),
    'attachment; filename="__ _Q3_.pdf"; filename*=UTF-8\'\'%E6%8A%A5%E5%91%8A%20%22Q3%22.pdf'
  )
  assert.match(artifactContentSecurityPolicy('text/html; charset=utf-8'), /sandbox/)
  assert.equal(artifactContentSecurityPolicy('application/pdf'), undefined)
})
