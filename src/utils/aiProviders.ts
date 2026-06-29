export type AIProvider = 'anthropic' | 'groq' | 'gemini'

export interface ProviderInfo {
  label: string
  defaultModel: string
  keyPlaceholder: string
  keyLink: string
}

export const PROVIDER_INFO: Record<AIProvider, ProviderInfo> = {
  anthropic: {
    label: 'Anthropic',
    defaultModel: 'claude-haiku-4-5-20251001',
    keyPlaceholder: 'sk-ant-...',
    keyLink: 'https://console.anthropic.com/settings/keys',
  },
  groq: {
    label: 'Groq (бесплатно)',
    defaultModel: 'llama-3.3-70b-versatile',
    keyPlaceholder: 'gsk_...',
    keyLink: 'https://console.groq.com/keys',
  },
  gemini: {
    label: 'Gemini (бесплатно)',
    defaultModel: 'gemini-2.0-flash',
    keyPlaceholder: 'AIza...',
    keyLink: 'https://aistudio.google.com/apikey',
  },
}

export interface AITool {
  name: string
  description: string
  input_schema: {
    type: 'object'
    properties: Record<string, object>
    required?: string[]
  }
}

export async function callAI(
  provider: AIProvider,
  apiKey: string,
  system: string,
  userMessage: string,
  tool: AITool,
): Promise<Record<string, unknown>> {
  switch (provider) {
    case 'anthropic': return _callAnthropic(apiKey, system, userMessage, tool)
    case 'groq':      return _callGroq(apiKey, system, userMessage, tool)
    case 'gemini':    return _callGemini(apiKey, system, userMessage, tool)
  }
}

async function _assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j.error?.message ?? JSON.stringify(j) }
    catch { detail = await res.text() }
    throw new Error(`Ошибка API ${res.status}: ${detail}`)
  }
}

async function _callAnthropic(
  apiKey: string, system: string, userMessage: string, tool: AITool,
): Promise<Record<string, unknown>> {
  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PROVIDER_INFO.anthropic.defaultModel,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools: [{ name: tool.name, description: tool.description, input_schema: tool.input_schema }],
      tool_choice: { type: 'any' },
    }),
  })
  await _assertOk(res)
  const data = await res.json() as { content: Array<{ type: string; input?: unknown }> }
  const block = data.content?.find((b) => b.type === 'tool_use')
  if (!block) throw new Error('AI не вернул конфигурацию — попробуйте снова')
  return block.input as Record<string, unknown>
}

async function _callGroq(
  apiKey: string, system: string, userMessage: string, tool: AITool,
): Promise<Record<string, unknown>> {
  const res = await fetch('/groq/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: PROVIDER_INFO.groq.defaultModel,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      tools: [{
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.input_schema },
      }],
      tool_choice: 'required',
    }),
  })
  await _assertOk(res)
  const data = await res.json() as {
    choices: Array<{ message: { tool_calls?: Array<{ function: { arguments: string } }> } }>
  }
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0]
  if (!toolCall) throw new Error('AI не вернул конфигурацию — попробуйте снова')
  return JSON.parse(toolCall.function.arguments) as Record<string, unknown>
}

async function _callGemini(
  apiKey: string, system: string, userMessage: string, tool: AITool,
): Promise<Record<string, unknown>> {
  const model = PROVIDER_INFO.gemini.defaultModel
  const res = await fetch(`/gemini/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
      tools: [{ function_declarations: [{ name: tool.name, description: tool.description, parameters: tool.input_schema }] }],
      tool_config: { function_calling_config: { mode: 'ANY' } },
    }),
  })
  await _assertOk(res)
  const data = await res.json() as {
    candidates: Array<{ content: { parts: Array<{ functionCall?: { args: unknown } }> } }>
  }
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)
  if (!part?.functionCall) throw new Error('AI не вернул конфигурацию — попробуйте снова')
  return part.functionCall.args as Record<string, unknown>
}
