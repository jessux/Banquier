import { all, get, run } from '../db'
import type { ChatThread, StoredChatMessage, ChatMemory } from '../../shared/types'

const DEFAULT_THREAD_TITLE = 'Nouvelle conversation'

function parseToolCalls(raw: string | null): string[] | undefined {
  if (!raw) return undefined
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) && arr.length > 0 ? arr : undefined
  } catch {
    return undefined
  }
}

export async function createChatThread(title = DEFAULT_THREAD_TITLE): Promise<ChatThread> {
  const now = new Date().toISOString()
  const result = await run('INSERT INTO chat_threads (title, created_at, updated_at) VALUES (?, ?, ?)', [
    title,
    now,
    now
  ])
  return get<ChatThread>('SELECT * FROM chat_threads WHERE id = ?', [result.lastInsertRowid]) as Promise<ChatThread>
}

export async function getChatThreads(): Promise<ChatThread[]> {
  return all<ChatThread>('SELECT * FROM chat_threads ORDER BY updated_at DESC')
}

export async function getChatMessages(threadId: number): Promise<StoredChatMessage[]> {
  const rows = await all<{
    id: number
    thread_id: number
    role: string
    content: string
    tool_calls: string | null
    reasoning: string | null
    created_at: string
  }>('SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY id ASC', [threadId])
  return rows.map((r) => ({
    id: r.id,
    thread_id: r.thread_id,
    role: r.role as 'user' | 'assistant',
    content: r.content,
    toolCalls: parseToolCalls(r.tool_calls),
    reasoning: r.reasoning ?? undefined,
    created_at: r.created_at
  }))
}

export async function addChatMessage(
  threadId: number,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: string[],
  reasoning?: string
): Promise<void> {
  const now = new Date().toISOString()
  await run(
    'INSERT INTO chat_messages (thread_id, role, content, tool_calls, reasoning, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [threadId, role, content, toolCalls?.length ? JSON.stringify(toolCalls) : null, reasoning || null, now]
  )
  await run('UPDATE chat_threads SET updated_at = ? WHERE id = ?', [now, threadId])
}

export async function autoTitleChatThread(threadId: number, firstUserMessage: string): Promise<void> {
  const thread = await get<{ title: string }>('SELECT title FROM chat_threads WHERE id = ?', [threadId])
  if (!thread || thread.title !== DEFAULT_THREAD_TITLE) return
  const title = firstUserMessage.trim().replace(/\s+/g, ' ').slice(0, 50) || DEFAULT_THREAD_TITLE
  await run('UPDATE chat_threads SET title = ? WHERE id = ?', [title, threadId])
}

export async function renameChatThread(id: number, title: string): Promise<void> {
  await run('UPDATE chat_threads SET title = ? WHERE id = ?', [title.trim() || DEFAULT_THREAD_TITLE, id])
}

export async function deleteChatThread(id: number): Promise<void> {
  await run('DELETE FROM chat_messages WHERE thread_id = ?', [id])
  await run('DELETE FROM chat_threads WHERE id = ?', [id])
}

export async function addChatMemory(content: string): Promise<ChatMemory> {
  const now = new Date().toISOString()
  const result = await run('INSERT INTO chat_memories (content, created_at) VALUES (?, ?)', [content.trim(), now])
  return get<ChatMemory>('SELECT * FROM chat_memories WHERE id = ?', [result.lastInsertRowid]) as Promise<ChatMemory>
}

export async function getChatMemories(): Promise<ChatMemory[]> {
  return all<ChatMemory>('SELECT * FROM chat_memories ORDER BY id DESC')
}

export async function deleteChatMemory(id: number): Promise<void> {
  await run('DELETE FROM chat_memories WHERE id = ?', [id])
}
