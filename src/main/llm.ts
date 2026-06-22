import nodeFetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { ChatMessage, Settings, Transaction, CategoryStats, MonthlyStats, Account } from '../shared/types'
import type { DashboardSummary } from '../shared/types'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

function getAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

function openRouterHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'banquier-app',
    'X-Title': 'Banquier'
  }
}

export async function callOpenRouterStream(
  messages: { role: string; content: string }[],
  settings: Settings,
  onChunk: (chunk: string) => void
): Promise<void> {
  if (!settings.openrouterApiKey) {
    onChunk('\n\n*Erreur : clé API OpenRouter non configurée. Allez dans les Paramètres.*')
    return
  }

  const response = await nodeFetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(settings.openrouterApiKey),
    agent: getAgent(),
    body: JSON.stringify({
      model: settings.openrouterModel || 'anthropic/claude-sonnet-4-5',
      messages,
      stream: true
    })
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${err}`)
  }

  let buffer = ''
  for await (const rawChunk of response.body!) {
    buffer += (rawChunk as Buffer).toString('utf-8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const parsed = JSON.parse(data)
        const content = parsed.choices?.[0]?.delta?.content
        if (content) onChunk(content)
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
}

export async function callOpenRouterOnce(
  messages: { role: string; content: string }[],
  settings: Settings
): Promise<string> {
  if (!settings.openrouterApiKey) {
    throw new Error('Clé API OpenRouter non configurée')
  }

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  console.log(`[llm] callOpenRouterOnce — model: ${settings.openrouterModel}, proxy: ${proxyUrl ?? 'none'}`)

  const response = await nodeFetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: openRouterHeaders(settings.openrouterApiKey),
    agent: getAgent(),
    body: JSON.stringify({
      model: settings.openrouterModel || 'anthropic/claude-sonnet-4-5',
      messages,
      stream: false
    })
  })

  console.log(`[llm] response status: ${response.status}`)

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${err}`)
  }

  const json = (await response.json()) as {
    choices?: { message: { content: string } }[]
    error?: { message?: string; code?: number }
  }
  if (json.error) {
    throw new Error(`OpenRouter: ${json.error.message ?? JSON.stringify(json.error)}`)
  }
  const content = json.choices?.[0]?.message?.content ?? ''
  console.log(`[llm] response content length: ${content.length} chars`)
  return content
}

export function buildFinancialSystemPrompt(summary: DashboardSummary, currency: string): string {
  const fmt = (n: number) =>
    n.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' })

  const categoriesText = summary.topCategories
    .map((c) => `  - ${c.category}: ${fmt(c.total)} (${c.count} transactions)`)
    .join('\n')

  const trendText = summary.monthlyTrend
    .map((m) => `  - ${m.month}: dépenses ${fmt(m.total_debit)}, revenus ${fmt(m.total_credit)}`)
    .join('\n')

  return `Tu es un conseiller financier personnel expert et bienveillant. Tu analyses les finances de l'utilisateur à partir de ses relevés bancaires importés dans l'application.

**Contexte financier du mois en cours :**
- Dépenses : ${fmt(summary.periodDebit)}
- Revenus : ${fmt(summary.periodCredit)}
- Variation dépenses vs mois précédent : ${summary.previousPeriodDebit > 0 ? ((((summary.periodDebit - summary.previousPeriodDebit) / summary.previousPeriodDebit) * 100).toFixed(1) + '%') : 'N/A'}

**Principales catégories de dépenses (3 derniers mois) :**
${categoriesText || '  Aucune catégorie renseignée'}

**Tendance mensuelle :**
${trendText || '  Pas encore de données'}

**Total transactions en base :** ${summary.totalTransactions}

Tu as accès à des outils pour interroger les données en temps réel (transactions, stats, comptes). Utilise-les si la question demande des données précises ou récentes.

Réponds **toujours en français** et **en Markdown** (titres ##, listes -, tableaux, **gras**, \`code\`). Sois concis mais précis, et donne des conseils concrets basés sur les données réelles. Si l'utilisateur pose une question hors contexte financier, réponds poliment que tu es spécialisé dans l'analyse financière.`
}

export type LlmToolName = 'get_transactions' | 'get_category_stats' | 'get_monthly_stats' | 'get_accounts'

export interface LlmToolCall {
  id: string
  name: LlmToolName
  arguments: Record<string, unknown>
}

export const FINANCIAL_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_transactions',
      description: `Récupère des transactions bancaires individuelles. Utilise cet outil UNIQUEMENT pour afficher des exemples concrets ou rechercher une transaction précise. Pour calculer des totaux, des moyennes ou analyser une catégorie, préfère get_category_stats ou get_monthly_stats qui sont beaucoup plus rapides. Par défaut, limite à 20 résultats — augmente limit si l'utilisateur demande explicitement plus.`,
      parameters: {
        type: 'object',
        properties: {
          search: { type: 'string', description: 'Recherche textuelle dans la description (ex: "AMAZON", "CARREFOUR")' },
          category: { type: 'string', description: 'Filtrer par catégorie exacte (ex: "Alimentation > Épicerie")' },
          startDate: { type: 'string', description: 'Date de début YYYY-MM-DD' },
          endDate: { type: 'string', description: 'Date de fin YYYY-MM-DD' },
          minAmount: { type: 'number', description: 'Montant minimum (négatif = dépense, positif = revenu)' },
          maxAmount: { type: 'number', description: 'Montant maximum' },
          limit: { type: 'number', description: 'Nombre max de résultats à retourner (défaut: 20, max: 100)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_category_stats',
      description: 'Retourne les totaux et nombre de transactions par catégorie pour une période. Outil rapide — préférable à get_transactions pour toute question sur les montants par catégorie.',
      parameters: {
        type: 'object',
        properties: {
          startDate: { type: 'string', description: 'Date de début YYYY-MM-DD' },
          endDate: { type: 'string', description: 'Date de fin YYYY-MM-DD' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_stats',
      description: 'Retourne dépenses et revenus agrégés par mois sur N mois. Outil rapide — préférable à get_transactions pour analyser les tendances.',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Nombre de mois à récupérer (défaut: 6)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_accounts',
      description: 'Liste les comptes bancaires enregistrés.',
      parameters: { type: 'object', properties: {} }
    }
  }
]

export interface ToolExecutors {
  getTransactions: (filters: Record<string, unknown>) => Transaction[]
  getCategoryStats: (startDate?: string, endDate?: string) => CategoryStats[]
  getMonthlyStats: (months?: number) => MonthlyStats[]
  getAccounts: () => Account[]
}

interface OpenRouterMessage {
  role: string
  content: string | null
  tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  name?: string
}

function executeToolCall(call: LlmToolCall, executors: ToolExecutors): string {
  const args = call.arguments
  try {
    let result: unknown
    if (call.name === 'get_transactions') {
      const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20
      const rows = executors.getTransactions({ ...args, limit })
      result = {
        count: rows.length,
        transactions: rows.map(({ date, description, amount, category }) => ({ date, description, amount, category }))
      }
    } else if (call.name === 'get_category_stats') {
      result = executors.getCategoryStats(args.startDate as string | undefined, args.endDate as string | undefined)
    } else if (call.name === 'get_monthly_stats') {
      result = executors.getMonthlyStats(args.months as number | undefined)
    } else if (call.name === 'get_accounts') {
      result = executors.getAccounts()
    }
    return JSON.stringify(result)
  } catch (e) {
    return JSON.stringify({ error: String(e) })
  }
}

export async function callOpenRouterWithTools(
  messages: OpenRouterMessage[],
  settings: Settings,
  executors: ToolExecutors,
  onToolCall?: (name: string) => void
): Promise<OpenRouterMessage[]> {
  if (!settings.openrouterApiKey) return messages

  const conversationMessages = [...messages]

  for (let i = 0; i < 5; i++) {
    const response = await nodeFetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: openRouterHeaders(settings.openrouterApiKey),
      agent: getAgent(),
      body: JSON.stringify({
        model: settings.openrouterModel || 'anthropic/claude-sonnet-4-5',
        messages: conversationMessages,
        tools: FINANCIAL_TOOLS,
        stream: false
      })
    })

    if (!response.ok) {
      const err = await response.text()
      throw new Error(`OpenRouter error ${response.status}: ${err}`)
    }

    const json = (await response.json()) as {
      choices?: { message: OpenRouterMessage; finish_reason: string }[]
      error?: { message?: string }
    }

    if (json.error) throw new Error(`OpenRouter: ${json.error.message}`)

    const choice = json.choices?.[0]
    if (!choice) break

    conversationMessages.push(choice.message)

    if (choice.finish_reason !== 'tool_calls' || !choice.message.tool_calls?.length) break

    for (const tc of choice.message.tool_calls) {
      let parsedArgs: Record<string, unknown> = {}
      try { parsedArgs = JSON.parse(tc.function.arguments) } catch { /* empty args */ }

      onToolCall?.(tc.function.name)

      const toolResult = executeToolCall(
        { id: tc.id, name: tc.function.name as LlmToolName, arguments: parsedArgs },
        executors
      )

      conversationMessages.push({
        role: 'tool',
        content: toolResult,
        tool_call_id: tc.id,
        name: tc.function.name
      })
    }
  }

  return conversationMessages
}

const DEFAULT_CATEGORIES = [
  'Alimentation', 'Restaurants', 'Transport', 'Logement', 'Shopping',
  'Santé', 'Loisirs', 'Abonnements', 'Voyages', 'Épargne',
  'Salaire', 'Revenus', 'Remboursement', 'Frais bancaires', 'Autre'
]

export async function categorizeBatch(
  transactions: { id: number; description: string; amount: number }[],
  settings: Settings,
  availableCategories: string[] = DEFAULT_CATEGORIES,
  rules: { pattern: string; category: string }[] = []
): Promise<{ id: number; category: string }[]> {
  const catList = availableCategories.length > 0 ? availableCategories : DEFAULT_CATEGORIES
  const fallback = catList.includes('Autre') ? 'Autre' : catList[catList.length - 1]

  const lines = transactions
    .map((t, i) => `${i + 1}. ${t.description} (${t.amount > 0 ? '+' : ''}${t.amount}€)`)
    .join('\n')

  const rulesSection = rules.length > 0
    ? `\nRègles de catégorisation de l'utilisateur (respecte-les pour les descriptions similaires) :\n${rules.map((r) => `- Pattern "${r.pattern}" → "${r.category}"`).join('\n')}\n`
    : ''

  const prompt = `Catégorise ces transactions bancaires françaises.
Retourne UNIQUEMENT un tableau JSON valide, dans le même ordre, avec exactement ${transactions.length} éléments.
Format: ["Catégorie1", "Catégorie2", ...]

Catégories autorisées: ${catList.join(', ')}
${rulesSection}
Transactions:
${lines}`

  const response = await callOpenRouterOnce([{ role: 'user', content: prompt }], settings)

  const match = response.match(/\[[\s\S]*?\]/)
  if (!match) return []

  try {
    const categories = JSON.parse(match[0]) as string[]
    return transactions.map((t, i) => ({
      id: t.id,
      category: catList.includes(categories[i]) ? categories[i] : fallback
    }))
  } catch {
    return []
  }
}

export function buildChatMessages(
  history: ChatMessage[],
  systemPrompt: string
): { role: string; content: string }[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content }))
  ]
}
