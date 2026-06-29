export interface ClaudeTextBlock { type: 'text'; text: string }
export interface ClaudeToolUseBlock { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
export type ClaudeContentBlock = ClaudeTextBlock | ClaudeToolUseBlock
export interface ClaudeResponse {
  content: ClaudeContentBlock[]
  stop_reason: string
  usage: { input_tokens: number; output_tokens: number }
}
export interface ClaudeTool { name: string; description: string; input_schema: object }

export async function callClaude(
  apiKey: string,
  system: string,
  userMessage: string,
  tools: ClaudeTool[],
  model = 'claude-haiku-4-5-20251001',
): Promise<ClaudeResponse> {
  const res = await fetch('/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: userMessage }],
      tools,
      tool_choice: { type: 'any' },
    }),
  })
  if (!res.ok) {
    let detail = ''
    try { const j = await res.json(); detail = j.error?.message ?? JSON.stringify(j) }
    catch { detail = await res.text() }
    throw new Error(`Ошибка API ${res.status}: ${detail}`)
  }
  return res.json() as Promise<ClaudeResponse>
}
