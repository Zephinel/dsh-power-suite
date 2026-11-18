/**
 * Pure syntax highlighting for the hover quick-look preview.
 *
 * The card renders a small, dependency-free tokenizer over a per-language
 * keyword/builtin table. This module owns the table, the regex assembly and the
 * token walk; `markdown.ts` turns the tokens into DOM spans, so no DOM or timer
 * is touched here.
 *
 * @module
 */

/** One language's keyword and builtin sets. */
interface LanguageKeywords {
  keywords: string[]
  builtins: string[]
}

/** One assembled tokenizer: the combined regex plus group-class order. */
export interface CodeTokenizer {
  regex: RegExp
  classes: string[]
}

/** One highlighted token; an empty `kind` means plain text. */
export interface HighlightToken {
  text: string
  kind: string
}

const QUICKLOOK_LANGUAGES: Record<string, string> = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
  ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts',
  json: 'json', jsonc: 'json', json5: 'json',
  css: 'css', scss: 'css', less: 'css',
  html: 'html', htm: 'html', vue: 'html', svelte: 'html', astro: 'html',
  xml: 'xml', svg: 'xml',
  sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', shell: 'shell',
  py: 'python', python: 'python',
  yaml: 'yaml', yml: 'yaml',
  go: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  rb: 'ruby', ruby: 'ruby',
  php: 'php',
  sql: 'sql',
  toml: 'toml',
  ini: 'ini',
  md: 'markdown', markdown: 'markdown',
  csv: '', tsv: '', txt: '', log: '', text: ''
}

/** Common fence aliases → canonical language ids. */
const QUICKLOOK_LANGUAGE_ALIASES: Record<string, string> = {
  javascript: 'js', js: 'js', node: 'js',
  typescript: 'ts', ts: 'ts',
  shell: 'shell', sh: 'shell', bash: 'shell', zsh: 'shell', console: 'shell',
  python: 'python', py: 'python',
  yaml: 'yaml', yml: 'yaml',
  markdown: 'markdown', md: 'markdown',
  'c++': 'cpp', cpp: 'cpp', cxx: 'cpp',
  golang: 'go', go: 'go',
  rs: 'rust', rust: 'rust',
  rb: 'ruby', ruby: 'ruby',
  kt: 'kotlin', kotlin: 'kotlin',
  html5: 'html', xml: 'xml', svg: 'xml',
  sql: 'sql', php: 'php', java: 'java', swift: 'swift',
  toml: 'toml', ini: 'ini', c: 'c', h: 'c'
}

/** Per-language keyword and builtin sets. Booleans are handled separately. */
const QUICKLOOK_KEYWORDS: Record<string, LanguageKeywords> = {
  js: {
    keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'delete', 'void', 'yield', 'static', 'get', 'set', 'super'],
    builtins: ['console', 'document', 'window', 'globalThis', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error', 'Symbol', 'BigInt', 'Intl', 'Reflect', 'Proxy']
  },
  ts: {
    keywords: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'try', 'catch', 'finally', 'throw', 'switch', 'case', 'break', 'continue', 'delete', 'void', 'yield', 'static', 'get', 'set', 'super', 'interface', 'type', 'enum', 'implements', 'public', 'private', 'protected', 'readonly', 'declare', 'namespace', 'as', 'satisfies', 'keyof', 'infer', 'any', 'string', 'number', 'boolean', 'unknown', 'never', 'abstract', 'override', 'module'],
    builtins: ['console', 'document', 'window', 'globalThis', 'Math', 'JSON', 'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error', 'Symbol', 'Partial', 'Record', 'Readonly', 'Pick', 'Omit', 'Required', 'ReturnType', 'Parameters', 'Awaited']
  },
  python: {
    keywords: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'finally', 'with', 'lambda', 'yield', 'async', 'await', 'pass', 'break', 'continue', 'raise', 'and', 'or', 'not', 'in', 'is', 'global', 'nonlocal', 'assert', 'del', 'match', 'case'],
    builtins: ['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'open', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'sum', 'min', 'max', 'abs', 'isinstance', 'super', 'self', 'cls', 'Exception', 'ValueError', 'TypeError', 'KeyError']
  },
  shell: {
    keywords: ['if', 'then', 'else', 'elif', 'fi', 'for', 'in', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'local', 'export', 'source', 'set', 'unset', 'readonly', 'shift', 'trap'],
    builtins: ['echo', 'cd', 'pwd', 'ls', 'cat', 'grep', 'sed', 'awk', 'curl', 'wget', 'git', 'npm', 'pnpm', 'node', 'python3', 'pip', 'mkdir', 'rm', 'cp', 'mv', 'chmod', 'chown', 'sudo', 'printf', 'read', 'test', 'exit', 'eval', 'exec']
  },
  json: { keywords: [], builtins: [] },
  yaml: { keywords: [], builtins: [] },
  css: { keywords: [], builtins: [] },
  html: { keywords: [], builtins: [] },
  xml: { keywords: [], builtins: [] },
  go: {
    keywords: ['package', 'import', 'func', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'default', 'break', 'continue', 'defer', 'go', 'select', 'map', 'struct', 'interface', 'type', 'var', 'const', 'chan', 'fallthrough'],
    builtins: ['fmt', 'strings', 'strconv', 'errors', 'os', 'time', 'sync', 'context', 'bytes', 'bufio', 'io', 'log', 'math', 'rand', 'sort', 'make', 'len', 'cap', 'new', 'append', 'copy', 'delete', 'close', 'panic', 'recover', 'print', 'println']
  },
  rust: {
    keywords: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'impl', 'trait', 'for', 'while', 'loop', 'if', 'else', 'match', 'return', 'use', 'mod', 'pub', 'crate', 'self', 'super', 'where', 'async', 'await', 'move', 'ref', 'in', 'as', 'break', 'continue', 'dyn', 'box', 'unsafe', 'extern'],
    builtins: ['String', 'Vec', 'Option', 'Result', 'Some', 'None', 'Ok', 'Err', 'Box', 'Rc', 'Arc', 'RefCell', 'Mutex', 'HashMap', 'HashSet', 'BTreeMap', 'println', 'vec', 'format']
  },
  java: {
    keywords: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'abstract', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'this', 'super', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'void', 'int', 'long', 'double', 'float', 'boolean', 'char', 'byte', 'short'],
    builtins: ['System', 'String', 'Integer', 'Long', 'Double', 'Boolean', 'Object', 'List', 'Map', 'Set', 'ArrayList', 'HashMap', 'HashSet', 'StringBuilder', 'Math']
  },
  c: {
    keywords: ['int', 'char', 'float', 'double', 'void', 'long', 'short', 'unsigned', 'signed', 'struct', 'union', 'enum', 'typedef', 'static', 'extern', 'const', 'volatile', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'goto', 'sizeof'],
    builtins: ['printf', 'fprintf', 'sprintf', 'malloc', 'calloc', 'realloc', 'free', 'NULL', 'stdin', 'stdout', 'stderr', 'FILE']
  },
  cpp: {
    keywords: ['class', 'namespace', 'template', 'typename', 'public', 'private', 'protected', 'virtual', 'override', 'final', 'new', 'delete', 'this', 'using', 'auto', 'constexpr', 'nullptr', 'const', 'static', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'struct', 'enum'],
    builtins: ['std', 'cout', 'cin', 'cerr', 'endl', 'vector', 'string', 'map', 'set', 'unique_ptr', 'shared_ptr', 'optional', 'size_t']
  },
  ruby: {
    keywords: ['def', 'class', 'module', 'end', 'if', 'elsif', 'else', 'unless', 'while', 'until', 'for', 'in', 'do', 'return', 'yield', 'begin', 'rescue', 'ensure', 'raise', 'require', 'require_relative', 'attr_accessor', 'attr_reader', 'attr_writer', 'self', 'super'],
    builtins: ['puts', 'print', 'p', 'gets', 'loop', 'each', 'map', 'select', 'reject', 'reduce']
  },
  php: {
    keywords: ['function', 'class', 'interface', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'return', 'if', 'else', 'elseif', 'for', 'foreach', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue', 'new', 'echo', 'print', 'require', 'include', 'namespace', 'use', 'try', 'catch', 'finally', 'throw'],
    builtins: ['isset', 'empty', 'array', 'count', 'strlen', 'json_encode', 'json_decode', 'str_replace', 'explode', 'implode']
  },
  sql: {
    keywords: ['select', 'from', 'where', 'insert', 'update', 'delete', 'create', 'table', 'join', 'left', 'right', 'inner', 'outer', 'on', 'group', 'by', 'order', 'limit', 'offset', 'values', 'into', 'set', 'as', 'and', 'or', 'not', 'is', 'like', 'in', 'between', 'union', 'all', 'distinct'],
    builtins: ['count', 'sum', 'avg', 'min', 'max']
  },
  kotlin: {
    keywords: ['fun', 'val', 'var', 'class', 'object', 'interface', 'data', 'enum', 'sealed', 'when', 'if', 'else', 'for', 'while', 'do', 'return', 'break', 'continue', 'package', 'import', 'as', 'is', 'in', 'throw', 'try', 'catch', 'finally', 'this', 'super'],
    builtins: ['println', 'print', 'listOf', 'mapOf', 'setOf', 'mutableListOf', 'Array', 'String', 'Int', 'Long', 'Double', 'Boolean']
  },
  swift: {
    keywords: ['func', 'let', 'var', 'class', 'struct', 'enum', 'protocol', 'extension', 'import', 'if', 'else', 'for', 'while', 'repeat', 'switch', 'case', 'default', 'return', 'break', 'continue', 'guard', 'defer', 'throw', 'throws', 'try', 'catch', 'as', 'is', 'in', 'self', 'super'],
    builtins: ['print', 'String', 'Int', 'Double', 'Bool', 'Array', 'Dictionary', 'Set', 'Optional']
  },
  toml: { keywords: [], builtins: [] },
  ini: { keywords: [], builtins: [] },
  markdown: { keywords: [], builtins: [] }
}

/**
 * Escape one literal for a regular expression.
 * @param text - source text.
 * @returns escaped text.
 */
function escapeRegExp(text: string): string {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build the tokenizer for one language. Groups run in precedence order:
 * comments, strings, language-specific literals, keywords, builtins,
 * functions, types, numbers, operators, punctuation.
 * @param language - highlighter language id.
 * @returns tokenizer or null when the language is unknown.
 */
export function codeTokenizer(language: string): CodeTokenizer | null {
  const spec = QUICKLOOK_KEYWORDS[language]
  if (spec === undefined) return null
  const parts: string[] = []
  const classes: string[] = []
  const add = function (source: string, className: string): void {
    parts.push(source)
    classes.push(className)
  }
  const slashComments = ['js', 'ts', 'go', 'rust', 'java', 'c', 'cpp', 'kotlin', 'swift', 'php', 'sql']
  const hashComments = ['python', 'shell', 'yaml', 'toml', 'ini', 'ruby']
  const markup = language === 'html' || language === 'xml'
  if (slashComments.indexOf(language) !== -1) add('//[^\\n]*|/\\*[\\s\\S]*?\\*/', 'comment')
  if (hashComments.indexOf(language) !== -1) add('#[^\\n]*', 'comment')
  if (markup) add('<!--[\\s\\S]*?-->', 'comment')
  if (language === 'python') add("'''[\\s\\S]*?'''|\"\"\"[\\s\\S]*?\"\"\"", 'string')
  if (language === 'json') {
    add('"(?:\\\\.|[^"\\\\\\n])*"(?=\\s*:)', 'property')
    add('"(?:\\\\.|[^"\\\\\\n])*"', 'string')
  } else {
    const template = language === 'js' || language === 'ts' ? '|`(?:\\\\.|[^`\\\\])*`' : ''
    add('"(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'' + template, 'string')
  }
  if (language === 'python') add('@[A-Za-z_][\\w.]*', 'decorator')
  if (language === 'shell') add('\\$\\{[^}]*\\}|\\$[A-Za-z_][\\w]*|\\$[0-9@#?$!*-]', 'variable')
  if (language === 'ruby') add(':[A-Za-z_][\\w!?]*', 'symbol')
  if (markup) {
    add('<!DOCTYPE[^>]*>', 'comment')
    add('</?[A-Za-z][\\w:-]*', 'tag')
    add('[A-Za-z_:][-\\w:.]*(?==)', 'attr')
  }
  if (language === 'css' || language === 'scss' || language === 'less') {
    add('@[A-Za-z-]+', 'keyword')
    add('#[0-9a-fA-F]{3,8}', 'number')
    add('[A-Za-z-]+(?=\\s*:)', 'property')
  }
  if (language === 'yaml' || language === 'toml' || language === 'ini') {
    add('^[ \\t-]*[A-Za-z0-9_.-]+(?=\\s*[:=])', 'property')
  }
  add('\\b(?:true|false|null|undefined|None|True|False|nil|NULL)\\b', 'boolean')
  if (spec.keywords.length > 0) add('\\b(?:' + spec.keywords.map(escapeRegExp).join('|') + ')\\b', 'keyword')
  if (spec.builtins.length > 0) add('\\b(?:' + spec.builtins.map(escapeRegExp).join('|') + ')\\b', 'builtin')
  add('\\b[A-Za-z_$][\\w$]*(?=\\s*\\()', 'function')
  add('\\b[A-Z][A-Za-z0-9_$]*\\b', 'type')
  add('\\b(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\\d[\\d_]*(?:\\.\\d[\\d_]*)?(?:[eE][+-]?\\d+)?)\\b', 'number')
  add('[-+*/%=<>!&|^~?:]+', 'operator')
  add('[{}()\\[\\];,.]', 'punct')
  try {
    const regex = new RegExp(parts.map(function (part: string): string { return '(' + part + ')' }).join('|'), 'gm')
    return { regex, classes }
  } catch {
    return null
  }
}

/**
 * Parse the leading language of a Markdown fence and map it.
 * @param fence - text after the opening backticks.
 * @param fileName - enclosing file name for a fallback.
 * @returns highlighter language id.
 */
export function fenceLanguage(fence: string, fileName: string): string {
  const language = String(fence ?? '').trim().toLowerCase()
  if (language === '') return languageForFile(fileName)
  const normalized = QUICKLOOK_LANGUAGE_ALIASES[language] ?? language
  return QUICKLOOK_KEYWORDS[normalized] === undefined ? '' : normalized
}

/**
 * Pick a highlighter language from a file name.
 * @param name - file name.
 * @returns language id, empty when unknown.
 */
export function languageForFile(name: string): string {
  const extension = (String(name ?? '').split('.').pop() ?? '').toLowerCase()
  return QUICKLOOK_LANGUAGES[extension] ?? ''
}

/**
 * Walk one code block through the language tokenizer.
 * @param code - source text.
 * @param language - highlighter language id.
 * @returns tokens, or null when the language has no tokenizer (plain text).
 */
export function highlightTokens(code: string, language: string): HighlightToken[] | null {
  const tokenizer = language.length > 0 ? codeTokenizer(language) : null
  if (tokenizer === null) return null
  const tokens: HighlightToken[] = []
  let last = 0
  for (const match of code.matchAll(tokenizer.regex)) {
    if (match[0].length === 0) continue
    const index = match.index ?? 0
    if (index > last) tokens.push({ text: code.slice(last, index), kind: '' })
    let kind = ''
    for (let group = 0; group < tokenizer.classes.length; group += 1) {
      if (match[group + 1] !== undefined) {
        kind = tokenizer.classes[group]
        break
      }
    }
    tokens.push({ text: match[0], kind })
    last = index + match[0].length
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: '' })
  return tokens
}
