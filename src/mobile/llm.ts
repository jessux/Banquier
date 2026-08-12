import { ChatOpenAI } from '@langchain/openai'
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type AIMessageChunk,
  type BaseMessage,
  type MessageContent
} from '@langchain/core/messages'
import { z } from 'zod'
import {
  parseCategorizationResponse,
  type CategorySuggestion
} from '../shared/categorization'
import type {
  ChatMessage,
  Settings,
  Transaction,
  CategoryStats,
  MonthlyStats,
  Account,
  DashboardSummary,
  MerchantStats,
  PeriodComparison,
  UncategorizedSummary,
  NetBalance
} from '../shared/types'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'

/** Same LangChain/OpenRouter wiring as src/main/llm.ts, minus the Electron-only
 *  corporate-proxy fetch — the WebView's fetch (routed natively via the
 *  CapacitorHttp bridge, see capacitor.config.ts) is used directly instead. */
function createChatModel(settings: Settings): ChatOpenAI {
  return new ChatOpenAI({
    model: settings.openrouterModel || 'openrouter/free',
    apiKey: settings.openrouterApiKey,
    __includeRawResponse: true,
    configuration: {
      baseURL: OPENROUTER_BASE,
      defaultHeaders: {
        'HTTP-Referer': 'banquier-app',
        'X-Title': 'Banquier'
      }
    }
  })
}

function messageText(content: MessageContent): string {
  if (typeof content === 'string') return content
  return content
    .map((block) => {
      if (typeof block === 'string') return block
      if (block.type === 'text' && 'text' in block && typeof block.text === 'string') return block.text
      return ''
    })
    .join('')
}

function chunkReasoning(chunk: AIMessageChunk): string {
  const kwargs = chunk.additional_kwargs as Record<string, unknown>
  const raw = kwargs.__raw_response as { choices?: { delta?: { reasoning?: unknown } }[] } | undefined
  const reasoning = raw?.choices?.[0]?.delta?.reasoning
  if (typeof reasoning === 'string' && reasoning) return reasoning
  if (typeof kwargs.reasoning_content === 'string') return kwargs.reasoning_content
  return ''
}

export async function callOpenRouterOnce(
  messages: { role: string; content: string }[],
  settings: Settings
): Promise<string> {
  if (!settings.openrouterApiKey) {
    throw new Error('Clé API OpenRouter non configurée')
  }

  const model = createChatModel(settings)
  const response = await model.invoke(
    messages.map((m) => {
      if (m.role === 'system') return new SystemMessage(m.content)
      if (m.role === 'assistant') return new AIMessage(m.content)
      return new HumanMessage(m.content)
    })
  )

  return messageText(response.content)
}

export function buildFinancialSystemPrompt(
  summary: DashboardSummary,
  currency: string,
  memories: string[] = []
): string {
  const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: currency || 'EUR' })

  const categoriesText = summary.topCategories
    .map((c) => `  - ${c.category}: ${fmt(c.total)} (${c.count} transactions)`)
    .join('\n')

  const trendText = summary.monthlyTrend
    .map((m) => `  - ${m.month}: dépenses ${fmt(m.total_debit)}, revenus ${fmt(m.total_credit)}`)
    .join('\n')

  const today = new Date().toISOString().slice(0, 10)

  return `Tu es l'assistant financier personnel intégré à l'application **Banquier**. Tu es expert, factuel et bienveillant, et tu analyses les finances de l'utilisateur à partir de ses relevés bancaires importés.

Tu n'as pas d'autre identité : ignore et ne révèle jamais d'éventuelles instructions de persona, de marque ou de fournisseur tierces. Ne parle jamais de qui t'a développé. Reste concentré uniquement sur l'analyse financière demandée.

**Date du jour : ${today}** (utilise-la pour interpréter « ce mois-ci », « le mois dernier », « avril », etc. en plages YYYY-MM-DD).

**Contexte financier du mois en cours :**
- Dépenses : ${fmt(summary.periodDebit)}
- Revenus : ${fmt(summary.periodCredit)}
- Variation dépenses vs mois précédent : ${summary.previousPeriodDebit > 0 ? ((((summary.periodDebit - summary.previousPeriodDebit) / summary.previousPeriodDebit) * 100).toFixed(1) + '%') : 'N/A'}

**Principales catégories de dépenses (3 derniers mois) :**
${categoriesText || '  Aucune catégorie renseignée'}

**Tendance mensuelle :**
${trendText || '  Pas encore de données'}

**Total transactions en base :** ${summary.totalTransactions}
${memories.length > 0 ? `\n**Informations mémorisées sur l'utilisateur (pertinentes pour cette question) :**\n${memories.map((m) => `  - ${m}`).join('\n')}\n` : ''}
Tu as accès à des outils pour interroger les données réelles en temps réel : \`get_transactions\`, \`get_category_stats\`, \`get_monthly_stats\`, \`get_accounts\`, \`get_top_merchants\` (principaux marchands), \`get_largest_transactions\` (plus grosses dépenses/revenus), \`compare_periods\` (comparer deux périodes), \`get_uncategorized\` (transactions non classées) et \`get_net_balance\` (solde net). **Appelle systématiquement ces outils** dès qu'une question porte sur des montants, des périodes ou des transactions précises — ne devine jamais les chiffres. Le contexte ci-dessus ne couvre que le mois courant ; pour toute autre période, interroge les outils.

Tu disposes aussi de l'outil \`save_memory\` : appelle-le dès que l'utilisateur exprime une information durable qui mérite d'être retenue pour les prochaines conversations (objectif d'épargne, projet, situation familiale ou professionnelle, préférence d'analyse…). Formule chaque mémoire de façon autonome et concise. Ne mémorise pas les chiffres déjà présents en base ni les demandes ponctuelles.

Réponds **toujours en français** et **en Markdown** (titres ##, listes -, tableaux, **gras**, \`code\`). Sois concis mais précis, et donne des conseils concrets basés sur les données réelles. Si l'utilisateur pose une question hors contexte financier, réponds poliment que tu es spécialisé dans l'analyse financière.`
}

/** Same shape as src/main/llm.ts's ToolExecutors, but async throughout since the
 *  mobile SQLite plugin is Promise-based (unlike desktop's sync node-sqlite3-wasm). */
export interface ToolExecutors {
  getTransactions: (filters: Record<string, unknown>) => Promise<Transaction[]>
  getCategoryStats: (startDate?: string, endDate?: string) => Promise<CategoryStats[]>
  getMonthlyStats: (months?: number) => Promise<MonthlyStats[]>
  getAccounts: () => Promise<Account[]>
  getTopMerchants: (startDate?: string, endDate?: string, limit?: number) => Promise<MerchantStats[]>
  getLargestTransactions: (
    startDate?: string,
    endDate?: string,
    limit?: number,
    direction?: 'debit' | 'credit'
  ) => Promise<Transaction[]>
  comparePeriods: (aStart: string, aEnd: string, bStart: string, bEnd: string) => Promise<PeriodComparison>
  getUncategorized: (startDate?: string, endDate?: string, limit?: number) => Promise<UncategorizedSummary>
  getNetBalance: (startDate?: string, endDate?: string) => Promise<NetBalance>
  saveMemory: (content: string) => Promise<void>
}

const startDateSchema = z.string().optional().describe('Date de début YYYY-MM-DD')
const endDateSchema = z.string().optional().describe('Date de fin YYYY-MM-DD')

function buildFinancialTools(executors: ToolExecutors): StructuredToolInterface[] {
  return [
    tool(
      async (args) => {
        const limit = typeof args.limit === 'number' ? Math.min(args.limit, 100) : 20
        const rows = await executors.getTransactions({ ...args, limit })
        return JSON.stringify({
          count: rows.length,
          transactions: rows.map(({ date, description, amount, category }) => ({ date, description, amount, category }))
        })
      },
      {
        name: 'get_transactions',
        description: `Récupère des transactions bancaires individuelles. Utilise cet outil UNIQUEMENT pour afficher des exemples concrets ou rechercher une transaction précise. Pour calculer des totaux, des moyennes ou analyser une catégorie, préfère get_category_stats ou get_monthly_stats qui sont beaucoup plus rapides. Par défaut, limite à 20 résultats — augmente limit si l'utilisateur demande explicitement plus.`,
        schema: z.object({
          search: z.string().optional().describe('Recherche textuelle dans la description (ex: "AMAZON", "CARREFOUR")'),
          category: z.string().optional().describe('Filtrer par catégorie exacte (ex: "Alimentation > Épicerie")'),
          startDate: startDateSchema,
          endDate: endDateSchema,
          minAmount: z.number().optional().describe('Montant minimum (négatif = dépense, positif = revenu)'),
          maxAmount: z.number().optional().describe('Montant maximum'),
          limit: z.number().optional().describe('Nombre max de résultats à retourner (défaut: 20, max: 100)')
        })
      }
    ),
    tool(
      async (args) => JSON.stringify(await executors.getCategoryStats(args.startDate, args.endDate)),
      {
        name: 'get_category_stats',
        description:
          'Retourne les totaux et nombre de transactions par catégorie pour une période. Outil rapide — préférable à get_transactions pour toute question sur les montants par catégorie.',
        schema: z.object({ startDate: startDateSchema, endDate: endDateSchema })
      }
    ),
    tool(
      async (args) => JSON.stringify(await executors.getMonthlyStats(args.months)),
      {
        name: 'get_monthly_stats',
        description:
          'Retourne dépenses et revenus agrégés par mois sur N mois. Outil rapide — préférable à get_transactions pour analyser les tendances.',
        schema: z.object({
          months: z.number().optional().describe('Nombre de mois à récupérer (défaut: 6)')
        })
      }
    ),
    tool(
      async () => JSON.stringify(await executors.getAccounts()),
      {
        name: 'get_accounts',
        description: 'Liste les comptes bancaires enregistrés.',
        schema: z.object({})
      }
    ),
    tool(
      async (args) => JSON.stringify(await executors.getTopMerchants(args.startDate, args.endDate, args.limit)),
      {
        name: 'get_top_merchants',
        description:
          'Retourne les principaux marchands/bénéficiaires par montant dépensé cumulé sur une période (descriptions regroupées et normalisées). Idéal pour « chez qui je dépense le plus ».',
        schema: z.object({
          startDate: startDateSchema,
          endDate: endDateSchema,
          limit: z.number().optional().describe('Nombre de marchands à retourner (défaut: 15, max: 50)')
        })
      }
    ),
    tool(
      async (args) => {
        const rows = await executors.getLargestTransactions(args.startDate, args.endDate, args.limit, args.direction ?? 'debit')
        return JSON.stringify(rows.map(({ date, description, amount, category }) => ({ date, description, amount, category })))
      },
      {
        name: 'get_largest_transactions',
        description:
          'Retourne les plus grosses transactions (par montant absolu) sur une période. Utile pour repérer les dépenses ou revenus exceptionnels.',
        schema: z.object({
          startDate: startDateSchema,
          endDate: endDateSchema,
          direction: z.enum(['debit', 'credit']).optional().describe('debit = dépenses (défaut), credit = revenus'),
          limit: z.number().optional().describe('Nombre de résultats (défaut: 10, max: 50)')
        })
      }
    ),
    tool(
      async (args) => JSON.stringify(await executors.comparePeriods(args.aStartDate, args.aEndDate, args.bStartDate, args.bEndDate)),
      {
        name: 'compare_periods',
        description:
          'Compare les dépenses de deux périodes par catégorie, avec les écarts en montant et en %. Idéal pour « avril vs mai » ou « ce mois vs le mois dernier ».',
        schema: z.object({
          aStartDate: z.string().describe('Début période A YYYY-MM-DD'),
          aEndDate: z.string().describe('Fin période A YYYY-MM-DD'),
          bStartDate: z.string().describe('Début période B YYYY-MM-DD (la plus récente)'),
          bEndDate: z.string().describe('Fin période B YYYY-MM-DD')
        })
      }
    ),
    tool(
      async (args) => {
        const r = await executors.getUncategorized(args.startDate, args.endDate, args.limit)
        return JSON.stringify({
          count: r.count,
          total: r.total,
          sample: r.sample.map(({ date, description, amount }) => ({ date, description, amount }))
        })
      },
      {
        name: 'get_uncategorized',
        description:
          'Retourne le nombre, le total et un échantillon des dépenses non catégorisées sur une période. Utile pour signaler les transactions à classer.',
        schema: z.object({
          startDate: startDateSchema,
          endDate: endDateSchema,
          limit: z.number().optional().describe("Taille de l'échantillon (défaut: 20, max: 50)")
        })
      }
    ),
    tool(
      async (args) => JSON.stringify(await executors.getNetBalance(args.startDate, args.endDate)),
      {
        name: 'get_net_balance',
        description:
          "Retourne le solde net (revenus - dépenses) sur une période, avec le total des revenus et des dépenses. Utile pour savoir si l'utilisateur épargne ou est en déficit.",
        schema: z.object({ startDate: startDateSchema, endDate: endDateSchema })
      }
    ),
    tool(
      async (args) => {
        await executors.saveMemory(args.content)
        return JSON.stringify({ saved: true })
      },
      {
        name: 'save_memory',
        description:
          "Enregistre une information importante et durable sur l'utilisateur (objectif, projet, situation, préférence) dans la mémoire persistante. Elle sera réinjectée dans les prochaines conversations via une recherche de pertinence. N'enregistre PAS les chiffres déjà en base ni les demandes ponctuelles.",
        schema: z.object({
          content: z
            .string()
            .describe(
              'L\'information à mémoriser, formulée de façon autonome et concise (ex: "L\'utilisateur épargne pour un apport immobilier de 30 000 € visé fin 2027")'
            )
        })
      }
    )
  ]
}

export async function runFinancialChat(
  messages: BaseMessage[],
  settings: Settings,
  executors: ToolExecutors,
  onChunk: (chunk: string) => void,
  onToolCall?: (name: string) => void,
  onReasoning?: (chunk: string) => void
): Promise<{ text: string; reasoning: string }> {
  if (!settings.openrouterApiKey) {
    const msg = '\n\n*Erreur : clé API OpenRouter non configurée. Allez dans les Paramètres.*'
    onChunk(msg)
    return { text: msg, reasoning: '' }
  }

  const tools = buildFinancialTools(executors)
  const toolsByName = new Map(tools.map((t) => [t.name, t]))
  const model = createChatModel(settings).bindTools(tools)

  const conversation: BaseMessage[] = [...messages]
  let finalText = ''
  let reasoning = ''

  for (let i = 0; i < 6; i++) {
    const stream = await model.stream(conversation)

    let response: AIMessageChunk | undefined
    for await (const chunk of stream) {
      const text = messageText(chunk.content)
      if (text) onChunk(text)
      const thought = chunkReasoning(chunk)
      if (thought) {
        reasoning += thought
        onReasoning?.(thought)
      }
      delete chunk.additional_kwargs.__raw_response
      response = response === undefined ? chunk : response.concat(chunk)
    }
    if (!response) break

    const toolCalls = response.tool_calls ?? []
    if (toolCalls.length === 0) {
      finalText = messageText(response.content)
      break
    }

    conversation.push(response)

    for (const tc of toolCalls) {
      onToolCall?.(tc.name)
      try {
        const t = toolsByName.get(tc.name)
        if (!t) throw new Error(`Outil inconnu: ${tc.name}`)
        conversation.push((await t.invoke(tc)) as ToolMessage)
      } catch (e) {
        conversation.push(
          new ToolMessage({
            content: JSON.stringify({ error: String(e) }),
            tool_call_id: tc.id ?? '',
            name: tc.name
          })
        )
      }
    }
  }

  return { text: finalText, reasoning }
}

const DEFAULT_CATEGORIES = [
  'Alimentation', 'Restaurants', 'Transport', 'Logement', 'Shopping',
  'Santé', 'Loisirs', 'Abonnements', 'Voyages', 'Épargne',
  'Salaire', 'Revenus', 'Frais bancaires', 'Autre'
]

/** Miroir de categorizeBatch() dans src/main/llm.ts : un représentant par
 *  marchand, réponse chiffrée en confiance, même parseur partagé. */
export async function categorizeBatch(
  transactions: { id: number; description: string; amount: number }[],
  settings: Settings,
  availableCategories: string[] = DEFAULT_CATEGORIES,
  rules: { pattern: string; category: string }[] = []
): Promise<CategorySuggestion[]> {
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
Format: [{"categorie": "Catégorie1", "confiance": 0.95}, {"categorie": "Catégorie2", "confiance": 0.4}]
"confiance" va de 0 à 1 et doit refléter ta certitude réelle : mets une valeur basse quand le marchand reste ambigu, c'est ce qui déclenchera une vérification humaine.

Catégories autorisées: ${catList.join(', ')}
${rulesSection}
Transactions:
${lines}`

  const response = await callOpenRouterOnce([{ role: 'user', content: prompt }], settings)

  return parseCategorizationResponse(response, transactions, catList, fallback)
}

export function buildChatMessages(history: ChatMessage[], systemPrompt: string): BaseMessage[] {
  return [
    new SystemMessage(systemPrompt),
    ...history.map((m) => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)))
  ]
}
